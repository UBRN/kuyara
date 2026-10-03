import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionManager } from './account-session.ts';

const identity = { userId: 'user-a', provider: 'apple', email: 'ada@example.com', providers: ['apple'], accessToken: 'token' };

function setup(over = {}) {
  const calls = [];
  let current = over.current ?? null;
  const auth = {
    currentSession: async () => current,
    signIn: async (provider) => { calls.push(['signIn', provider]); current = { ...identity, provider }; return current; },
    signOut: async () => { calls.push(['signOut']); current = null; },
    refreshSession: async () => { calls.push(['refresh']); return current; },
    addProvider: async (provider) => { calls.push(['addProvider', provider]); current = { ...current, providers: [...current.providers, provider] }; return current; },
    reauthorizeDeletion: async () => ({ accessToken: 'fresh', appleAuthorizationCode: 'code' }),
    ...over.auth,
  };
  const sync = { run: async (userId, first) => { calls.push(['sync', userId, first]); return { pendingChanges: 0, closetPieces: 2, historyDays: 3 }; }, ...over.sync };
  const deletion = { deleteAccount: async (request) => { calls.push(['delete', request]); return { kind: 'deleted' }; }, ...over.deletion };
  const manager = createAccountSessionManager({ auth, sync, deletion, now: () => new Date('2026-10-03T01:00:00Z') });
  return { manager, calls };
}

test('sign-in owns the screen state and starts the first sync', async () => {
  const { manager, calls } = setup();
  manager.openSignIn('profile');
  await manager.signIn('apple');
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 2, days: 3 });
  assert.deepEqual(calls, [['signIn', 'apple'], ['sync', 'user-a', 'signIn']]);
});

test('current session restores on start, refresh failure signs out without deleting phone data', async () => {
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => { throw new Error('expired'); } } });
  await manager.start();
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  await manager.foreground();
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: null });
  assert.deepEqual(calls, [['sync', 'user-a', 'restore'], ['signOut']]);
});

test('sign-out attempts sync, then clears local session even when sync fails', async () => {
  const { manager, calls } = setup({ current: identity, sync: { run: async () => { throw new Error('offline'); } } });
  await manager.start();
  await manager.signOut();
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  assert.deepEqual(calls, [['signOut']]);
});

test('deletion requires online success before local cleanup or signed-out result', async () => {
  let cleaned = 0;
  const { manager } = setup({ current: identity, deletion: { deleteAccount: async () => ({ kind: 'failed', code: 'unavailable' }), cleanup: async () => { cleaned += 1; } } });
  await manager.start();
  await manager.deleteAccount();
  assert.equal(manager.getSnapshot().deletion, 'failed');
  assert.equal(cleaned, 0);
});

test('offline deletion never asks for reauthorization or calls the deletion client', async () => {
  let attempted = 0;
  const { manager } = setup({ current: identity,
    auth: { reauthorizeDeletion: async () => { attempted += 1; return null; } },
    deletion: { deleteAccount: async () => { attempted += 1; return { kind: 'deleted' }; } },
  });
  await manager.start();
  manager.setOnline(false);
  await manager.deleteAccount();
  assert.equal(attempted, 0);
  assert.equal(manager.getSnapshot().deletion, 'idle');
});

test('closing the sign-in sheet cancels its pending result', async () => {
  let finish;
  const { manager, calls } = setup({ auth: { signIn: async () => new Promise((resolve) => { finish = resolve; }) } });
  manager.openSignIn('profile');
  const pending = manager.signIn('apple');
  manager.closeSheet();
  finish(identity);
  await pending;
  assert.equal(manager.getSnapshot().sheet, null);
  assert.equal(manager.getSnapshot().result, null);
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  assert.deepEqual(calls, [['signOut']]);
});
