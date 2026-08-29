/**
 * Failure classification shared by every weather provider adapter.
 *
 * Adapters must translate upstream failures into one of these kinds and must
 * never place raw provider payloads, credentials, or upstream error text into
 * the thrown error.
 */
export const weatherProviderErrorKinds = [
  'availability',
  'timeout',
  'quota',
  'auth',
  'upstream',
  'invalid_response',
  'invalid_request',
] as const;

export type WeatherProviderErrorKind = (typeof weatherProviderErrorKinds)[number];

export class WeatherProviderError extends Error {
  readonly kind: WeatherProviderErrorKind;

  constructor(kind: WeatherProviderErrorKind) {
    super(`Weather provider failed: ${kind}`);
    this.name = 'WeatherProviderError';
    this.kind = kind;
  }
}

/**
 * Fallback advances only for eligible failures. `invalid_request` means the
 * request itself is unusable, so a second provider would reject it too.
 */
export function isFallbackEligible(error: unknown): boolean {
  return error instanceof WeatherProviderError && error.kind !== 'invalid_request';
}
