import {
  isAuthRetryableFetchError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { z } from 'zod';

import {
  AccountProviderError,
  type AccountAuthPort,
  type AppleCredentialState,
  type AuthSession,
} from '@/features/account/application/account-session';
import type { AccountProvider } from '@/features/account/application/account-screens';

/** Native Sign in with Apple as the adapter uses it; `null` is the person cancelling. */
export type AppleSignIn = Readonly<{
  /** The email scope only, never the name, with the SHA-256 of the raw nonce. */
  signIn: (hashedNonce: string) => Promise<Readonly<{ identityToken: string | null }> | null>;
  /** A fresh authorization for deletion, whose single-use code lets the Worker revoke Apple's token. */
  reauthorize: () => Promise<Readonly<{ authorizationCode: string | null }> | null>;
  /** Apple's answer for the Apple user identifier; throws when Apple cannot answer. */
  credentialState: (appleUserId: string) => Promise<AppleCredentialState>;
}>;

/** Native Sign in with Google with the SHA-256 of the raw nonce; `null` is the person cancelling. */
export type GoogleSignIn = Readonly<{
  idToken: (hashedNonce: string) => Promise<Readonly<{ idToken: string }> | null>;
}>;

/** A fresh nonce: the raw value goes to Supabase, its SHA-256 (hex) to Apple or Google. */
export type NonceSource = () => Promise<Readonly<{ raw: string; hashed: string }>>;

const isAccountProvider = (value: unknown): value is AccountProvider => value === 'apple' || value === 'google';

/** The part of a session's user the mapping reads; a stored session is parsed to it once. */
const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().optional(),
  app_metadata: z.object({ provider: z.unknown(), providers: z.unknown() }).partial(),
  identities: z.array(z.object({
    provider: z.string(),
    identity_data: z.record(z.string(), z.unknown()).optional(),
  })).optional(),
});
type SessionUser = z.infer<typeof sessionUserSchema>;
type UserSession = Readonly<{ user: SessionUser }>;

function providersOf(session: UserSession): AccountProvider[] {
  const named: unknown[] = session.user.identities?.map((identity) => identity.provider)
    ?? (Array.isArray(session.user.app_metadata.providers) ? session.user.app_metadata.providers : []);
  return [...new Set(named.filter(isAccountProvider))].sort();
}

/**
 * The one mapping from a Supabase session to the account screens' identity: the user id, the
 * provider the account was created with (else its first linked one), the email and every linked
 * Apple or Google identity. It never reads `user_metadata`, where Supabase keeps the provider's
 * name and picture. A session with neither provider is no kuyara session.
 */
export function authSessionOf(session: UserSession): AuthSession | null {
  const providers = providersOf(session);
  const primary = session.user.app_metadata.provider;
  const provider = isAccountProvider(primary) && providers.includes(primary) ? primary : providers[0];
  if (provider === undefined) return null;
  return { userId: session.user.id, provider, email: session.user.email ?? '', providers };
}

/** A provider's user identifier for the session's identity of `provider` (the `sub` of its ID token). */
function providerUserIdOf(session: UserSession, provider: AccountProvider): string | null {
  const sub: unknown = session.user.identities?.find((identity) => identity.provider === provider)?.identity_data?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
}

/** Apple's user identifier for the session's Apple identity (the `sub` of Apple's ID token). */
export const appleUserIdOf = (session: UserSession) => providerUserIdOf(session, 'apple');

/**
 * The `sub` of an ID token's payload, unverified: only compared with the session's own identity,
 * so a confirmation from another account stops deletion. Null when the token is not a JWT.
 */
function idTokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1] ?? '';
    const json: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    const parsed = z.object({ sub: z.string().min(1) }).safeParse(json);
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
}

/** The session the auth client stored, read without the network: its user, or null. */
function storedUserOf(json: string | null): UserSession | null {
  if (json === null) return null;
  try {
    const stored: unknown = JSON.parse(json);
    const user = z.object({ user: sessionUserSchema }).safeParse(stored);
    return user.success ? user.data : null;
  } catch {
    return null;
  }
}

const sessionOrFail = (session: Session | null): AuthSession => {
  const mapped = session === null ? null : authSessionOf(session);
  if (mapped === null) throw new AccountProviderError('failed');
  return mapped;
};

export function createSupabaseAccountAuth({ apple, client, google = null, nonce, removeStoredSession, storedSession: readStored }: Readonly<{
  client: SupabaseClient;
  apple: AppleSignIn;
  /** Null until the Google library and its client settings are in the build: Google then fails closed. */
  google?: GoogleSignIn | null;
  nonce: NonceSource;
  /** The auth client's stored session as text, read without the network. */
  storedSession: () => Promise<string | null>;
  /** Removes the auth client's stored session from this device's storage. */
  removeStoredSession: () => Promise<void>;
}>): AccountAuthPort {
  const auth = client.auth;

  /**
   * The session as the auth service answers it, refreshed by the client when its access token is
   * due. Unreachable (offline, or the service failing) is no answer: the stored session stands.
   * Only a definitive answer, a refused or revoked refresh token or a user that is gone (after
   * which the client has removed the stored session), reads as null.
   */
  async function readSession(): Promise<AuthSession | null> {
    const { data, error } = await auth.getSession();
    if (!error) return data.session === null ? null : authSessionOf(data.session);
    if (!isAuthRetryableFetchError(error)) return null;
    const stored = storedUserOf(await readStored());
    if (stored === null) throw new AccountProviderError('unavailable');
    return authSessionOf(stored);
  }

  /** An Apple ID token for the raw nonce, or null when the person cancels. */
  async function appleIdToken(): Promise<Readonly<{ token: string; rawNonce: string }> | null> {
    const { hashed, raw } = await nonce();
    let credential: Readonly<{ identityToken: string | null }> | null;
    try {
      credential = await apple.signIn(hashed);
    } catch {
      throw new AccountProviderError('failed');
    }
    if (credential === null) return null;
    if (credential.identityToken === null) throw new AccountProviderError('failed');
    return { token: credential.identityToken, rawNonce: raw };
  }

  /**
   * A Google ID token for the raw nonce, or null when the person cancels. Without the library or
   * its settings in this build it fails the way a provider failure does (ADR 0041 section 1).
   */
  async function googleIdToken(): Promise<Readonly<{ token: string; rawNonce: string }> | null> {
    if (google === null) throw new AccountProviderError('unavailable');
    const { hashed, raw } = await nonce();
    let credential: Readonly<{ idToken: string }> | null;
    try {
      credential = await google.idToken(hashed);
    } catch {
      throw new AccountProviderError('failed');
    }
    return credential === null ? null : { token: credential.idToken, rawNonce: raw };
  }

  /** The ID token of `provider` for the raw nonce, or null when the person cancels. */
  const idToken = (provider: AccountProvider) => (provider === 'apple' ? appleIdToken() : googleIdToken());

  async function storedSession(): Promise<Session | null> {
    const { data, error } = await auth.getSession();
    if (error) throw new AccountProviderError('failed');
    return data.session;
  }

  return {
    currentSession: readSession,
    async signIn(provider) {
      const credential = await idToken(provider);
      if (credential === null) return null;
      const { data, error } = await auth.signInWithIdToken({ provider, token: credential.token, nonce: credential.rawNonce });
      if (error) throw new AccountProviderError('failed');
      return sessionOrFail(data.session);
    },
    async signOut() {
      // auth-js keeps the stored session when it cannot first read or refresh it (offline with an
      // expired access token), so the session is removed from storage whatever it answered.
      try {
        await auth.signOut({ scope: 'local' });
      } finally {
        await removeStoredSession();
      }
    },
    refreshSession: readSession,
    async addProvider(provider) {
      const credential = await idToken(provider);
      if (credential === null) throw new AccountProviderError('cancelled');
      const { data, error } = await auth.linkIdentity({ provider, token: credential.token, nonce: credential.rawNonce });
      if (error) throw new AccountProviderError(error.code === 'identity_already_exists' ? 'identityTaken' : 'failed');
      return sessionOrFail(data.session);
    },
    async reauthorizeDeletion() {
      const session = await storedSession();
      if (session === null) throw new AccountProviderError('failed');
      let appleAuthorizationCode: string | null = null;
      if (providersOf(session).includes('apple')) {
        let answer: Readonly<{ authorizationCode: string | null }> | null;
        try {
          answer = await apple.reauthorize();
        } catch {
          // Apple gave no code for a reason other than a cancel: deletion goes on without one.
          answer = { authorizationCode: null };
        }
        if (answer === null) return null;
        appleAuthorizationCode = answer.authorizationCode;
      } else {
        // A Google account re-authenticates with Google instead (ADR 0041 section 2): a cancel
        // stops deletion, and so does a confirmation from a Google account this one does not hold.
        const google = await googleIdToken();
        if (google === null) return null;
        const subject = idTokenSubject(google.token);
        if (subject === null || subject !== providerUserIdOf(session, 'google')) throw new AccountProviderError('failed');
      }
      const { data, error } = await auth.refreshSession();
      if (error || data.session === null) throw new AccountProviderError('failed');
      return {
        accessToken: data.session.access_token,
        ...(appleAuthorizationCode === null ? {} : { appleAuthorizationCode }),
      };
    },
    async appleCredentialState() {
      const session = await storedSession();
      const appleUserId = session === null ? null : appleUserIdOf(session);
      if (appleUserId === null) throw new AccountProviderError('failed');
      return apple.credentialState(appleUserId);
    },
  };
}
