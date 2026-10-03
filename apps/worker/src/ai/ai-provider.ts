import type { AiProviderId, AiRecommendV1Request, AiRecommendV2Request } from '@kuyara/contracts';

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
 * Why one provider attempt threw, as the closed vocabulary the handlers log. A spent quota
 * and an upstream 429 are named, never folded into `provider_error`. Only the attempt's own
 * timer aborts its signal, so an aborted signal reads as a timeout whichever rejection won.
 */
export function attemptFailureReason(
  error: unknown,
  signal?: AbortSignal,
): 'timeout' | AiProviderErrorKind | 'provider_error' {
  if (signal?.aborted || error instanceof AttemptTimeoutError) return 'timeout';
  if (error instanceof AiProviderError) return error.kind;
  return 'provider_error';
}

/** Per-call knobs a caller may narrow; the adapter's own default applies otherwise. */
export type AiGenerateOptions = Readonly<{
  /** Output ceiling for this call. The probe asks for far less than a recommendation. */
  maxTokens?: number;
}>;

export interface AiProvider {
  /** Controlled, non-secret identifier reported by the probe (ADR 0034 section 5). */
  readonly id: AiProviderId;
  readonly model: string;
  generateOutfits(
    request: AiRecommendV1Request | AiRecommendV2Request,
    signal: AbortSignal,
    options?: AiGenerateOptions,
  ): Promise<unknown>;
}
