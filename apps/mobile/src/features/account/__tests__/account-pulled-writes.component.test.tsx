const mockWriteListeners = new Set<() => void>();
let mockAccountsOpen = false;

jest.mock('@/features/account/application/account-screens-flag', () => ({
  get ACCOUNT_SCREENS_ENABLED() { return mockAccountsOpen; },
}));
jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({
  subscribeDatabaseWrites: (listener: () => void) => {
    mockWriteListeners.add(listener);
    return () => mockWriteListeners.delete(listener);
  },
}));

import { followWritesWhileAccountsOpen } from '@/features/account/application/account-pulled-writes';

const write = () => mockWriteListeners.forEach((listener) => listener());

describe('screens following the writes a sync pull lands', () => {
  afterEach(() => mockWriteListeners.clear());

  test('with accounts closed nothing is followed and the screen never reads again', () => {
    mockAccountsOpen = false;
    const listener = jest.fn();
    followWritesWhileAccountsOpen(listener)();
    write();
    expect(listener).not.toHaveBeenCalled();
    expect(mockWriteListeners.size).toBe(0);
  });

  test('with accounts open the screen reads at once and after each write until it stops following', () => {
    mockAccountsOpen = true;
    const listener = jest.fn();
    const stop = followWritesWhileAccountsOpen(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    write();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    write();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
