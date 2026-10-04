import assert from 'node:assert/strict';
import test from 'node:test';

import { connectAccountLifecycle, localWriteDelayMs } from './account-lifecycle.ts';
import { accountScenarios, createInMemoryAccountScreens } from './account-screens.ts';

function harness({ snapshot = accountScenarios.upToDate, pending = true, dismissed = false, active = false } = {}) {
  const calls = [];
  const screens = createInMemoryAccountScreens(snapshot, () => new Date('2026-10-04T08:00:00Z'));
  const manager = {
    ...screens,
    start: async () => { calls.push('start'); },
    foreground: async () => { calls.push('foreground'); },
    localWrite: async () => { calls.push('localWrite'); },
    setOnline: () => {},
  };
  let appState = null;
  let write = null;
  const timers = [];
  const disconnect = connectAccountLifecycle({
    manager,
    onAppStateChange: (listener) => { appState = listener; return () => { appState = null; }; },
    isActive: () => active,
    onDatabaseWrite: (listener) => { write = listener; return () => { write = null; }; },
    hasPending: async (records) => { calls.push(['hasPending', records]); return pending; },
    autoRefresh: { start: () => calls.push('refresh:start'), stop: () => calls.push('refresh:stop') },
    card: { dismissed: async () => dismissed, dismiss: async () => { calls.push('card:stored'); } },
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
  return { calls, manager, disconnect, flush, timers, appState: (state) => appState(state), write: () => write() };
}

test('the session starts once at launch', async () => {
  const { calls } = harness();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.filter((call) => call === 'start'), ['start']);
});

test('connecting while the app is already in the foreground starts the token refresh at once', () => {
  assert.deepEqual(harness({ active: true }).calls.filter((call) => call === 'refresh:start'), ['refresh:start']);
  assert.deepEqual(harness({ active: false }).calls.filter((call) => call === 'refresh:start'), []);
});

test('the foreground syncs and runs the token refresh; the background stops it', () => {
  const { appState, calls } = harness();
  appState('background');
  appState('active');
  assert.deepEqual(calls.filter((call) => typeof call === 'string' && call !== 'start'),
    ['refresh:stop', 'refresh:start', 'foreground']);
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

test('signed out, a write starts nothing; during a pass it waits for the pass to end', async () => {
  const signedOut = harness({ snapshot: accountScenarios.signedOut });
  signedOut.write();
  await signedOut.flush();
  assert.equal(signedOut.calls.includes('localWrite'), false);

  const syncing = harness({ snapshot: accountScenarios.syncing });
  syncing.write();
  await syncing.flush();
  assert.equal(syncing.calls.includes('localWrite'), false);
  syncing.manager.load(accountScenarios.upToDate);
  await syncing.flush();
  assert.equal(syncing.calls.includes('localWrite'), true);
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
  const { calls, disconnect, flush, timers, write } = harness();
  write();
  disconnect();
  assert.equal(timers.every(({ cancelled }) => cancelled), true);
  await flush();
  assert.equal(calls.includes('localWrite'), false);
  assert.equal(calls.at(-1), 'refresh:stop');
});
