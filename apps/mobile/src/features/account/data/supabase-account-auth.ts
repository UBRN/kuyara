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

/** A fresh nonce: the raw value goes to Supabase, its SHA-256 (hex) to Apple. */
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

/** Apple's user identifier for the session's Apple identity (the `sub` of Apple's ID token). */
export function appleUserIdOf(session: UserSession): string | null {
  const sub: unknown = session.user.identities?.find(({ provider }) => provider === 'apple')?.identity_data?.sub;
  return typeof sub === 'string' && sub.length > 0 ? sub : null;
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

/**
 * Google sign-in waits for its library's licence (ADR 0041 section 1). Until then this is the one
 * place it fails, the way a provider failure does; the Google adapter replaces it.
 */
function googleIdToken(): Promise<never> {
  return Promise.reject(new AccountProviderError('unavailable'));
}

const sessionOrFail = (session: Session | null): AuthSession => {
  const mapped = session === null ? null : authSessionOf(session);
  if (mapped === null) throw new AccountProviderError('failed');
  return mapped;
};

export function createSupabaseAccountAuth({ apple, client, nonce, removeStoredSession, storedSession: readStored }: Readonly<{
  client: SupabaseClient;
  apple: AppleSignIn;
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

  async function storedSession(): Promise<Session | null> {
    const { data, error } = await auth.getSession();
    if (error) throw new AccountProviderError('failed');
    return data.session;
  }

  return {
    currentSession: readSession,
    async signIn(provider) {
      if (provider === 'google') return googleIdToken();
      const apple = await appleIdToken();
      if (apple === null) return null;
      const { data, error } = await auth.signInWithIdToken({ provider: 'apple', token: apple.token, nonce: apple.rawNonce });
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
      if (provider === 'google') return googleIdToken();
      const apple = await appleIdToken();
      if (apple === null) throw new AccountProviderError('cancelled');
      const { data, error } = await auth.linkIdentity({ provider: 'apple', token: apple.token, nonce: apple.rawNonce });
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
        await googleIdToken();
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
