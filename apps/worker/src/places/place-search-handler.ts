import {
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1Data,
  type PlaceSearchV1ErrorCode,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';

type Dependencies = Readonly<{
  provider: { search(request: PlaceSearchV1Request): Promise<PlaceSearchV1Data> };
  rateLimiter: { limit(input: { key: string }): Promise<{ success: boolean }> };
}>;
const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
};
function error(status: number, code: PlaceSearchV1ErrorCode, extraHeaders = {}): Response {
  return Response.json(placeSearchV1ErrorSchema.parse({ error: { code } }), {
    status, headers: { ...headers, ...extraHeaders },
  });
}

export function createPlaceSearchHandler({ provider, rateLimiter }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (new URL(request.url).pathname !== placeSearchV1Path) return error(404, 'not_found');
    if (request.method !== 'POST') return error(405, 'method_not_allowed', { Allow: 'POST' });
    try {
      // Share weather's per-IP budget; never use query text as a limiter key.
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      if (!(await rateLimiter.limit({ key: `weather:${ip}` })).success) {
        return error(429, 'rate_limited', { 'Retry-After': '60' });
      }
    } catch {
      return error(503, 'places_unavailable');
    }
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return error(400, 'invalid_request');
    }
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
      return Response.json(result, { headers });
    } catch {
      return error(503, 'places_unavailable');
    }
  };
}
