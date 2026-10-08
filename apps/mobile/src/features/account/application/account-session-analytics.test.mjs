import assert from 'node:assert/strict';
import test from 'node:test';

import { AccountProviderError, createAccountSessionManager } from './account-session.ts';
import { AccountRemoteError } from './account-sync.ts';
import { analyticsEventPropertyKeys } from '../../analytics/domain/analytics-events.ts';

const identity = { userId: 'user-a', provider: 'apple', email: 'ada@example.com', providers: ['apple'] };
const given = { answer: 'given', textVersion: '2026-10-04', answeredAt: '2026-10-03T00:00:00.000Z' };
const schema_version = 4;

function setup(over = {}) {
  const events = [];
  let current = over.current ?? null;
  const auth = {
    currentSession: async () => current,
    signIn: async (provider) => { current = { ...identity, provider }; return current; },
    signOut: async () => { current = null; },
    refreshSession: async () => current && { ...current },
    addProvider: async () => current,
    reauthorizeDeletion: async () => ({ accessToken: 'fresh' }),
    appleCredentialState: async () => 'authorized',
    ...over.auth,
  };
  const sync = {
    hasLinked: async () => true,
    run: async () => ({ pendingChanges: 0, closetPieces: 2, historyDays: 3, syncConsent: 'given', firstLink: null }),
    ...over.sync,
  };
  const manager = createAccountSessionManager({
    auth,
    sync,
    deletion: { deleteAccount: async () => ({ kind: 'deleted', appleUnrevoked: false }), ...over.deletion },
    consent: { records: async () => [given], give: async () => {}, withdraw: async () => {} },
    consentQuestion: { wasOpen: async () => false, setOpen: async () => {} },
    appleMark: { userId: async () => over.appleUser ?? null, set: async () => {} },
    capture: over.noCapture ? undefined : (name, properties) => events.push([name, properties]),
    now: () => new Date('2026-10-03T01:00:00Z'),
  });
  return { manager, events };
}

const named = (events, name) => events.filter(([eventName]) => eventName === name).map(([, properties]) => properties);

test('a sign-in that works reports its provider and success, once', async () => {
  const { manager, events } = setup();
  manager.openSignIn('profile');
  await manager.signIn('google');
  assert.deepEqual(named(events, 'account_sign_in_finished'), [{ schema_version, provider: 'google', result: 'success' }]);
});

test('a cancelled sign-in is a result, not a failure', async () => {
  const { manager, events } = setup({ auth: { signIn: async () => null } });
  await manager.signIn('apple');
  assert.deepEqual(named(events, 'account_sign_in_finished'), [{ schema_version, provider: 'apple', result: 'cancelled' }]);
});

test('a failed sign-in carries a closed category from the provider error, or failed', async () => {
  for (const [thrown, category] of [
    [new AccountProviderError('unavailable'), 'unavailable'],
    [new AccountProviderError('failed'), 'failed'],
    [new Error('token expired for ada@example.com'), 'failed'],
  ]) {
    const { manager, events } = setup({ auth: { signIn: async () => { throw thrown; } } });
    await manager.signIn('apple');
    assert.deepEqual(named(events, 'account_sign_in_finished'), [
      { schema_version, provider: 'apple', result: 'failed', failure_category: category },
    ]);
  }
});

test('a sign-in tried offline reports an offline failure', async () => {
  const { manager, events } = setup();
  manager.setOnline(false);
  await manager.signIn('apple');
  assert.deepEqual(named(events, 'account_sign_in_finished'), [
    { schema_version, provider: 'apple', result: 'failed', failure_category: 'offline' },
  ]);
});

test('a step after the exchange that throws is not reported as a second, failed sign-in', async () => {
  const { manager, events } = setup({ sync: { run: async () => { throw new Error('boom'); } } });
  await manager.signIn('apple');
  assert.deepEqual(named(events, 'account_sign_in_finished'), [{ schema_version, provider: 'apple', result: 'success' }]);
});

test('sync outcomes carry their trigger and, on failure, a closed category', async () => {
  let fail = null;
  const { manager, events } = setup({
    current: identity,
    sync: { run: async () => { if (fail) throw fail; return { pendingChanges: 0, closetPieces: 0, historyDays: 0, syncConsent: 'given', firstLink: null }; } },
  });
  await manager.start();
  await manager.localWrite();
  fail = new AccountRemoteError('request');
  await manager.localWrite();
  fail = new Error('SQLITE_FULL on ada@example.com');
  await manager.foreground();
  assert.deepEqual(named(events, 'account_sync_finished'), [
    { schema_version, trigger: 'foreground', result: 'success' },
    { schema_version, trigger: 'local_write', result: 'success' },
    { schema_version, trigger: 'local_write', result: 'failed', failure_category: 'request' },
    { schema_version, trigger: 'foreground', result: 'failed', failure_category: 'other' },
  ]);
});

test('the same trigger and outcome is reported once per process, a changed outcome again', async () => {
  const { manager, events } = setup({ current: identity });
  await manager.start();
  await manager.localWrite();
  await manager.localWrite();
  await manager.localWrite();
  assert.deepEqual(named(events, 'account_sync_finished').map((properties) => properties.trigger), ['foreground', 'local_write']);
});

test('a pass that does not run reports nothing', async () => {
  const { manager, events } = setup({ current: identity });
  await manager.start();
  events.length = 0;
  manager.setOnline(false);
  await manager.localWrite();
  assert.deepEqual(events, []);
});

test('the manual trigger and the sign-out flush are named', async () => {
  const { manager, events } = setup({ current: identity });
  await manager.start();
  manager.syncNow();
  await manager.signOut();
  assert.deepEqual(named(events, 'account_sync_finished').map((properties) => properties.trigger), ['foreground', 'manual', 'sign_out']);
});

test('an explicit sign-out reports account_signed_out with no property but the schema version', async () => {
  const { manager, events } = setup({ current: identity });
  await manager.start();
  await manager.signOut();
  assert.deepEqual(named(events, 'account_signed_out'), [{ schema_version }]);
});

test('an Apple revocation ends the session without an explicit sign-out event', async () => {
  const { manager, events } = setup({ current: identity, appleUser: identity.userId });
  await manager.start();
  await manager.appleRevoked();
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  assert.deepEqual(named(events, 'account_signed_out'), []);
});

test('a deletion reports success, a cancel, and a failure with the Worker code', async () => {
  const deleted = setup({ current: identity });
  await deleted.manager.start();
  await deleted.manager.deleteAccount();
  assert.deepEqual(named(deleted.events, 'account_deleted'), [{ schema_version, result: 'success' }]);

  const cancelled = setup({ current: identity, auth: { reauthorizeDeletion: async () => null } });
  await cancelled.manager.start();
  await cancelled.manager.deleteAccount();
  assert.deepEqual(named(cancelled.events, 'account_deleted'), [{ schema_version, result: 'cancelled' }]);

  const refused = setup({ current: identity, deletion: { deleteAccount: async () => ({ kind: 'failed', code: 'rate_limited' }) } });
  await refused.manager.start();
  await refused.manager.deleteAccount();
  assert.deepEqual(named(refused.events, 'account_deleted'), [{ schema_version, result: 'failed', failure_category: 'rate_limited' }]);

  const thrown = setup({ current: identity, auth: { reauthorizeDeletion: async () => { throw new AccountProviderError('failed'); } } });
  await thrown.manager.start();
  await thrown.manager.deleteAccount();
  assert.deepEqual(named(thrown.events, 'account_deleted'), [{ schema_version, result: 'failed', failure_category: 'unknown' }]);
});

test('no account event carries an identity, an email, a count or a timestamp', async () => {
  const { manager, events } = setup({ current: identity, appleUser: identity.userId });
  await manager.start();
  manager.openSignIn('profile');
  await manager.signOut();
  await manager.signIn('google');
  await manager.deleteAccount();
  assert.ok(events.length > 3);
  const allowed = new Set(Object.values(analyticsEventPropertyKeys).flat());
  for (const [name, properties] of events) {
    for (const key of Object.keys(properties)) assert.ok(allowed.has(key), `${name}.${key}`);
    const text = JSON.stringify(properties);
    for (const forbidden of ['user-a', 'ada@example.com', '2026', 'token']) {
      assert.equal(text.includes(forbidden), false, `${name} carries ${forbidden}`);
    }
  }
});

test('a manager without a capture reports nothing and behaves the same', async () => {
  const { manager } = setup({ noCapture: true });
  await manager.signIn('apple');
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
});
