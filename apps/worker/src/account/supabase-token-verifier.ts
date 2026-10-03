import { z } from 'zod';

import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { base64UrlDecode } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { boundedFetch } from './bounded-fetch.ts';
import { userIdPattern } from './user-id.ts';

export type VerifiedSupabaseUser = Readonly<{ userId: string }>;
export type SupabaseTokenVerifier = (accessToken: string) => Promise<VerifiedSupabaseUser>;

type Dependencies = Readonly<{
  supabaseUrl: string;
  now: () => Date;
  fetch?: FetchLike;
  timeoutMs?: number;
  // A known key is trusted for this long before the set is read again.
  jwksMaxAgeMs?: number;
  // An unknown key id may trigger a refetch at most once per this period.
  jwksCooldownMs?: number;
}>;

const maxTokenLength = 8192;

const headerSchema = z.object({ alg: z.literal('ES256'), kid: z.string().min(1).max(256) });
const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().regex(userIdPattern),
  exp: z.number(),
  nbf: z.number().optional(),
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
 * `exp`, `nbf`, `iss` (`<project>/auth/v1`) and `aud`. The user id is the token's `sub`.
 * The key set is cached per isolate; an unknown key id refetches it at most once per
 * cooldown, so forged key ids cannot make this route an amplifier against Supabase.
 */
export function createSupabaseTokenVerifier(dependencies: Dependencies): SupabaseTokenVerifier {
  const fetchImpl = dependencies.fetch ?? defaultFetch();
  const timeoutMs = dependencies.timeoutMs ?? 4000;
  const maxAgeMs = dependencies.jwksMaxAgeMs ?? 3_600_000;
  const cooldownMs = dependencies.jwksCooldownMs ?? 60_000;
  const base = dependencies.supabaseUrl.replace(/\/+$/u, '');
  const issuer = `${base}/auth/v1`;
  const jwksUrl = `${issuer}/.well-known/jwks.json`;

  let keys: ReadonlyMap<string, CryptoKey> | undefined;
  let lastFetchAt = 0;
  let inflight: Promise<void> | undefined;

  async function loadKeys(): Promise<void> {
    lastFetchAt = dependencies.now().getTime();
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
    keys = next;
  }

  async function keyFor(kid: string): Promise<CryptoKey | undefined> {
    const at = dependencies.now().getTime();
    const stale = keys === undefined || at - lastFetchAt >= maxAgeMs;
    const unknownAndDue = keys !== undefined && !keys.has(kid) && at - lastFetchAt >= cooldownMs;
    if (stale || unknownAndDue) {
      // Concurrent callers share one request; the promise is dropped when it settles, so a
      // failure is never cached.
      inflight ??= loadKeys().finally(() => { inflight = undefined; });
      await inflight;
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
    const { iss, aud, sub, exp, nbf } = claims.data;
    const audiences = typeof aud === 'string' ? [aud] : aud;
    if (
      iss !== issuer
      || !audiences.includes('authenticated')
      || exp <= nowSeconds
      || (nbf !== undefined && nbf > nowSeconds)
    ) {
      throw new AccountError('unauthorized');
    }
    return { userId: sub };
  };
}
