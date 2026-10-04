import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';

import type { SupabaseSettings } from '@/config/supabase-settings';
import { createAccountDeletionClient } from '@/features/account/application/account-delete';
import {
  createAccountSessionManager,
  type AccountAuthPort,
  type AccountSessionManager,
} from '@/features/account/application/account-session';
import { createAccountSessionSync } from '@/features/account/application/account-session-sync';
import { createEncryptedSessionStorage } from '@/features/account/data/encrypted-session-storage';
import { createExpoAppleSignIn, createNonceSource } from '@/features/account/data/expo-native-sign-in';
import {
  createGoogleSignIn,
  resolveGoogleSignInSettings,
  type GoogleOneTapModule,
} from '@/features/account/data/google-native-sign-in';
import { createNetworkState, type AccountNetwork } from '@/features/account/data/network-state';
import {
  createSqliteAccountRowsSource,
  type SqliteAccountRowsSource,
} from '@/features/account/data/sqlite-account-rows-source';
import { createSupabaseAccountAuth } from '@/features/account/data/supabase-account-auth';
import { createSupabaseAccountRemote, createSupabaseSyncConsent } from '@/features/account/data/supabase-account-remote';
import { createWorkerAccountDeletion } from '@/features/account/data/worker-account-deletion';
import { signOut as linkAfterSignOut } from '@/features/account/domain/account-link';
import { deviceCrypto } from '@/infrastructure/device-crypto';
import type { Fetch } from '@/infrastructure/network/fetch-json-with-timeout';
import { deviceKeyValueStore } from '@/infrastructure/sqlite/key-value-store';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';
import { systemDate, systemNow } from '@/infrastructure/system-clock';

// The live account session: Supabase, Sign in with Apple, the Keychain and the device database
// behind the ports the account screens already run on. This module loads the native sign-in and
// Keychain code, so the provider imports it only when accounts are switched on and configured.

/** The Keychain entry of the session key; it never leaves this device (ADR 0041 section 9). */
const sessionKeyName = 'kuyara.account.session-key';
const keychain = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
/** The name the auth client stores its session under, so an offline launch can read it too. */
const sessionStorageKey = 'kuyara.account.session';
/**
 * Google's native sign-in library (`GoogleOneTapSignIn` of its Universal edition) is not in this
 * build, so Google sign-in fails closed (ADR 0041 section 1).
 */
const googleModule: GoogleOneTapModule | null = null;

/** A token read that may refresh never holds a re-ask longer than this; the re-ask goes without it. */
const accessTokenWaitMs = 3000;

export type LiveAccountSession = Readonly<{
  manager: AccountSessionManager;
  source: SqliteAccountRowsSource;
  autoRefresh: Readonly<{ start: () => void; stop: () => void }>;
  onAppleRevoked: (listener: () => void) => () => void;
  network: AccountNetwork;
  /** The session's access token for the member AI allowance, null when there is none. */
  accessToken: () => Promise<string | null>;
}>;

/** Google sign-in when both its library and its client settings are in the build, else null. */
function googleSignIn() {
  const settings = resolveGoogleSignInSettings();
  return googleModule !== null && settings !== null ? createGoogleSignIn(googleModule, settings) : null;
}

export function createLiveAccountSession({ database, fetcher, localProfileId, settings, workerBaseUrl }: Readonly<{
  database: SqliteDatabase;
  localProfileId: string;
  settings: SupabaseSettings;
  workerBaseUrl: string;
  fetcher: Fetch;
}>): LiveAccountSession {
  const storage = createEncryptedSessionStorage({
    keys: {
      get: () => SecureStore.getItemAsync(sessionKeyName, keychain),
      set: (encodedKey) => SecureStore.setItemAsync(sessionKeyName, encodedKey, keychain),
    },
    values: deviceKeyValueStore,
    cipher: deviceCrypto.aesGcm,
  });
  // Off, because on React Native the client would otherwise start its own refresh ticker that runs
  // in the background too; `connectAccountLifecycle` runs it in the foreground only (ADR 0041 section 9).
  const client = createClient(settings.url, settings.publishableKey, {
    auth: { storage, storageKey: sessionStorageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  });
  const source = createSqliteAccountRowsSource(database);
  const supabaseAuth = createSupabaseAccountAuth({
    client,
    apple: createExpoAppleSignIn(AppleAuthentication),
    google: googleSignIn(),
    nonce: createNonceSource(deviceCrypto),
    storedSession: () => storage.getItem(sessionStorageKey),
    removeStoredSession: () => storage.removeItem(sessionStorageKey),
  });
  // Signing out keeps everything on the phone and clears only the linked user (ADR 0041 section 6).
  const auth: AccountAuthPort = {
    ...supabaseAuth,
    async signOut() {
      await supabaseAuth.signOut();
      await source.saveLink(linkAfterSignOut(await source.link()));
    },
  };
  const consent = createSupabaseSyncConsent(client);
  const manager = createAccountSessionManager({
    auth,
    consent,
    now: systemDate,
    sync: createAccountSessionSync({
      source, consent, now: systemNow, remote: createSupabaseAccountRemote(client, localProfileId),
    }),
    deletion: createAccountDeletionClient(createWorkerAccountDeletion({
      baseUrl: workerBaseUrl,
      fetcher,
      resetLinkAndFlags: source.resetAfterDeletion,
      clearSession: supabaseAuth.signOut,
    })),
  });
  return {
    manager,
    source,
    autoRefresh: {
      start: () => void client.auth.startAutoRefresh(),
      stop: () => void client.auth.stopAutoRefresh(),
    },
    network: createNetworkState(Network),
    async accessToken() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), accessTokenWaitMs); });
      try {
        const read = client.auth.getSession().then(({ data, error }) => (error ? null : data.session?.access_token ?? null));
        return await Promise.race([read, late]);
      } finally {
        clearTimeout(timer);
      }
    },
    onAppleRevoked(listener) {
      // Off iOS the module is a stub whose listener call returns nothing, despite its type.
      const subscription = AppleAuthentication.addRevokeListener(listener) as ReturnType<typeof AppleAuthentication.addRevokeListener> | undefined;
      return () => subscription?.remove();
    },
  };
}
