import {
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1Data,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

export class PlaceSearchError extends Error {
  readonly code: 'invalid-input' | 'invalid-response' | 'unavailable' | 'rate-limited';

  constructor(code: PlaceSearchError['code']) {
    super('Place search could not be completed.');
    this.name = 'PlaceSearchError';
    this.code = code;
  }
}

export class WorkerPlaceSearchDataSource {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(dependencies: { baseUrl: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, '');
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.timeoutMs = dependencies.timeoutMs ?? 10000;
  }

  async search(input: PlaceSearchV1Request): Promise<PlaceSearchV1Data> {
    const request = placeSearchV1RequestSchema.safeParse(input);
    if (!request.success) throw new PlaceSearchError('invalid-input');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(`${this.baseUrl}${placeSearchV1Path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.data),
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new PlaceSearchError('invalid-response');
      }
      if (!response.ok) {
        const error = placeSearchV1ErrorSchema.safeParse(body);
        if (!error.success) throw new PlaceSearchError('invalid-response');
        throw new PlaceSearchError(error.data.error.code === 'rate_limited' ? 'rate-limited' : 'unavailable');
      }
      const result = placeSearchV1SuccessSchema.safeParse(body);
      if (!result.success || result.data.data.places.length > request.data.limit) {
        throw new PlaceSearchError('invalid-response');
      }
      return result.data.data;
    } catch (error) {
      if (error instanceof PlaceSearchError) throw error;
      throw new PlaceSearchError('unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
