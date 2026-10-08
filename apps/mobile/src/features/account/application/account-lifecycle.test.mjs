import assert from 'node:assert/strict';
import test from 'node:test';

import { connectAccountLifecycle, localWriteDelayMs } from './account-lifecycle.ts';
import { accountScenarios, createInMemoryAccountScreens } from './account-screens.ts';

function harness({ snapshot = accountScenarios.upToDate, pending = true, dismissed = false, active = false, network = async () => true } = {}) {
  const calls = [];
  let networkChange = null;
  const online = [];
  const screens = createInMemoryAccountScreens(snapshot, () => new Date('2026-10-04T08:00:00Z'));
  const manager = {
    ...screens,
    start: async () => { calls.push('start'); },
    foreground: async () => { calls.push('foreground'); },
    localWrite: async () => { calls.push('localWrite'); },
    signOut: async () => { calls.push('signOut'); },
    appleRevoked: async () => { calls.push('appleRevoked'); },
    tokenRefreshed: () => { calls.push('tokenRefreshed'); },
    setOnline: (value) => { online.push(value); },
  };
  let appState = null;
  let write = null;
  let revoked = null;
  let refreshed = null;
  const timers = [];
  const disconnect = connectAccountLifecycle({
    manager,
    onAppStateChange: (listener) => { appState = listener; return () => { appState = null; }; },
    isActive: () => active,
    onDatabaseWrite: (listener) => { write = listener; return () => { write = null; }; },
    onAppleRevoked: (listener) => { revoked = listener; return () => { revoked = null; }; },
    onTokenRefreshed: (listener) => { refreshed = listener; return () => { refreshed = null; }; },
    hasPending: async (records) => { calls.push(['hasPending', records]); return pending; },
    autoRefresh: { start: () => calls.push('refresh:start'), stop: () => calls.push('refresh:stop') },
    card: { dismissed: async () => dismissed, dismiss: async () => { calls.push('card:stored'); } },
    network: {
      current: network,
      onChange: (listener) => { networkChange = listener; return () => { networkChange = null; }; },
    },
    schedule: (task, delay) => {
      const timer = { task, delay, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
  });
  const flush = async () => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.task();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { calls, online, manager, disconnect, flush, timers, appState: (state) => appState(state), write: () => write(), revoke: () => revoked?.(),
    refreshToken: () => refreshed?.(), refreshListening: () => refreshed !== null,
    networkChange: (online) => networkChange?.(online), networkListening: () => networkChange !== null };
}

test('the session starts once at launch', async () => {
  const { calls } = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.filter((call) => call === 'start'), ['start']);
});

test('the token refresh starts at connect only in the foreground, else at the first foreground', () => {
  assert.deepEqual(harness({ active: true }).calls.filter((call) => call === 'refresh:start'), ['refresh:start']);
  const background = harness({ active: false });
  assert.deepEqual(background.calls.filter((call) => call === 'refresh:start'), []);
  background.appState('active');
  assert.deepEqual(background.calls.filter((call) => call === 'refresh:start'), ['refresh:start']);
});

test('the foreground syncs and runs the token refresh; the background stops it', () => {
  const { appState, calls } = harness();
  appState('background');
  appState('active');
  assert.deepEqual(calls.filter((call) => typeof call === 'string' && call !== 'start'),
    ['refresh:stop', 'refresh:start', 'foreground']);
});

test('returning to active without passing through the background runs no sync, only the token refresh', () => {
  const { appState, calls } = harness({ active: true });
  const after = (index) => calls.slice(index).filter((call) => typeof call === 'string' && call !== 'start');
  appState('inactive');
  appState('active');
  assert.deepEqual(after(0), ['refresh:start', 'refresh:stop', 'refresh:start']);
  const mark = calls.length;
  appState('inactive');
  appState('background');
  appState('active');
  assert.deepEqual(after(mark), ['refresh:stop', 'refresh:stop', 'refresh:start', 'foreground']);
});

test('a burst of local writes is one sync, after the delay, only while a row waits', async () => {
  const { calls, flush, timers, write } = harness();
  write(); write(); write();
  assert.equal(timers.filter(({ cancelled }) => !cancelled).length, 1);
  assert.equal(timers[0].delay, localWriteDelayMs);
  await flush();
  assert.deepEqual(calls.filter((call) => call === 'localWrite' || Array.isArray(call)),
    [['hasPending', true], 'localWrite']);
});

test('without the consent only a waiting profile counts, and nothing waiting means no pass', async () => {
  const { calls, flush, write } = harness({ snapshot: accountScenarios.recordsNotSynced, pending: false });
  write();
  await flush();
  assert.deepEqual(calls.filter((call) => call === 'localWrite' || Array.isArray(call)), [['hasPending', false]]);
});

test('signed out, a write starts nothing; during a pass it asks the manager once, which runs it after the pass', async () => {
  const signedOut = harness({ snapshot: accountScenarios.signedOut });
  signedOut.write();
  await signedOut.flush();
  assert.equal(signedOut.calls.includes('localWrite'), false);

  const syncing = harness({ snapshot: accountScenarios.syncing });
  syncing.write();
  assert.equal(syncing.timers.length, 1);
  await syncing.flush();
  assert.deepEqual(syncing.calls.filter((call) => call === 'localWrite'), ['localWrite']);
  syncing.manager.load(accountScenarios.upToDate);
  await syncing.flush();
  assert.deepEqual(syncing.calls.filter((call) => call === 'localWrite'), ['localWrite']);
  assert.equal(syncing.timers.length, 0);
});

test('Apple revoking kuyara goes to the manager, which knows whether this phone holds that Apple credential', async () => {
  // The account's creation provider decides nothing: an account created with Google may hold Apple here.
  const google = harness();
  google.manager.load({ ...accountScenarios.upToDate,
    session: { ...accountScenarios.upToDate.session, provider: 'google', providers: ['apple', 'google'] } });
  google.revoke();
  assert.deepEqual(google.calls.filter((call) => call === 'appleRevoked' || call === 'signOut'), ['appleRevoked']);
});

test('the card dismissal is stored once and restored at launch', async () => {
  const fresh = harness({ snapshot: accountScenarios.signedOut });
  fresh.manager.dismissCard();
  fresh.manager.dismissCard();
  assert.deepEqual(fresh.calls.filter((call) => call === 'card:stored'), ['card:stored']);

  const restored = harness({ snapshot: accountScenarios.signedOut, dismissed: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(restored.manager.getSnapshot().cardDismissed, true);
  assert.equal(restored.calls.includes('card:stored'), false);
});

test('disconnecting stops the refresh and every listener', async () => {
  const { calls, disconnect, flush, revoke, timers, write } = harness();
  write();
  disconnect();
  revoke();
  assert.equal(calls.includes('appleRevoked'), false);
  assert.equal(timers.every(({ cancelled }) => cancelled), true);
  await flush();
  assert.equal(calls.includes('localWrite'), false);
  assert.equal(calls.at(-1), 'refresh:stop');
});

test('the connection read at connect and every change after it reach the session', async () => {
  const { disconnect, networkChange, networkListening, online } = harness({ network: async () => false });
  await new Promise((resolve) => setImmediate(resolve));
  networkChange(true);
  networkChange(false);
  assert.deepEqual(online, [false, true, false]);
  disconnect();
  assert.equal(networkListening(), false);
});

test('a connection read that fails leaves the session as it is', async () => {
  const { online } = harness({ network: async () => { throw new Error('No answer.'); } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(online, []);
});

test('a change that arrives before the first read answers is not overwritten by that older read', async () => {
  let answer;
  const harnessed = harness({ network: () => new Promise((resolve) => { answer = resolve; }) });
  harnessed.networkChange(false);
  answer(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harnessed.online, [false]);
});

test('a token refresh reaches the manager, which runs a pass that waited for a token, until disconnect', () => {
  const { calls, disconnect, refreshListening, refreshToken } = harness();
  refreshToken();
  assert.deepEqual(calls.filter((call) => call === 'tokenRefreshed'), ['tokenRefreshed']);
  disconnect();
  assert.equal(refreshListening(), false);
});
