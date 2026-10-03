/**
 * The one owner of how a Worker route reads a request: content type, client IP, rate limit and
 * body, and the body never unbounded.
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
