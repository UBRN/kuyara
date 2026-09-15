import type { AiRecommendV1Request } from '@kuyara/contracts';

import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import {
  AiProviderError,
  type AiGenerateOptions,
  type AiProvider,
} from './ai-provider.ts';

/** The ceiling a full recommendation answers under; a caller may ask for less. */
const recommendationMaxTokens = 2048;

type Options = Readonly<{
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
}>;

export class OpenRouterAiProvider implements AiProvider {
  readonly id = 'openrouter' as const;
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch | undefined;

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
    const messages = buildMessages(request);
    const responseSchema = buildPickJsonSchema(request.options);
    const response = await (this.#fetch ?? globalThis.fetch)(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: options?.maxTokens ?? recommendationMaxTokens,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'kuyara_picks',
              strict: true,
              schema: responseSchema,
            },
          },
          provider: { require_parameters: true },
        }),
      },
    );
    // An exhausted free-model allowance and a burst refusal arrive alike, as a 429 with
    // the detail in a body this adapter never reads; classify it so the log names it.
    if (response.status === 429) throw new AiProviderError('rate_limited');
    if (!response.ok) throw new Error('OpenRouter request failed.');

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenRouter response invalid.');
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('OpenRouter response invalid.');
    }
  }
}
