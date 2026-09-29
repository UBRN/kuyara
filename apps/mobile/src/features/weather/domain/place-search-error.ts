/** How a place search failed; the data source throws it, the application layer reads its code. */
export class PlaceSearchError extends Error {
  readonly code: 'invalid-input' | 'invalid-response' | 'unavailable' | 'rate-limited';

  constructor(code: PlaceSearchError['code']) {
    super('Place search could not be completed.');
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}
