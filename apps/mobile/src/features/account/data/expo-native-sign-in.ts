import type * as AppleAuthentication from 'expo-apple-authentication';

import type { AppleCredentialState } from '@/features/account/application/account-session';
import type { AppleSignIn, NonceSource } from '@/features/account/data/supabase-account-auth';

// Sign in with Apple and the sign-in nonce reach the auth adapter through these wrappers. Each
// takes its native module, so the composition loads native code only when accounts are composed.

const cancelled = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_REQUEST_CANCELED';

export function createExpoAppleSignIn(apple: typeof AppleAuthentication): AppleSignIn {
  const states: Readonly<Record<number, AppleCredentialState>> = {
    [apple.AppleAuthenticationCredentialState.AUTHORIZED]: 'authorized',
    [apple.AppleAuthenticationCredentialState.REVOKED]: 'revoked',
    [apple.AppleAuthenticationCredentialState.NOT_FOUND]: 'notFound',
    [apple.AppleAuthenticationCredentialState.TRANSFERRED]: 'transferred',
  };
  return {
    async signIn(hashedNonce) {
      try {
        const credential = await apple.signInAsync({
          // The email only: the name belongs to the local profile (ADR 0041 section 1).
          requestedScopes: [apple.AppleAuthenticationScope.EMAIL],
          nonce: hashedNonce,
        });
        return { identityToken: credential.identityToken };
      } catch (error) {
        if (cancelled(error)) return null;
        throw error;
      }
    },
    async reauthorize() {
      try {
        const credential = await apple.signInAsync({ requestedScopes: [] });
        return { authorizationCode: credential.authorizationCode };
      } catch (error) {
        if (cancelled(error)) return null;
        throw error;
      }
    },
    async credentialState(appleUserId) {
      const state = states[await apple.getCredentialStateAsync(appleUserId)];
      if (state === undefined) throw new Error('Unknown Apple credential state.');
      return state;
    },
  };
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** 32 random bytes as hex for Supabase, their SHA-256 as hex for Apple. */
export function createNonceSource(crypto: Readonly<{
  randomBytes: (count: number) => Uint8Array;
  sha256Hex: (text: string) => Promise<string>;
}>): NonceSource {
  return async () => {
    const raw = hex(crypto.randomBytes(32));
    return { raw, hashed: await crypto.sha256Hex(raw) };
  };
}
