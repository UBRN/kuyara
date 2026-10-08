import type { ExecutionContext } from './router.ts';

/** The Workers runtime's shared cache, or `undefined` where it does not exist (unit tests). */
export function defaultCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
}

/**
 * The write outlives the response instead of delaying it. Shared cache failures, whether the
 * write rejects or the runtime refuses it, must never fail a validated response.
 */
export function writeCachedAnswer(
  cache: Cache,
  cacheRequest: Request,
  response: Response,
  ctx: ExecutionContext,
  maxAgeSeconds: number,
): void {
  try {
    const cached = response.clone();
    cached.headers.set('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    ctx.waitUntil(cache.put(cacheRequest, cached).catch(() => {
      // Best effort: a failed shared-cache write only costs a later cache miss.
    }));
  } catch {
    // Best effort as above.
  }
}
