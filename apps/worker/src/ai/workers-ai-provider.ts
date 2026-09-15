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

/** The ceiling a full recommendation answers under; a caller may ask for less. */
const recommendationMaxTokens = 2048;

/**
 * The binding reports an account-level refusal as a plain thrown `Error` whose message
 * carries the code and text (`InferenceUpstreamError` and `AiInternalError` are declared
 * as bare `Error`s in the workerd typings, with no structured field to read). The 2026-09-13
 * outage arrived this way: the neuron allocation was spent, and the log said only
 * `provider_error`. So read the code out of the message, then throw a classified error that
 * repeats none of that text.
 *
 * `3040` is the account's daily Neuron allocation; `4006` is the code the Workers AI
 * GraphQL error counters carried on 2026-09-13 while the pool was spent. Both mean the
 * account has nothing left, not that this request was malformed.
 */
const quotaErrorCodes = new Set(['3040', '4006']);

function classifyBindingFailure(error: unknown): AiProviderError | undefined {
  const message = error instanceof Error ? error.message : '';
  const code = /(?:^|\s)(\d{4}):/.exec(message)?.[1];
  // A spent quota is often served as a 429 as well, so it is tested first.
  if ((code !== undefined && quotaErrorCodes.has(code)) || /neuron|quota/i.test(message)) {
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
    const responseSchema = buildPickJsonSchema(request.options);
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
    return response;
  }
}
