import { z } from 'zod';

import { base64UrlDecode, createEs256Signer } from '../es256-jwt.ts';
import { AccountError } from './account-error.ts';
import { boundedFetch, defaultFetch, type FetchLike } from './bounded-fetch.ts';

export type AppleTokenRevoker = (input: Readonly<{
  authorizationCode: string;
  // The `sub` of the account's Apple identity, read from Supabase, never from the request.
  expectedSubject: string;
}>) => Promise<void>;

type Dependencies = Readonly<{
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  // The bundle identifier: Apple's client id for the native flow.
  clientId?: string;
  now: () => Date;
  fetch?: FetchLike;
  timeoutMs?: number;
}>;

const appleOrigin = 'https://appleid.apple.com';
const clientSecretLifetimeSeconds = 300;

const tokenAnswerSchema = z.object({
  refresh_token: z.string().min(1),
  id_token: z.string().min(1),
});
const idTokenClaimsSchema = z.object({
  iss: z.literal(appleOrigin),
  aud: z.string(),
  sub: z.string().min(1),
});
const errorAnswerSchema = z.object({ error: z.string() });

function idTokenClaims(idToken: string): z.infer<typeof idTokenClaimsSchema> | undefined {
  const bytes = base64UrlDecode(idToken.split('.')[1] ?? '');
  if (bytes === null) return undefined;
  try {
    const claims = idTokenClaimsSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return claims.success ? claims.data : undefined;
  } catch {
    // Not JSON: an id_token without readable claims is reported as an upstream fault.
    return undefined;
  }
}

/**
 * Sign in with Apple deletion step: exchange the single-use authorization code for the
 * account's refresh token, check that it belongs to the account being deleted, and revoke it.
 * The client secret is built for each call. Any failure is a closed `AccountError`; the code,
 * the tokens and Apple's answers are never kept, logged or forwarded. The `id_token` arrives
 * straight from Apple's token endpoint over TLS in answer to this call, so its claims are
 * read without a signature check, as OpenID Connect allows for that channel.
 */
export function createAppleTokenRevoker(dependencies: Dependencies): AppleTokenRevoker {
  const fetchImpl = dependencies.fetch ?? defaultFetch();
  const timeoutMs = dependencies.timeoutMs ?? 4000;
  const clientId = dependencies.clientId ?? 'com.ubrn.kuyara';
  const sign = createEs256Signer(dependencies.privateKeyPem);

  async function clientSecret(): Promise<string> {
    const issuedAt = Math.floor(dependencies.now().getTime() / 1000);
    try {
      return await sign(
        { alg: 'ES256', kid: dependencies.keyId, typ: 'JWT' },
        {
          iss: dependencies.teamId,
          iat: issuedAt,
          exp: issuedAt + clientSecretLifetimeSeconds,
          aud: appleOrigin,
          sub: clientId,
        },
      );
    } catch {
      // A key that cannot sign is a configuration fault, not the person's.
      throw new AccountError('unavailable');
    }
  }

  function form(fields: Record<string, string>): RequestInit {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(fields).toString(),
    };
  }

  return async ({ authorizationCode, expectedSubject }) => {
    const secret = await clientSecret();
    const exchange = await boundedFetch(fetchImpl, `${appleOrigin}/auth/token`, form({
      client_id: clientId,
      client_secret: secret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }), timeoutMs);
    if (exchange.status === 400 && errorAnswerSchema.safeParse(exchange.json).data?.error === 'invalid_grant') {
      throw new AccountError('apple_code_invalid');
    }
    const answer = exchange.status === 200 ? tokenAnswerSchema.safeParse(exchange.json) : undefined;
    if (!answer?.success) throw new AccountError('unavailable');
    const claims = idTokenClaims(answer.data.id_token);
    if (claims === undefined || claims.aud !== clientId) throw new AccountError('unavailable');
    // A code from another Apple account must neither revoke that token nor authorize this
    // deletion; the token obtained here is dropped unused.
    if (claims.sub !== expectedSubject) throw new AccountError('apple_code_invalid');

    const revocation = await boundedFetch(fetchImpl, `${appleOrigin}/auth/revoke`, form({
      client_id: clientId,
      client_secret: secret,
      token: answer.data.refresh_token,
      token_type_hint: 'refresh_token',
    }), timeoutMs);
    if (revocation.status !== 200) throw new AccountError('unavailable');
  };
}
