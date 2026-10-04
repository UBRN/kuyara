import { liveLifecyclePorts } from '@/features/account/application/account-application-provider';
import { connectAccountLifecycle } from '@/features/account/application/account-lifecycle';
import { accountScenarios, createInMemoryAccountScreens } from '@/features/account/application/account-screens';
import type { LiveAccountSession } from '@/features/account/data/live-account-session';

jest.mock('@/infrastructure/sqlite/open-migrated-database', () => ({ openMigratedDatabase: async () => ({}) }));
jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({ subscribeDatabaseWrites: () => () => undefined }));

function liveSession() {
  let revoked: (() => void) | null = null;
  let networkChange: ((online: boolean) => void) | null = null;
  const screens = createInMemoryAccountScreens(accountScenarios.upToDate);
  const manager = { ...screens, start: jest.fn(async () => undefined), foreground: jest.fn(async () => undefined), signOut: jest.fn(async () => undefined),
    setOnline: jest.fn() };
  const live = {
    manager,
    source: { hasPending: async () => false, cardDismissed: async () => false, dismissCard: async () => undefined },
    autoRefresh: { start: jest.fn(), stop: jest.fn() },
    network: {
      current: async () => true,
      onChange: (listener: (online: boolean) => void) => {
        networkChange = listener;
        return () => { networkChange = null; };
      },
    },
    onAppleRevoked: (listener: () => void) => {
      revoked = listener;
      return () => { revoked = null; };
    },
  };
  return { live: live as unknown as LiveAccountSession, manager, revoke: () => revoked?.(), listening: () => revoked !== null,
    goOffline: () => networkChange?.(false) };
}

describe('the live account session in the app', () => {
  test('Apple revoking kuyara while the app runs ends the session through the manager sign-out', () => {
    const { live, listening, manager, revoke } = liveSession();
    const disconnect = connectAccountLifecycle(liveLifecyclePorts(live));
    expect(listening()).toBe(true);
    revoke();
    expect(manager.signOut).toHaveBeenCalledTimes(1);
    disconnect();
    expect(listening()).toBe(false);
  });

  test('the device losing its connection reaches the session, so the offline lines show', () => {
    const { goOffline, live, manager } = liveSession();
    const disconnect = connectAccountLifecycle(liveLifecyclePorts(live));
    goOffline();
    expect(manager.setOnline).toHaveBeenCalledWith(false);
    disconnect();
  });
});
