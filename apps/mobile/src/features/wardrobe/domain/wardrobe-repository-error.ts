/** How a local Closet operation failed; the repository throws it, the application layer reads its code. */
export class WardrobeRepositoryError extends Error {
  readonly code: 'invalid-input' | 'invalid-data' | 'not-found' | 'unavailable';

  constructor(code: 'invalid-input' | 'invalid-data' | 'not-found' | 'unavailable') {
    super('The local wardrobe operation could not be completed.');
    this.name = 'WardrobeRepositoryError';
    this.code = code;
  }
}
