import { z } from 'zod';

import { raceWithTimeout } from '../attempt-timeout.ts';
import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { base64UrlDecode } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { boundedFetch } from './bounded-fetch.ts';
import { userIdPattern } from './user-id.ts';

// hasAppleIdentity: the token's signed `app_metadata.providers` names Apple when it was issued.
export type VerifiedSupabaseUser = Readonly<{ userId: string; hasAppleIdentity: boolean }>;
export type SupabaseTokenVerifier = (accessToken: string) => Promise<VerifiedSupabaseUser>;

type Dependencies = Readonly<{
  // The https origin from `supabaseBaseUrl`, used as is.
  supabaseUrl: string;
  now: () => Date;
  fetch?: FetchLike;
  timeoutMs: number;
  // A known key is trusted for this long before the set is read again, so it also bounds how
  // long a key Supabase has revoked (removed from the set) keeps verifying tokens.
  jwksMaxAgeMs?: number;
  // An unknown key id may trigger a refetch at most once per this period.
  jwksCooldownMs?: number;
}>;

const maxTokenLength = 8192;

const headerSchema = z.object({ alg: z.literal('ES256'), kid: z.string().min(1).max(256) });
const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  role: z.literal('authenticated'),
  sub: z.string().regex(userIdPattern),
  exp: z.number(),
  nbf: z.number().optional(),
  app_metadata: z.object({ providers: z.array(z.string()).max(10).optional() }).optional(),
});
const jwksSchema = z.object({ keys: z.array(z.unknown()).max(50) });
const jwkSchema = z.object({
  kty: z.literal('EC'),
  crv: z.literal('P-256'),
  x: z.string().min(1).max(100),
  y: z.string().min(1).max(100),
  kid: z.string().min(1).max(256),
  alg: z.string().optional(),
});

function decodeJson(segment: string): unknown {
  const bytes = base64UrlDecode(segment);
  if (bytes === null) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // Not JSON: the caller's schema rejects `undefined` as an invalid token.
    return undefined;
  }
}

/**
 * Stateless Supabase access-token check: ES256 signature against the project's JWKS, then
 * `exp`, `nbf`, `iss` (`<project>/auth/v1`), `aud` and `role` (both `authenticated`). The user
 * id is the token's `sub`.
 * The key set is cached per isolate; an unknown key id refetches it at most once per
 * cooldown, so forged key ids cannot make this route an amplifier against Supabase.
 */
export function createSupabaseTokenVerifier(dependencies: Dependencies): SupabaseTokenVerifier {
  const fetchImpl = dependencies.fetch ?? defaultFetch();
  const { timeoutMs } = dependencies;
  // Ten minutes, as Supabase's own client caches the set: with Supabase's ten-minute edge
  // cache, a revoked key stops verifying here within about twenty minutes.
  const maxAgeMs = dependencies.jwksMaxAgeMs ?? 600_000;
  const cooldownMs = dependencies.jwksCooldownMs ?? 60_000;
  const issuer = `${dependencies.supabaseUrl}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  let keys: ReadonlyMap<string, CryptoKey> | undefined;
  // When the key set was last read successfully, and when a read was last started. The first
  // decides how long the set verifies, the second paces the reads.
  let loadedAt = -Infinity;
  let attemptedAt = -Infinity;
  let inflight: Readonly<{ promise: Promise<void>; startedAt: number }> | undefined;

  async function loadKeys(startedAt: number): Promise<void> {
    const { status, json } = await boundedFetch(
      fetchImpl, jwksUrl, { method: 'GET', headers: { Accept: 'application/json' } }, timeoutMs,
    );
    const parsed = status === 200 ? jwksSchema.safeParse(json) : undefined;
    if (!parsed?.success) throw new AccountError('unavailable');
    const next = new Map<string, CryptoKey>();
    for (const raw of parsed.data.keys) {
      const jwk = jwkSchema.safeParse(raw);
      if (!jwk.success || (jwk.data.alg !== undefined && jwk.data.alg !== 'ES256')) continue;
      try {
        next.set(jwk.data.kid, await globalThis.crypto.subtle.importKey(
          'jwk',
          { kty: 'EC', crv: 'P-256', x: jwk.data.x, y: jwk.data.y },
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify'],
        ));
      } catch {
        // One malformed key must not hide the others; it simply never verifies a token.
        continue;
      }
    }
    // A read that was dropped and settles late must not replace a newer key set.
    if (startedAt < loadedAt) return;
    keys = next;
    loadedAt = startedAt;
  }

  // Concurrent callers share one read, and each waits for it only as long as its own deadline.
  // A failed read is dropped when it settles, so a failure is never cached.
  function startLoad(): NonNullable<typeof inflight> {
    const startedAt = dependencies.now().getTime();
    attemptedAt = startedAt;
    const record = {
      startedAt,
      promise: loadKeys(startedAt).finally(() => {
        if (inflight === record) inflight = undefined;
      }),
    };
    inflight = record;
    return record;
  }

  async function keyFor(kid: string): Promise<CryptoKey | undefined> {
    const at = dependencies.now().getTime();
    if (inflight !== undefined && at - inflight.startedAt >= timeoutMs) {
      // The read outlived its own deadline: its request was cancelled, or its fetch ignored the
      // abort. Nothing will settle it, so it is dropped as a failed attempt: the cooldown applies.
      inflight = undefined;
    }
    // The set verifies only inside its maximum age since the last successful read, so a key
    // Supabase revoked stops verifying even while Supabase is down.
    const cached = keys !== undefined && at - loadedAt < maxAgeMs ? keys : undefined;
    const unknownAndDue = cached !== undefined && !cached.has(kid) && at - attemptedAt >= cooldownMs;
    if (cached !== undefined && !unknownAndDue) return cached.get(kid);
    // The set is too old and the last read failed inside the cooldown: Supabase is down, so
    // callers fail at once instead of each waiting out a fresh read.
    if (cached === undefined && inflight === undefined && at - attemptedAt < cooldownMs) {
      throw new AccountError('unavailable');
    }
    // Started before the race, so the read's own deadline is the earlier of the two timers.
    const { promise } = inflight ?? startLoad();
    try {
      await raceWithTimeout(new AbortController(), () => promise, timeoutMs);
    } catch {
      throw new AccountError('unavailable');
    }
    return keys?.get(kid);
  }

  return async (accessToken) => {
    const parts = accessToken.split('.');
    if (accessToken.length > maxTokenLength || parts.length !== 3) throw new AccountError('unauthorized');
    const [headerSegment, payloadSegment, signatureSegment] = parts;
    const header = headerSchema.safeParse(decodeJson(headerSegment));
    const signature = base64UrlDecode(signatureSegment);
    if (!header.success || signature === null || signature.length !== 64) {
      throw new AccountError('unauthorized');
    }
    const key = await keyFor(header.data.kid);
    if (key === undefined) throw new AccountError('unauthorized');
    const verified = await globalThis.crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      signature,
      new TextEncoder().encode(`${headerSegment}.${payloadSegment}`),
    );
    const claims = claimsSchema.safeParse(decodeJson(payloadSegment));
    if (!verified || !claims.success) throw new AccountError('unauthorized');
    const nowSeconds = dependencies.now().getTime() / 1000;
    const { iss, aud, sub, exp, nbf, app_metadata: appMetadata } = claims.data;
    const audiences = typeof aud === 'string' ? [aud] : aud;
    if (
      iss !== issuer
      || !audiences.includes('authenticated')
      || exp <= nowSeconds
      || (nbf !== undefined && nbf > nowSeconds)
    ) {
      throw new AccountError('unauthorized');
    }
    return { userId: sub, hasAppleIdentity: appMetadata?.providers?.includes('apple') === true };
  };
}
