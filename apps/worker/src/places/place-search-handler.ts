import {
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1ErrorCode,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

import { readRouteRequest, type RateLimiter } from '../json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from '../json-response.ts';
import type { ExecutionContext } from '../router.ts';
import { defaultCache, writeCachedAnswer } from '../shared-cache.ts';
import type { PlaceSearchAnswer } from './open-meteo-place-provider.ts';

type Dependencies = Readonly<{
  provider: { search(request: PlaceSearchV1Request): Promise<PlaceSearchAnswer> };
  rateLimiter: RateLimiter;
  /** The shared result cache; the runtime's `caches.default` when absent. */
  cache?: Cache;
}>;
const error = createErrorResponse<PlaceSearchV1ErrorCode>(placeSearchV1ErrorSchema);

/**
 * At least 1.5 times the largest compact body a client sends (the handler test measures it);
 * a larger body is invalid_request, refused before it is read in full.
 */
export const placeSearchRequestMaxBytes = 1024;

// A city's geocoding answer barely moves, so a day of reuse keeps repeated searches off the
// Open-Meteo allowance the weather chain also spends.
const placeSearchCacheMaxAgeSeconds = 86_400;
// Bump when the mapping from a provider answer to the response changes, so older entries miss.
const placeSearchCacheVersion = 1;

/**
 * The shared-cache key: every request input that reaches the provider (the query as the
 * provider sends it, the limit and the language), hashed under a synthetic host. The request
 * carries no coordinates, and nothing about the caller enters the key.
 */
async function buildCacheRequest({ query, limit, language }: PlaceSearchV1Request): Promise<Request> {
  const canonical = [`v${placeSearchCacheVersion}`, language, String(limit), query].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new Request(`https://kuyara.internal${placeSearchV1Path}/${hash}`);
}

/** The cached answer, or `undefined` for a miss, an unreadable entry or a failing cache. */
async function readCachedAnswer(cache: Cache, cacheRequest: Request, limit: number) {
  try {
    const cached = await cache.match(cacheRequest);
    if (!cached) return undefined;
    const parsed = placeSearchV1SuccessSchema.safeParse(await cached.json());
    return parsed.success && parsed.data.data.places.length <= limit ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function createPlaceSearchHandler({ provider, rateLimiter, cache: injectedCache }: Dependencies) {
  return async (request: Request, ctx?: ExecutionContext): Promise<Response> => {
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
    // The limiter above runs first, so a cache hit spends the caller's budget like a miss.
    const cache = injectedCache ?? defaultCache();
    const cacheRequest = cache ? await buildCacheRequest(outcome.data) : undefined;
    if (cache && cacheRequest) {
      const cached = await readCachedAnswer(cache, cacheRequest, outcome.data.limit);
      if (cached) return Response.json(cached, { headers: jsonHeaders });
    }
    try {
      const answer = await provider.search(outcome.data);
      const result = placeSearchV1SuccessSchema.parse({ data: answer });
      if (result.data.places.length > outcome.data.limit) return error(503, 'places_unavailable');
      const response = Response.json(result, { headers: jsonHeaders });
      // Only a complete answer is kept: one whose spelling top-up failed would pin its gap for a day.
      if (cache && cacheRequest && ctx && !answer.degraded) {
        writeCachedAnswer(cache, cacheRequest, response, ctx, placeSearchCacheMaxAgeSeconds);
      }
      return response;
    } catch {
      return error(503, 'places_unavailable');
    }
  };
}
