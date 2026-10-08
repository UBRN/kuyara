import type { AiRecommendV1Request, AiRecommendV2Request } from '@kuyara/contracts';

import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import {
  AiProviderError,
  logProviderUsage,
  parseModelJson,
  type AiGenerateOptions,
  type AiProvider,
} from './ai-provider.ts';

/**
 * The only models `HAIKU_MODELS` may name: `HAIKU_DAILY_ATTEMPT_LIMIT` is derived from
 * this model's price, so another model needs its own measurement and its own limit.
 */
export const haikuModels = ['claude-haiku-5-5'] as const;

/**
 * The output ceiling the daily limit is priced for; a caller may ask for less, never more.
 * Measured replies to the v2 prompt were 149 to 173 tokens, so 256 leaves room for a long
 * sentence while a runaway reply stops here and fails as an invalid response.
 */
const recommendationMaxTokens = 256;

/**
 * The longest prompt the daily limit is priced for, in characters: the largest v2 prompt
 * measured from the app's own composition is 18,485, a weekend whose warm morning turns to
 * wind and drizzle by the afternoon (a weekend is the longest, because `weekend_relaxed` stays
 * in the eligible lists, and both ends of the wardrobe stay eligible), rounded up to 18,600.
 * The daily cap refuses a longer prompt before counting or sending it, so a rarer day that
 * builds one goes on to Workers AI.
 */
export const haikuPromptCharacterLimit = 18_600;

/** The size the limit is priced on: the messages and the response schema as built. */
export function haikuPromptCharacters(request: AiRecommendV1Request | AiRecommendV2Request): number {
  return JSON.stringify(buildMessages(request)).length
    + JSON.stringify(buildPickJsonSchema(request.options, 'locale' in request)).length;
}

/**
 * The number of Haiku attempts per UTC day, sized so that a 31-day month stays inside the
 * monthly API credit that pays for them. Figures from https://platform.claude.com/docs/en/about-claude/pricing
 * (recalculate there when the prompt, the model or the pricing changes):
 *
 * - Credit: 200 USD per month; no payment card is on the account, so a spent credit refuses
 *   every call and the walk goes on with Workers AI.
 * - Rates: `claude-haiku-5-5` 0.10 USD per 1M input tokens and 0.50 per 1M output tokens
 *   (prompts up to 100,000 tokens).
 * - Input per attempt: at most `haikuPromptCharacterLimit`, 18,600 characters. The prompt is
 *   ASCII only (enum values, identifiers matching `[A-Za-z0-9:_-]` and fixed English text) and
 *   a token is at least one byte, so it is at most 18,600 tokens whatever a caller sends. The
 *   API counted the largest grid prompt at about 2.1 characters per token, so real attempts
 *   cost about half of this bound.
 * - Output per attempt: `recommendationMaxTokens`, 256 tokens.
 * - Worst attempt: 18,600 x 0.10 + 256 x 0.50 = 1,860 + 128 = 1,988 micro-USD.
 * - Limit: floor(200,000,000 / 31 / 1,988) = floor(3,245.3) = 3,245 attempts.
 *
 * 3,245 x 1,988 x 31 = 199,982,860 micro-USD < 200 USD, and that holds only while the deployed
 * Worker is the credit's one user: a local `wrangler dev` with the key spends the same credit.
 * The test in haiku-ai-provider.test.ts measures the largest prompt the app builds against the
 * character limit and derives this limit, and the `ai_provider_usage` log carries the API's own
 * token counts.
 */
export const HAIKU_DAILY_ATTEMPT_LIMIT = Math.floor(200_000_000 / 31 / 1_988);

/**
 * Structured outputs reject numeric, string-length and array-size constraints
 * (https://platform.claude.com/docs/en/build-with-claude/structured-outputs), so they are
 * dropped from the schema sent. The handler's response schema and selection gate enforce
 * exactly three picks and the sentence length either way.
 */
function withoutUnsupportedConstraints(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutUnsupportedConstraints);
  if (typeof node !== 'object' || node === null) return node;
  return Object.fromEntries(Object.entries(node)
    .filter(([key]) => !['minItems', 'maxItems', 'minLength', 'maxLength'].includes(key))
    .map(([key, value]) => [key, withoutUnsupportedConstraints(value)]));
}

/**
 * A spent credit or a reached spend limit is the account's allocation, never one attempt's
 * refusal: https://platform.claude.com/docs/en/api/errors names 402 `billing_error`, a spend
 * limit answers 429, and a low credit balance has answered 400. Only the classification is
 * kept; the body text never leaves this function.
 */
async function classifyFailure(response: Response): Promise<Error> {
  if (response.status === 402) return new AiProviderError('quota_exceeded');
  if (response.status !== 400 && response.status !== 429) {
    return new Error('Haiku request failed.');
  }
  const body = await response.text().catch(() => '');
  if (/credit|spend.?limit|billing/i.test(body)) return new AiProviderError('quota_exceeded');
  return response.status === 429
    ? new AiProviderError('rate_limited')
    : new Error('Haiku request failed.');
}

type Options = Readonly<{
  apiKey: string;
  model: (typeof haikuModels)[number];
  fetch?: FetchLike;
}>;

export class HaikuAiProvider implements AiProvider {
  readonly id = 'haiku' as const;
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetch: FetchLike | undefined;

  constructor({ apiKey, model, fetch }: Options) {
    this.model = model;
    this.#apiKey = apiKey;
    this.#fetch = fetch;
  }

  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
    options?: AiGenerateOptions,
  ): Promise<unknown> {
    const [system, user] = buildMessages(request);
    const response = await (this.#fetch ?? defaultFetch())('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.#apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: Math.min(options?.maxTokens ?? recommendationMaxTokens, recommendationMaxTokens),
        // Measured on the v2 prompt: thinking off at low effort answered in 2.3 s (p50) with
        // every pick valid; adaptive thinking doubled the time and was no more accurate.
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: {
            type: 'json_schema',
            schema: withoutUnsupportedConstraints(
              buildPickJsonSchema(request.options, 'locale' in request),
            ),
          },
        },
        system: system.content,
        messages: [{ role: 'user', content: user.content }],
      }),
    });
    if (!response.ok) throw await classifyFailure(response);

    const body = await response.json() as {
      stop_reason?: unknown;
      content?: { type?: unknown; text?: unknown }[];
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    } | null;
    // A refusal or a reply cut off at the ceiling is not the schema's answer.
    if (body?.stop_reason !== 'end_turn') throw new Error('Haiku response invalid.');
    const text = body.content?.find((block) => block.type === 'text')?.text;
    if (typeof text !== 'string') throw new Error('Haiku response invalid.');
    const output = parseModelJson(text, 'Haiku response invalid.');
    logProviderUsage(this.model, body.usage?.input_tokens, body.usage?.output_tokens);
    return output;
  }
}
