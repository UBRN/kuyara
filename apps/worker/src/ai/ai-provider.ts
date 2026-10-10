import type { AiProbeV2ProviderId, AiRecommendV1Request, AiRecommendV2Request } from '@kuyara/contracts';

import { AttemptTimeoutError } from '../attempt-timeout.ts';

/**
 * Failure classification shared by every AI provider adapter, mirroring
 * `WeatherProviderError`. An adapter raises one of these kinds so the handler can
 * log why an attempt failed; it must never place raw provider payloads,
 * credentials, or upstream error text into the thrown error.
 *
 * `quota_exceeded` is an allocation the account has spent (the Workers AI daily Neuron
 * pool, OpenRouter credits); `rate_limited` is a refusal of this one attempt (a burst or
 * request cap, or an upstream out of capacity). Every provider failure, classified or
 * not, remains fallback-eligible exactly as before; the one consumer that acts on a kind
 * is the handler's Workers AI pool-spent skip, which fires on `quota_exceeded` only.
 */
export const aiProviderErrorKinds = ['quota_exceeded', 'rate_limited'] as const;

export type AiProviderErrorKind = (typeof aiProviderErrorKinds)[number];

export class AiProviderError extends Error {
  readonly kind: AiProviderErrorKind;

  constructor(kind: AiProviderErrorKind) {
    super(`AI provider failed: ${kind}`);
    this.name = 'AiProviderError';
    this.kind = kind;
  }
}

/**
 * Every reason a provider attempt can fail, as the closed vocabulary the handlers log. The
 * recommend handler uses all of them; the probe logs the subset it can reach, and
 * `attemptFailureReason` the subset a thrown error maps to.
 */
export const aiAttemptFailureReasons = [
  'timeout',
  'provider_error',
  'quota_exceeded',
  'rate_limited',
  'invalid_output',
  'unknown_option',
  'picks_not_distinct',
  'archetype_precondition',
] as const;

export type AiAttemptFailureReason = (typeof aiAttemptFailureReasons)[number];

/**
 * Why one provider attempt threw, as the closed vocabulary the handlers log. A spent quota
 * and an upstream 429 are named, never folded into `provider_error`. Only the attempt's own
 * timer aborts its signal, so an aborted signal reads as a timeout whichever rejection won.
 */
export function attemptFailureReason(
  error: unknown,
  signal?: AbortSignal,
): Extract<AiAttemptFailureReason, 'timeout' | 'provider_error' | AiProviderErrorKind> {
  if (signal?.aborted || error instanceof AttemptTimeoutError) return 'timeout';
  if (error instanceof AiProviderError) return error.kind;
  return 'provider_error';
}

/** Per-call knobs a caller may narrow; the adapter's own default applies otherwise. */
export type AiGenerateOptions = Readonly<{
  /** Output ceiling for this call. The probe asks for far less than a recommendation. */
  maxTokens?: number;
}>;

/**
 * Every provider the recommend walk can hold. The v2 probe reports any of them; the v1
 * probe omits `haiku`, because that member of its response enum would break every
 * installed binary that parses the enum strictly.
 */
export type AiChainProviderId = AiProbeV2ProviderId;

export interface AiProvider {
  /** Controlled, non-secret identifier; the probe reports it. */
  readonly id: AiChainProviderId;
  readonly model: string;
  generateOutfits(
    request: AiRecommendV1Request | AiRecommendV2Request,
    signal: AbortSignal,
    options?: AiGenerateOptions,
  ): Promise<unknown>;
}

/**
 * The model's reply text as JSON, for the adapters whose API returns it as a string. The
 * handler's response schema and selection gate validate what this returns; a reply that is
 * not JSON throws `invalidMessage`, never the text itself.
 */
export function parseModelJson(text: string, invalidMessage: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(invalidMessage);
  }
}

/**
 * One adapter-reported token count per successful call: the measured check on the
 * characters-per-token estimate behind each daily attempt limit. Two integers and the model;
 * nothing is persisted and no text leaves the Worker.
 */
export function logProviderUsage(model: string, inputTokens: unknown, outputTokens: unknown): void {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return;
  console.info({
    event: 'ai_provider_usage',
    model,
    promptTokens: Math.trunc(inputTokens as number),
    completionTokens: Math.trunc(outputTokens as number),
  });
}
