import { z } from 'zod';

import type { GoogleSignIn } from '@/features/account/data/supabase-account-auth';
import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';

// Sign in with Google on Google's own sign-in page in the system browser session, for kuyara's
// iOS OAuth client with PKCE and the hashed nonce; the returned code is exchanged with Google for
// the ID token (ADR 0041 section 1). The wrapper takes the browser, the crypto and the fetch, so
// the composition alone loads native code.

/** The public iOS OAuth client id; it is the ID token's audience the Supabase provider lists. */
export type GoogleSignInSettings = Readonly<{ iosClientId: string }>;

const clientIdPattern = /^(\d+-[a-z0-9]+)\.apps\.googleusercontent\.com$/;

/**
 * The one place the app reads the Google client id (Metro inlines this literal `process.env`
 * read). Null when it is missing or not a Google client id; then Google fails closed.
 */
export function resolveGoogleSignInSettings(
  configured: string | undefined = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
): GoogleSignInSettings | null {
  const iosClientId = configured?.trim() ?? '';
  return clientIdPattern.test(iosClientId) ? { iosClientId } : null;
}

/** The part of `expo-web-browser` the wrapper uses. */
export type GoogleAuthBrowser = Readonly<{
  openAuthSessionAsync: (url: string, redirectUrl: string) => Promise<Readonly<{ type: string; url?: string }>>;
}>;

export type GoogleSignInCrypto = Readonly<{
  randomBytes: (count: number) => Uint8Array;
  sha256Hex: (text: string) => Promise<string>;
}>;

const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
/** Google sign-in requests `openid`, `email` and `profile` (ADR 0041 section 1). */
const scope = 'openid email profile';
const tokenTimeoutMs = 15_000;

/**
 * The ID token, and the access token Supabase checks the ID token's `at_hash` against; the name
 * and picture Google supplies are never read (ADR 0041 section 1).
 */
const tokenResponse = z.object({ id_token: z.string().min(1), access_token: z.string().min(1) });

const failed = () => new Error('Google sign-in failed.');

const hexBytes = (text: string) => Uint8Array.from(text.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** An iOS client redirects to its reversed id: `com.googleusercontent.apps.<id>:/oauth2redirect`. */
const redirectUriOf = (iosClientId: string) =>
  `com.googleusercontent.apps.${clientIdPattern.exec(iosClientId)?.[1] ?? ''}:/oauth2redirect`;

export function createGoogleSignIn({ browser, crypto, send }: Readonly<{
  browser: GoogleAuthBrowser;
  crypto: GoogleSignInCrypto;
  send: Fetch;
}>, { iosClientId }: GoogleSignInSettings): GoogleSignIn {
  const redirectUri = redirectUriOf(iosClientId);
  return {
    async idToken(hashedNonce) {
      const verifier = base64Url(crypto.randomBytes(32));
      const state = base64Url(crypto.randomBytes(16));
      const challenge = base64Url(hexBytes(await crypto.sha256Hex(verifier)));
      const page = `${authorizationEndpoint}?${new URLSearchParams({
        client_id: iosClientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        nonce: hashedNonce,
        state,
        prompt: 'select_account',
      })}`;

      const answer = await browser.openAuthSessionAsync(page, redirectUri);
      if (answer.type === 'cancel' || answer.type === 'dismiss') return null;
      if (answer.type !== 'success' || answer.url === undefined) throw failed();
      const returned = new URL(answer.url).searchParams;
      if (returned.get('state') !== state) throw failed();
      if (returned.get('error') === 'access_denied') return null;
      const code = returned.get('code');
      if (returned.has('error') || !code) throw failed();

      const { response, body } = await fetchJsonWithTimeout(send, tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: iosClientId,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      }, tokenTimeoutMs, { network: failed, invalidJson: failed });
      const parsed = tokenResponse.safeParse(body);
      if (!response.ok || !parsed.success) throw failed();
      return { idToken: parsed.data.id_token, accessToken: parsed.data.access_token };
    },
  };
}
