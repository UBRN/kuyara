export type WeatherProviderFailureKind =
  | 'network'
  | 'service'
  | 'rate-limited'
  | 'invalid-response';

/** How a weather fetch failed; a provider adapter throws it, the application layer reads its kind. */
export class WeatherProviderError extends Error {
  readonly kind: WeatherProviderFailureKind;

  constructor(kind: WeatherProviderFailureKind) {
    super('Weather could not be loaded from the provider.');
    this.name = 'WeatherProviderError';
    this.kind = kind;
  }
}
