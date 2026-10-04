import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionManager } from './account-session.ts';
import { createAccountDeletionClient } from './account-delete.ts';

const identity = { userId: 'user-a', provider: 'apple', email: 'ada@example.com', providers: ['apple'], accessToken: 'token' };

const given = { answer: 'given', textVersion: '2026-10-04', answeredAt: '2026-10-03T00:00:00.000Z' };

function setup(over = {}) {
  const calls = [];
  let current = over.current ?? null;
  let records = over.records ?? [given];
  const auth = {
    currentSession: async () => current,
    signIn: async (provider) => { calls.push(['signIn', provider]); current = { ...identity, provider }; return current; },
    signOut: async () => { calls.push(['signOut']); current = null; },
    refreshSession: async () => { calls.push(['refresh']); return current; },
    addProvider: async (provider) => { calls.push(['addProvider', provider]); current = { ...current, providers: [...current.providers, provider] }; return current; },
    reauthorizeDeletion: async () => ({ accessToken: 'fresh', appleAuthorizationCode: 'code' }),
    appleCredentialState: async () => 'authorized',
    ...over.auth,
  };
  const consentState = () => (records.at(-1)?.answer ?? 'none');
  const sync = {
    run: async (userId, first) => {
      calls.push(['sync', userId, first]);
      const records = consentState() === 'given';
      return { pendingChanges: 0, closetPieces: records ? 2 : 0, historyDays: records ? 3 : 0, syncConsent: consentState(), firstLink: over.firstLink ?? null };
    },
    ...over.sync,
  };
  const consent = {
    records: async (userId) => { calls.push(['readConsent', userId]); return records; },
    give: async (userId, answer) => { calls.push(['give', userId, answer]); records = [...records, { answer: 'given', ...answer }]; },
    withdraw: async (answer) => { calls.push(['withdraw', answer]); records = [...records, { answer: 'withdrawn', ...answer }]; },
    ...over.consent,
  };
  const deletion = { deleteAccount: async (request) => { calls.push(['delete', request]); return { kind: 'deleted', appleUnrevoked: false }; }, ...over.deletion };
  const manager = createAccountSessionManager({ auth, sync, deletion, consent, now: () => new Date('2026-10-03T01:00:00Z') });
  return { manager, calls };
}

test('sign-in owns the screen state; an answer given on another phone skips the sheet and syncs', async () => {
  const { manager, calls } = setup();
  manager.openSignIn('profile');
  await manager.signIn('apple');
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 2, days: 3, records: true });
  assert.deepEqual(calls, [['signIn', 'apple'], ['readConsent', 'user-a'], ['sync', 'user-a', 'signIn']]);
  assert.equal(manager.getSnapshot().consent.prompt, null);
});

test('a definitive end of the session at foreground signs out without deleting phone data', async () => {
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => null } });
  await manager.start();
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  await manager.foreground();
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: null });
  assert.deepEqual(calls, [['sync', 'user-a', 'restore'], ['signOut']]);
});

test('a foreground that cannot reach the auth service keeps the session signed in', async () => {
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => { calls.push(['refresh']); throw new Error('offline'); } } });
  await manager.start();
  await manager.foreground();
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.equal(calls.some(([name]) => name === 'signOut'), false);
});

test('a launch that cannot read the session ends nothing and reads it again at the next foreground', async () => {
  let reads = 0;
  const { manager, calls } = setup({ auth: { currentSession: async () => {
    reads += 1;
    if (reads === 1) throw new Error('unreadable');
    return identity;
  } } });
  await manager.start();
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  await manager.foreground();
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.equal(calls.some(([name]) => name === 'signOut'), false);
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
    deletion: { deleteAccount: async () => { attempted += 1; return { kind: 'deleted', appleUnrevoked: false }; } },
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

const answerAt = { textVersion: '2026-10-04', answeredAt: '2026-10-03T01:00:00.000Z' };

test('without an answer the consent sheet opens after sign-in and nothing syncs until it closes', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  const snapshot = manager.getSnapshot();
  assert.deepEqual(snapshot.consent, { prompt: 'signIn', status: 'idle' });
  assert.equal(snapshot.session.kind, 'signedIn');
  assert.equal(snapshot.session.syncConsent, 'none');
  assert.equal(snapshot.result, null);
  assert.equal(calls.some(([name]) => name === 'sync'), false);
});

test('continuing unticked declines: no record, sign-in completes and only name and gender sync', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  await manager.answerConsent(false);
  assert.equal(calls.some(([name]) => name === 'give'), false);
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'signIn']);
  assert.equal(manager.getSnapshot().consent.prompt, null);
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, records: false });
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
});

test('ticked records given with the text version and time, then the first link runs with it', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  await manager.answerConsent(true);
  const give = calls.findIndex(([name]) => name === 'give');
  assert.deepEqual(calls[give], ['give', 'user-a', answerAt]);
  assert.deepEqual(calls[give + 1], ['sync', 'user-a', 'signIn']);
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
  assert.equal(manager.getSnapshot().result.records, true);
});

test('a consent that cannot be recorded keeps the sheet open with an error and syncs nothing', async () => {
  const { manager, calls } = setup({ records: [], consent: { give: async () => { throw new Error('offline'); } } });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  await manager.answerConsent(true);
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'failed' });
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  await manager.answerConsent(false);
  assert.equal(manager.getSnapshot().consent.prompt, null);
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'signIn']);
});

test('closing the sheet over the consent question declines, completes sign-in and brings the sheet back with that result', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  manager.closeSheet();
  assert.equal(manager.getSnapshot().sheet, null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.equal(calls.some(([name]) => name === 'give'), false);
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'signIn']);
  assert.equal(manager.getSnapshot().sheet, 'profile');
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, records: false });
});

test('closing the sheet after a consent that could not be saved says the records do not sync', async () => {
  const { manager, calls } = setup({ records: [], consent: { give: async () => { throw new Error('offline'); } } });
  manager.openSignIn('detail');
  await manager.signIn('apple');
  await manager.answerConsent(true);
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'failed' });
  manager.closeSheet();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(manager.getSnapshot().sheet, 'detail');
  assert.equal(manager.getSnapshot().result.records, false);
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a', 'signIn']]);
});

test('while the consent question is open nothing syncs, and a foreground keeps the answer shown', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  await manager.foreground();
  await manager.localWrite();
  manager.syncNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
  await manager.answerConsent(false);
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a', 'signIn']]);
});

test('a foreground for the same account keeps its consent answer and counts on screen while it syncs', async () => {
  let runs = 0;
  const { manager } = setup({ current: identity, sync: { run: async () => {
    runs += 1;
    if (runs > 1) return new Promise(() => {}); // the foreground pass is still running
    return { pendingChanges: 0, closetPieces: 2, historyDays: 3, syncConsent: 'given', firstLink: null };
  } } });
  await manager.start();
  void manager.foreground();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runs, 2);
  assert.deepEqual(manager.getSnapshot().session.sync, { kind: 'syncing' });
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
  assert.equal(manager.getSnapshot().session.closetPieces, 2);
});

test('a withdrawn account shows no sheet at sign-in, and the Account screen offers it again', async () => {
  const withdrawn = { ...given, answer: 'withdrawn' };
  const { manager, calls } = setup({ records: [given, withdrawn] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  assert.equal(manager.getSnapshot().consent.prompt, null);
  assert.equal(manager.getSnapshot().session.syncConsent, 'withdrawn');
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'signIn']);
  manager.openConsent();
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'account', status: 'idle' });
  await manager.answerConsent(true);
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'manual']);
});

test('from the Account screen, closing or continuing unticked records nothing and changes nothing', async () => {
  const { manager, calls } = setup({ current: identity, records: [] });
  await manager.start();
  const before = calls.length;
  manager.openConsent();
  manager.closeConsent();
  assert.equal(manager.getSnapshot().consent.prompt, null);
  manager.openConsent();
  await manager.answerConsent(false);
  assert.equal(calls.length, before);
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
});

test('the Account screen never offers a consent the account already has', async () => {
  const { manager } = setup({ current: identity });
  await manager.start();
  manager.openConsent();
  assert.equal(manager.getSnapshot().consent.prompt, null);
});

test('withdrawing records it with the text version and time, then syncs without the records', async () => {
  const { manager, calls } = setup({ current: identity });
  await manager.start();
  await manager.withdrawConsent();
  assert.deepEqual(calls.at(-2), ['withdraw', answerAt]);
  assert.deepEqual(calls.at(-1), ['sync', 'user-a', 'manual']);
  const session = manager.getSnapshot().session;
  assert.equal(session.syncConsent, 'withdrawn');
  assert.equal(session.closetPieces, 0);
  assert.equal(session.kind, 'signedIn');
});

test('a withdrawal that fails changes nothing and says so', async () => {
  const { manager } = setup({ current: identity, consent: { withdraw: async () => { throw new Error('offline'); } } });
  await manager.start();
  await manager.withdrawConsent();
  assert.deepEqual(manager.getSnapshot().consent, { prompt: null, status: 'failed' });
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
});

test('an unrevoked Apple deletion reaches the result sheet', async () => {
  const { manager } = setup({ current: identity, deletion: { deleteAccount: async () => ({ kind: 'deleted', appleUnrevoked: true }) } });
  await manager.start();
  await manager.deleteAccount();
  assert.deepEqual(manager.getSnapshot().result, { kind: 'deleted', provider: 'apple', appleUnrevoked: true });
});

test('at launch, a revoked or missing Apple credential ends the session the way sign-out does', async () => {
  for (const state of ['revoked', 'notFound']) {
    const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: async () => state } });
    await manager.start();
    assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
    assert.deepEqual(calls, [['sync', 'user-a', 'signOut'], ['signOut']]);
  }
});

test('at launch, an authorized, transferred or unreadable Apple credential changes nothing', async () => {
  for (const check of [async () => 'authorized', async () => 'transferred', async () => { throw new Error('offline'); }]) {
    const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: check } });
    await manager.start();
    assert.equal(manager.getSnapshot().session.kind, 'signedIn');
    assert.equal(calls.some(([name]) => name === 'signOut'), false);
  }
});

test('the credential check runs only for an Apple session and only at launch', async () => {
  let checks = 0;
  const { manager } = setup({
    current: { ...identity, provider: 'google' },
    auth: { appleCredentialState: async () => { checks += 1; return 'revoked'; } },
  });
  await manager.start();
  await manager.foreground();
  assert.equal(checks, 0);
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
});

const counts = (piecesAdded, historyDaysAdded, piecesReceived, historyDaysReceived) =>
  ({ piecesAdded, historyDaysAdded, piecesReceived, historyDaysReceived });

test('the result after sign-in follows the first link: welcome, restore or merge, and without consent the welcome', async () => {
  const cases = [
    ['first account with phone data', [given], { counts: counts(4, 2, 0, 0), profileFrom: 'phone' },
      { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 4, days: 2, records: true }],
    ['new phone restoring', [given], { counts: counts(0, 0, 9, 5), profileFrom: 'account' },
      { kind: 'restored', pieces: 9, days: 5, profileFrom: 'account' }],
    ['second phone merging', [given], { counts: counts(3, 1, 9, 5), profileFrom: 'accountNameAndGender' },
      { kind: 'merged', counts: counts(3, 1, 9, 5), profileFrom: 'accountNameAndGender' }],
    ['sign-in without consent', [{ ...given, answer: 'withdrawn' }], { counts: counts(0, 0, 0, 0), profileFrom: 'accountNameAndGender' },
      { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, records: false }],
  ];
  for (const [name, records, firstLink, expected] of cases) {
    const { manager } = setup({ records, firstLink });
    manager.openSignIn('profile');
    await manager.signIn('apple');
    assert.deepEqual(manager.getSnapshot().result, expected, name);
  }
});

test('adding a method another account holds reports identityTaken; any other failure stays silent', async () => {
  const { AccountProviderError } = await import('./account-session.ts');
  const outcomes = [];
  for (const error of [new AccountProviderError('identityTaken'), new AccountProviderError('failed'), new Error('offline')]) {
    const { manager } = setup({ current: identity, auth: { addProvider: async () => { throw error; } } });
    await manager.start();
    outcomes.push(await manager.addProvider('google'));
    assert.deepEqual(manager.getSnapshot().session.providers, ['apple']);
  }
  assert.deepEqual(outcomes, ['identityTaken', 'unchanged', 'unchanged']);
  const linked = setup({ current: identity });
  await linked.manager.start();
  assert.equal(await linked.manager.addProvider('google'), 'linked');
  assert.equal(await linked.manager.addProvider('google'), 'unchanged');
});

test('a deletion whose phone cleanup fails still tells the person the account was deleted and ends the session', async () => {
  const deletion = createAccountDeletionClient({
    request: async () => ({ status: 200, body: { data: { status: 'deleted' } } }),
    cleanup: async () => { throw new Error('database is locked'); },
  });
  const { manager } = setup({ current: identity, deletion });
  await manager.start();
  await manager.deleteAccount();
  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.deletion, 'idle');
  assert.deepEqual(snapshot.session, { kind: 'signedOut', notice: 'deleted' });
  assert.deepEqual(snapshot.result, { kind: 'deleted', provider: 'apple', appleUnrevoked: false });
});
