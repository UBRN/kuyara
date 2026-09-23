import type { AiRecommendV1Request } from '@kuyara/contracts';

import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import {
  AiProviderError,
  type AiGenerateOptions,
  type AiProvider,
} from './ai-provider.ts';

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

type Options = Readonly<{
  ai: WorkersAiBinding;
  model: string;
}>;

/**
 * The ceiling a full recommendation answers under; a caller may ask for less. The longest
 * valid schema-shaped reply (three picks with the longest option id and the longest
 * archetype id) is 381 characters pretty-printed, about 96 tokens at four characters per
 * token and 127 at three, so 192 is twice the estimate and above the pessimistic one. A
 * reply cut off here parses as `invalid_output` and advances the chain, which is what a
 * runaway or prose reply deserves; at the previous 2,048-token ceiling such a reply could
 * cost about 420 Neurons of output on the head model, over three recommendation attempts'
 * worth. WORKERS_AI_DAILY_ATTEMPT_LIMIT in ai-handler.ts is derived from this figure.
 */
const recommendationMaxTokens = 192;

/**
 * The binding reports an account-level refusal as a thrown `InferenceUpstreamError` whose
 * message the runtime formats as `${internalCode}: ${description}` (the workerd typings
 * declare it as a bare `Error`, with no structured field on the thrown value). The
 * 2026-09-13 outage arrived this way: the neuron allocation was spent, and the log said
 * only `provider_error`. So read the code out of the message, then throw a classified
 * error that repeats none of that text.
 *
 * The codes are the closed set on
 * https://developers.cloudflare.com/workers-ai/platform/errors/:
 * - `3036` "Account limited" (HTTP 429): the daily free allocation of 10,000 Neurons is
 *   used up. The pool is account-level, so the handler skips the other Workers AI models.
 * - `3040` "Out of capacity" (HTTP 429): no data center can take the request. That is an
 *   availability refusal of this one attempt, so it is `rate_limited`, never quota; the
 *   next Workers AI model keeps its turn.
 * `4006` is not in that table: it was the GraphQL analytics `errorCode` read on
 * 2026-09-13 and never reaches the binding, so it is not matched here.
 */
const quotaErrorCodes = new Set(['3036']);
const capacityErrorCodes = new Set(['3040']);

function classifyBindingFailure(error: unknown): AiProviderError | undefined {
  const message = error instanceof Error ? error.message : '';
  const code = /(?:^|\s)(\d{4}):/.exec(message)?.[1];
  if (code !== undefined && quotaErrorCodes.has(code)) {
    return new AiProviderError('quota_exceeded');
  }
  if (code !== undefined && capacityErrorCodes.has(code)) {
    return new AiProviderError('rate_limited');
  }
  // Secondary signal for a message without a recognised code: the documented 3036 wording
  // names "neurons"; a spent allocation is a 429 too, so it is tested before the rate limit.
  if (/neurons?\b/i.test(message)) {
    return new AiProviderError('quota_exceeded');
  }
  if (/\b429\b|too many requests|rate limit/i.test(message)) {
    return new AiProviderError('rate_limited');
  }
  return undefined;
}

export class WorkersAiProvider implements AiProvider {
  readonly id = 'workers-ai' as const;
  readonly options: Options;

  get model(): string {
    return this.options.model;
  }

  constructor(options: Options) {
    this.options = options;
  }

  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
    options?: AiGenerateOptions,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const messages = buildMessages(request);
    const responseSchema = buildPickJsonSchema(request.options, 'locale' in request);
    let result: unknown;
    try {
      // ponytail: binding takes no AbortSignal; the handler's per-attempt race bounds it.
      result = await this.options.ai.run(this.options.model, {
        max_tokens: options?.maxTokens ?? recommendationMaxTokens,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: responseSchema,
        },
      });
    } catch (error) {
      throw classifyBindingFailure(error) ?? error;
    }
    if (typeof result !== 'object' || result === null || !Object.hasOwn(result, 'response')) {
      throw new Error('Workers AI response invalid.');
    }
    const response = (result as { response: unknown }).response;
    if (typeof response !== 'object' || response === null || Array.isArray(response)) {
      throw new Error('Workers AI response invalid.');
    }
    logUsage(this.options.model, (result as { usage?: unknown }).usage);
    return response;
  }
}

/**
 * The binding's synchronous output documents a `usage` object with `prompt_tokens` and
 * `completion_tokens`. Logged as two integers, they are the measured check on the
 * characters-over-four estimate behind WORKERS_AI_DAILY_ATTEMPT_LIMIT. Nothing is
 * persisted, no text leaves the Worker, and a missing or malformed object logs nothing.
 */
function logUsage(model: string, usage: unknown): void {
  if (typeof usage !== 'object' || usage === null) return;
  const { prompt_tokens: promptTokens, completion_tokens: completionTokens } =
    usage as { prompt_tokens?: unknown; completion_tokens?: unknown };
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return;
  console.info({
    event: 'ai_provider_usage',
    model,
    promptTokens: Math.trunc(promptTokens as number),
    completionTokens: Math.trunc(completionTokens as number),
  });
}
