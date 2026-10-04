import type { GoogleSignIn } from '@/features/account/data/supabase-account-auth';

// Sign in with Google through Google's native sign-in library, the Universal edition that takes
// a nonce (ADR 0041 section 1). The wrapper takes the library's `GoogleOneTapSignIn` module, so
// the composition loads native code only when accounts are composed, and Google stays off until
// both the module and its client settings exist.

/** The two public OAuth client ids Google sign-in needs: the web client (the token audience) and the iOS client. */
export type GoogleSignInSettings = Readonly<{ webClientId: string; iosClientId: string }>;

const clientIdPattern = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/**
 * The one place the app reads the Google client ids (Metro inlines these literal `process.env`
 * reads). Null when either is missing or not a Google client id; then Google fails closed.
 */
export function resolveGoogleSignInSettings(
  configuredWeb: string | undefined = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  configuredIos: string | undefined = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
): GoogleSignInSettings | null {
  const webClientId = configuredWeb?.trim() ?? '';
  const iosClientId = configuredIos?.trim() ?? '';
  return clientIdPattern.test(webClientId) && clientIdPattern.test(iosClientId) ? { webClientId, iosClientId } : null;
}

/** The part of the library's `GoogleOneTapSignIn` the wrapper uses. */
export type GoogleOneTapModule = Readonly<{
  configure: (params: Readonly<{ webClientId: string; iosClientId: string; scopes: string[] }>) => void;
  authenticate: (params: Readonly<{ nonce: string }>) => Promise<Readonly<{
    type: string;
    data: Readonly<{ idToken?: string | null }> | null;
  }>>;
}>;

/** Google sign-in requests `openid`, `email` and `profile` (ADR 0041 section 1). */
const scopes = ['openid', 'email', 'profile'];

export function createGoogleSignIn(google: GoogleOneTapModule, settings: GoogleSignInSettings): GoogleSignIn {
  let configured = false;
  return {
    async idToken(hashedNonce) {
      if (!configured) {
        google.configure({ webClientId: settings.webClientId, iosClientId: settings.iosClientId, scopes });
        configured = true;
      }
      const answer = await google.authenticate({ nonce: hashedNonce });
      if (answer.type === 'cancelled') return null;
      const idToken = answer.type === 'success' ? answer.data?.idToken : null;
      if (!idToken) throw new Error('Google returned no ID token.');
      // Only the token: the name and picture Google supplies are never read (ADR 0041 section 1).
      return { idToken };
    },
  };
}
