import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';

import { createLiveAccountSession } from '@/features/account/data/live-account-session';
import type { AccountLink } from '@/features/account/domain/account-link';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';

const mockRemoveRevokeListener = jest.fn();
const mockUnsubscribeAuth = jest.fn();
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
  onAuthStateChange: jest.fn((_listener: (event: string) => void) => ({ data: { subscription: { unsubscribe: mockUnsubscribeAuth } } })),
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

test('every account request has a deadline, so a server that never answers cannot hold a sync or a sign-out', async () => {
  jest.useFakeTimers();
  const silent = jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  try {
    compose();
    const { global } = jest.mocked(createClient).mock.calls[0][2] as { global: { fetch: typeof fetch } };
    const request = global.fetch('https://project.supabase.co/rest/v1/wardrobe_items', { method: 'POST' });
    jest.advanceTimersByTime(15_000);
    await expect(request).rejects.toThrow('aborted');
  } finally {
    silent.mockRestore();
    jest.useRealTimers();
  }
});

test('a refresh the auth service could not answer reaches the client as unavailable, so the session stays', async () => {
  const paused = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', {
    status: 540, headers: { 'Content-Type': 'application/json' },
  }));
  try {
    compose();
    const { global } = jest.mocked(createClient).mock.calls[0][2] as { global: { fetch: typeof fetch } };
    const response = await global.fetch('https://project.supabase.co/auth/v1/token?grant_type=refresh_token', { method: 'POST' });
    expect(response.status).toBe(503);
  } finally {
    paused.mockRestore();
  }
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

test('a token refresh is observed through the auth client, other auth events are not, and the listener is removed again', () => {
  const listener = jest.fn();
  const remove = compose().onTokenRefreshed(listener);
  const authEvent = mockAuth.onAuthStateChange.mock.calls[0][0];
  authEvent('SIGNED_IN');
  authEvent('INITIAL_SESSION');
  expect(listener).not.toHaveBeenCalled();
  authEvent('TOKEN_REFRESHED');
  expect(listener).toHaveBeenCalledTimes(1);
  remove();
  expect(mockUnsubscribeAuth).toHaveBeenCalledTimes(1);
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
