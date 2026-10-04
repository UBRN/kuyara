import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';

import { createLiveAccountSession } from '@/features/account/data/live-account-session';
import type { AccountLink } from '@/features/account/domain/account-link';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';

const mockRemoveRevokeListener = jest.fn();
jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationCredentialState: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2, TRANSFERRED: 3 },
  addRevokeListener: jest.fn(() => ({ remove: mockRemoveRevokeListener })),
}));
const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: jest.fn(async (name: string) => mockKeychain.get(name) ?? null),
  setItemAsync: jest.fn(async (name: string, value: string) => { mockKeychain.set(name, value); }),
}));
// A Google session, so the launch asks Apple nothing.
const mockAuth = {
  getSession: jest.fn(async () => ({
    data: { session: { user: { id: 'user-a', email: 'a@example.com', app_metadata: { provider: 'google' }, identities: [{ provider: 'google' }] } } },
    error: null,
  })),
  signOut: jest.fn(async () => ({ error: null })),
  startAutoRefresh: jest.fn(),
  stopAutoRefresh: jest.fn(),
};
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockAuth })),
  isAuthRetryableFetchError: () => false,
}));
const mockValues = new Map<string, string>();
jest.mock('@/infrastructure/sqlite/key-value-store', () => ({
  deviceKeyValueStore: {
    get: async (name: string) => mockValues.get(name) ?? null,
    set: async (name: string, value: string) => { mockValues.set(name, value); },
    remove: async (name: string) => { mockValues.delete(name); },
  },
}));
jest.mock('@/infrastructure/device-crypto', () => ({
  deviceCrypto: {
    randomBytes: (count: number) => new Uint8Array(count),
    sha256Hex: async () => 'hashed',
    aesGcm: {
      newKey: async () => 'session-key',
      seal: async () => 'sealed',
      open: async () => Uint8Array.from([123, 125]),
    },
  },
}));
const mockSavedLinks: AccountLink[] = [];
jest.mock('@/features/account/data/sqlite-account-rows-source', () => ({
  createSqliteAccountRowsSource: () => ({
    link: async () => ({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: null, recordsConsentRecordedAt: null, cursor: 'cursor-1' }),
    saveLink: async (link: AccountLink) => { mockSavedLinks.push(link); },
    resetAfterDeletion: async () => undefined,
  }),
}));

const settings = { url: 'https://project.supabase.co', publishableKey: 'sb_publishable_test' };
const compose = () => createLiveAccountSession({
  database: {} as SqliteDatabase, localProfileId: 'profile', settings, workerBaseUrl: 'https://worker.example', fetcher: fetch,
});
const clientOptions = () => jest.mocked(createClient).mock.calls[0][2] as {
  auth: { autoRefreshToken: boolean; storage: { getItem: (name: string) => Promise<string | null>; setItem: (name: string, value: string) => Promise<void> } };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockValues.clear();
  mockKeychain.clear();
  mockSavedLinks.length = 0;
});

test('the client never refreshes tokens by itself: the lifecycle runs the refresh in the foreground only', () => {
  const live = compose();
  expect(clientOptions().auth.autoRefreshToken).toBe(false);
  live.autoRefresh.start();
  live.autoRefresh.stop();
  expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);
  expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
});

test('the session key is written and read only as a this-device-only Keychain item', async () => {
  compose();
  const { storage } = clientOptions().auth;
  await storage.setItem('kuyara.account.session', '{}');
  expect(await storage.getItem('kuyara.account.session')).toBe('{}');
  const keychain = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  const calls = [...jest.mocked(SecureStore.getItemAsync).mock.calls, ...jest.mocked(SecureStore.setItemAsync).mock.calls];
  expect(calls.length).toBeGreaterThanOrEqual(3);
  for (const call of calls) expect(call.at(-1)).toEqual(keychain);
});

test('signing out clears the linked user and keeps the last one', async () => {
  const { manager } = compose();
  manager.setOnline(false);
  await manager.start();
  expect(manager.getSnapshot().session.kind).toBe('signedIn');
  await manager.signOut();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mockSavedLinks.at(-1)).toMatchObject({ userId: null, lastUserId: 'user-a', cursor: 'cursor-1' });
});

test('Apple revocation is observed through the native listener, and removed again', () => {
  const listener = jest.fn();
  const remove = compose().onAppleRevoked(listener);
  expect(AppleAuthentication.addRevokeListener).toHaveBeenCalledWith(listener);
  remove();
  expect(mockRemoveRevokeListener).toHaveBeenCalledTimes(1);
});

test('off iOS, where the native module returns no subscription, removing the listener does nothing', () => {
  jest.mocked(AppleAuthentication.addRevokeListener).mockReturnValueOnce(undefined as never);
  const remove = compose().onAppleRevoked(jest.fn());
  expect(remove).not.toThrow();
});
