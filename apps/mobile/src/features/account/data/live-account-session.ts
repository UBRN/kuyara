import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
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

export type LiveAccountSession = Readonly<{
  manager: AccountSessionManager;
  source: SqliteAccountRowsSource;
  autoRefresh: Readonly<{ start: () => void; stop: () => void }>;
}>;

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
  const client = createClient(settings.url, settings.publishableKey, {
    auth: { storage, storageKey: sessionStorageKey, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const source = createSqliteAccountRowsSource(database);
  const supabaseAuth = createSupabaseAccountAuth({
    client,
    apple: createExpoAppleSignIn(AppleAuthentication),
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
  };
}
