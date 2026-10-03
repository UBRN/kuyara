import {
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1Data,
  type PlaceSearchV1ErrorCode,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

import {
  checkRateLimit, isJsonRequest, rateLimitedHeaders, type RateLimiter,
} from '../json-request.ts';
import { createErrorResponse, jsonHeaders } from '../json-response.ts';

type Dependencies = Readonly<{
  provider: { search(request: PlaceSearchV1Request): Promise<PlaceSearchV1Data> };
  rateLimiter: RateLimiter;
}>;
const error = createErrorResponse<PlaceSearchV1ErrorCode>(placeSearchV1ErrorSchema);

export function createPlaceSearchHandler({ provider, rateLimiter }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== placeSearchV1Path) return error(404, 'not_found');
    if (request.method !== 'POST') return error(405, 'method_not_allowed', { Allow: 'POST' });
    // Place search has its own per-IP budget, so typed keystrokes and weather refreshes
    // cannot exhaust each other. Never use query text as a limiter key.
    const limit = await checkRateLimit(rateLimiter, request, {
      keyPrefix: 'places',
      route: placeSearchV1Path,
      limiter: 'places_burst',
    });
    if (limit === 'unavailable') return error(503, 'places_unavailable');
    if (limit === 'limited') {
      console.warn({ event: 'rate_limited', route: placeSearchV1Path, limiter: 'places_burst' });
      return error(429, 'rate_limited', rateLimitedHeaders);
    }
    if (!isJsonRequest(request)) return error(400, 'invalid_request');
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error(400, 'invalid_request');
    }
    const parsed = placeSearchV1RequestSchema.safeParse(body);
    if (!parsed.success) return error(400, 'invalid_request');
    try {
      const result = placeSearchV1SuccessSchema.parse({ data: await provider.search(parsed.data) });
      if (result.data.places.length > parsed.data.limit) return error(503, 'places_unavailable');
      return Response.json(result, { headers: jsonHeaders });
    } catch {
      return error(503, 'places_unavailable');
    }
  };
}
