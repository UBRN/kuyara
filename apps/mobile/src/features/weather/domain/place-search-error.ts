/**
 * How a place search failed; the data source throws it, the application layer reads its code.
 * `offline` is a request that got no response at all, a timeout included.
 */
export class PlaceSearchError extends Error {
  readonly code: 'invalid-input' | 'invalid-response' | 'offline' | 'unavailable' | 'rate-limited';

  constructor(code: PlaceSearchError['code']) {
    super('Place search could not be completed.');
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}
