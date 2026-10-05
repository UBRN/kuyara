import {
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1Data,
  type PlaceSearchV1ErrorCode,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

import { readRouteRequest, type RateLimiter } from '../json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from '../json-response.ts';

type Dependencies = Readonly<{
  provider: { search(request: PlaceSearchV1Request): Promise<PlaceSearchV1Data> };
  rateLimiter: RateLimiter;
}>;
const error = createErrorResponse<PlaceSearchV1ErrorCode>(placeSearchV1ErrorSchema);

/**
 * At least 1.5 times the largest compact body a client sends (the handler test measures it);
 * a larger body is invalid_request, refused before it is read in full.
 */
export const placeSearchRequestMaxBytes = 1024;

export function createPlaceSearchHandler({ provider, rateLimiter }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== placeSearchV1Path) return error(404, 'not_found');
    // Place search has its own per-IP budget, so typed keystrokes and weather refreshes
    // cannot exhaust each other. Never use query text as a limiter key.
    const outcome = await readRouteRequest(request, {
      limiter: rateLimiter,
      scope: { keyPrefix: 'places', route: placeSearchV1Path, limiter: 'places_burst' },
      schema: placeSearchV1RequestSchema,
      maxBytes: placeSearchRequestMaxBytes,
    });
    if (outcome.kind !== 'ok') return refusalResponse(error, outcome.kind, 'places_unavailable');
    try {
      const result = placeSearchV1SuccessSchema.parse({ data: await provider.search(outcome.data) });
      if (result.data.places.length > outcome.data.limit) return error(503, 'places_unavailable');
      return Response.json(result, { headers: jsonHeaders });
    } catch {
      return error(503, 'places_unavailable');
    }
  };
}
