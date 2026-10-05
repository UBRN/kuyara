/**
 * The one owner of how a Worker route reads a request: method, client IP, rate limit, content
 * type and body, and the body never unbounded. A route maps the outcome to its own codes.
 */

export type RateLimiter = Readonly<{
  limit(input: { key: string }): Promise<{ success: boolean }>;
}>;

/** Rides along on every 429 so a client knows when its per-IP window has passed. */
export const rateLimitedHeaders = { 'Retry-After': '60' } as const;

export function isJsonRequest(request: Request): boolean {
  return request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
    === 'application/json';
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

export type RateLimitOutcome = 'allowed' | 'limited' | 'unavailable';

/**
 * Spends one request of the caller's per-IP budget under `${keyPrefix}:${ip}`. A failing
 * binding is `unavailable` and is logged with the route and limiter names only, never its
 * error text; the caller answers in its own closed code. No limiter is no limit.
 */
export async function checkRateLimit(
  limiter: RateLimiter | undefined,
  request: Request,
  scope: Readonly<{ keyPrefix: string; route: string; limiter: string }>,
): Promise<RateLimitOutcome> {
  if (limiter === undefined) return 'allowed';
  try {
    const { success } = await limiter.limit({ key: `${scope.keyPrefix}:${clientIp(request)}` });
    return success ? 'allowed' : 'limited';
  } catch {
    console.warn({ event: 'rate_limiter_error', route: scope.route, limiter: scope.limiter });
    return 'unavailable';
  }
}

/**
 * Reads a body as text but stops, cancelling the stream, once it passes `maxBytes`; that
 * case is `undefined`. The limit is enforced while reading, never after buffering it all.
 * With `fatal`, bytes that are not valid UTF-8 throw instead of becoming replacement characters.
 */
export async function readTextWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  options: Readonly<{ fatal?: boolean }> = {},
): Promise<string | undefined> {
  if (body === null) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: options.fatal === true });
  let text = '';
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * A request body read within `maxBytes` and parsed as JSON; `undefined` when it is empty,
 * oversized, not decodable or not JSON, which every caller answers as an invalid request.
 */
export async function readJsonBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  options: Readonly<{ fatal?: boolean }> = {},
): Promise<unknown> {
  try {
    const text = await readTextWithLimit(body, maxBytes, options);
    return text === undefined ? undefined : JSON.parse(text);
  } catch {
    // A stream error, bytes that are not decodable or text that is not JSON: the one answer is
    // `undefined`, and the caller says invalid_request.
    return undefined;
  }
}

type RouteScope = Readonly<{ keyPrefix: string; route: string; limiter: string }>;

export type RouteAdmission = 'allowed' | 'method_not_allowed' | 'rate_limited' | 'limiter_unavailable';

/**
 * Whether a request may be read at all: a POST that the caller's per-IP budget admits. A
 * limited request is logged with the route and limiter names only; the route answers it.
 */
export async function admitRequest(
  request: Request,
  limiter: RateLimiter | undefined,
  scope: RouteScope,
): Promise<RouteAdmission> {
  if (request.method !== 'POST') return 'method_not_allowed';
  const outcome = await checkRateLimit(limiter, request, scope);
  if (outcome === 'unavailable') return 'limiter_unavailable';
  if (outcome === 'limited') {
    console.warn({ event: 'rate_limited', route: scope.route, limiter: scope.limiter });
    return 'rate_limited';
  }
  return 'allowed';
}

type RequestSchema<T> = Readonly<{
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}>;

/** Why a request was refused before its route ran. */
export type RouteRefusal = Exclude<RouteAdmission, 'allowed'> | 'invalid_request';

export type RequestBodyOutcome<T> =
  | Readonly<{ kind: 'ok'; data: T }>
  | Readonly<{ kind: 'invalid_request' }>;

/**
 * A JSON body within `maxBytes` that the route's strict schema accepts. Anything else, a
 * wrong content type, an oversized or undecodable body, or a failing parse, is one
 * `invalid_request`. The body is parsed here once; the route never sees unvalidated input.
 */
export async function readRequestBody<T>(
  request: Request,
  options: Readonly<{ schema: RequestSchema<T>; maxBytes: number; fatal?: boolean }>,
): Promise<RequestBodyOutcome<T>> {
  if (!isJsonRequest(request)) return { kind: 'invalid_request' };
  const body = await readJsonBody(request.body, options.maxBytes, { fatal: options.fatal });
  const parsed = options.schema.safeParse(body);
  return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'invalid_request' };
}

export type RouteRequestOutcome<T> =
  | Readonly<{ kind: 'ok'; data: T }>
  | Readonly<{ kind: RouteRefusal }>;

/** `admitRequest`, then `readRequestBody`: the whole preamble of a route without its own checks. */
export async function readRouteRequest<T>(
  request: Request,
  options: Readonly<{
    limiter: RateLimiter | undefined;
    scope: RouteScope;
    schema: RequestSchema<T>;
    maxBytes: number;
    fatal?: boolean;
  }>,
): Promise<RouteRequestOutcome<T>> {
  const admission = await admitRequest(request, options.limiter, options.scope);
  if (admission !== 'allowed') return { kind: admission };
  return readRequestBody(request, options);
}
