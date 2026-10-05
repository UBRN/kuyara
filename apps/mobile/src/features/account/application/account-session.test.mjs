import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionManager } from './account-session.ts';
import { createAccountDeletionClient } from './account-delete.ts';
import { fetchWithTimeout } from '../../../infrastructure/network/fetch-json-with-timeout.ts';

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
    // The auth service hands out a new object on every refresh.
    refreshSession: async () => { calls.push(['refresh']); return current && { ...current }; },
    addProvider: async (provider) => { calls.push(['addProvider', provider]); current = { ...current, providers: [...current.providers, provider] }; return current; },
    reauthorizeDeletion: async () => ({ accessToken: 'fresh', appleAuthorizationCode: 'code' }),
    appleCredentialState: async () => 'authorized',
    ...over.auth,
  };
  const consentState = () => (records.at(-1)?.answer ?? 'none');
  const sync = {
    // A phone that has run a pass with the account before; a launch test of a phone new to it says so.
    hasLinked: async () => true,
    run: async (userId) => {
      calls.push(['sync', userId]);
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
  // The device-local marker of a consent question left open; the fake keeps it in `question.open`.
  const question = over.question ?? { open: false };
  const consentQuestion = { wasOpen: async () => question.open, setOpen: async (open) => { question.open = open; } };
  const manager = createAccountSessionManager({ auth, sync, deletion, consent, consentQuestion, now: () => new Date('2026-10-03T01:00:00Z') });
  return { manager, calls, question };
}

/** A promise the test settles by hand, to hold a port call open. */
function held() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('sign-in owns the screen state; an answer given on another phone skips the sheet and syncs', async () => {
  const { manager, calls } = setup();
  manager.openSignIn('profile');
  await manager.signIn('apple');
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 2, days: 3, added: 'records' });
  assert.deepEqual(calls, [['signIn', 'apple'], ['readConsent', 'user-a'], ['sync', 'user-a']]);
  assert.equal(manager.getSnapshot().consent.prompt, null);
});

test('a definitive end of the session at foreground signs out without deleting phone data', async () => {
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => null } });
  await manager.start();
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
  await manager.foreground();
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: null });
  assert.deepEqual(calls, [['sync', 'user-a'], ['signOut']]);
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

test('a failed deletion keeps the session and shows no result', async () => {
  const { manager } = setup({ current: identity, deletion: { deleteAccount: async () => ({ kind: 'failed', code: 'unavailable' }) } });
  await manager.start();
  await manager.deleteAccount();
  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.deletion, 'failed');
  assert.equal(snapshot.session.kind, 'signedIn');
  assert.equal(snapshot.result, null);
});

test('cancelling Apple or Face ID before a deletion deletes nothing and changes nothing', async () => {
  const { manager, calls } = setup({ current: identity, auth: { reauthorizeDeletion: async () => null } });
  await manager.start();
  await manager.deleteAccount();
  const snapshot = manager.getSnapshot();
  assert.equal(calls.some(([name]) => name === 'delete'), false);
  assert.equal(snapshot.deletion, 'idle');
  assert.equal(snapshot.session.kind, 'signedIn');
  assert.equal(snapshot.result, null);
});

test('a reauthorization that fails deletes nothing and says so', async () => {
  const { manager, calls } = setup({ current: identity, auth: { reauthorizeDeletion: async () => { throw new Error('offline'); } } });
  await manager.start();
  await manager.deleteAccount();
  assert.equal(calls.some(([name]) => name === 'delete'), false);
  assert.equal(manager.getSnapshot().deletion, 'failed');
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
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
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
  assert.equal(manager.getSnapshot().consent.prompt, null);
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, added: 'profile' });
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
});

test('ticked records given with the text version and time, then the first link runs with it', async () => {
  const { manager, calls } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  await manager.answerConsent(true);
  const give = calls.findIndex(([name]) => name === 'give');
  assert.deepEqual(calls[give], ['give', 'user-a', answerAt]);
  assert.deepEqual(calls[give + 1], ['sync', 'user-a']);
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
  assert.equal(manager.getSnapshot().result.added, 'records');
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
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
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
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
  assert.equal(manager.getSnapshot().sheet, 'profile');
  assert.deepEqual(manager.getSnapshot().result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, added: 'profile' });
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
  assert.equal(manager.getSnapshot().result.added, 'profile');
  assert.equal(manager.getSnapshot().session.syncConsent, 'none');
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a']]);
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
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a']]);
});

test('a launch after the app closed over the consent question asks it again app-wide before any pass', async () => {
  const { manager, calls, question } = setup({ current: identity, records: [], sync: { hasLinked: async () => false }, question: { open: true } });
  await manager.start();
  const snapshot = manager.getSnapshot();
  assert.equal(snapshot.session.kind, 'signedIn');
  assert.equal(snapshot.session.syncConsent, 'none');
  assert.equal(snapshot.sheet, 'app');
  assert.deepEqual(snapshot.consent, { prompt: 'signIn', status: 'idle' });
  await manager.foreground();
  await manager.localWrite();
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  await manager.answerConsent(true);
  assert.deepEqual(calls.filter(([name]) => name === 'give' || name === 'sync').map(([name]) => name), ['give', 'sync']);
  assert.equal(manager.getSnapshot().sheet, 'app');
  assert.equal(manager.getSnapshot().result.added, 'records');
  assert.equal(question.open, false);
});

test('a launch whose consent answer cannot be read, on a phone new to the account, asks before any pass', async () => {
  const { manager, calls } = setup({ current: identity, sync: { hasLinked: async () => false }, question: { open: true },
    consent: { records: async () => { throw new Error('offline'); } } });
  await manager.start();
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
  assert.equal(calls.some(([name]) => name === 'sync'), false);
});

test('a launch asks nothing when no question was left open, the account holds an answer or this phone has linked to it', async () => {
  for (const [records, linked, open] of [[[], false, false], [[given], false, true], [[], true, true]]) {
    const { manager, calls, question } = setup({ current: identity, records, sync: { hasLinked: async () => linked }, question: { open } });
    await manager.start();
    assert.equal(manager.getSnapshot().consent.prompt, null);
    assert.equal(manager.getSnapshot().sheet, null);
    assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
    // A marker the account or the link has settled is cleared.
    assert.equal(question.open, false);
  }
});

test('while a restored session checks for a question left open, a local write runs no pass', async () => {
  const read = held();
  const { manager, calls } = setup({ current: identity, sync: { hasLinked: async () => false }, question: { open: true },
    consent: { records: async () => read.promise } });
  const starting = manager.start();
  await settle();
  // The consent read is slow; a write lands meanwhile.
  await manager.localWrite();
  manager.syncNow();
  await settle();
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  read.resolve([]);
  await starting;
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
  assert.equal(calls.some(([name]) => name === 'sync'), false);
});

test('while a restored session checks for a question left open, a pass waits, and runs once the question is not asked', async () => {
  const read = held();
  const { manager, calls } = setup({ current: identity, sync: { hasLinked: async () => false }, question: { open: true },
    consent: { records: async () => read.promise } });
  const starting = manager.start();
  await settle();
  await manager.localWrite();
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  read.resolve([given]);
  await starting;
  assert.equal(manager.getSnapshot().consent.prompt, null);
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a']]);
});

test('the sign-in question is marked open on this phone until it is answered either way', async () => {
  for (const answer of [true, false]) {
    const { manager, question } = setup({ records: [] });
    manager.openSignIn('profile');
    await manager.signIn('apple');
    assert.equal(question.open, true);
    await manager.answerConsent(answer);
    assert.equal(question.open, false);
  }
  const { manager, question } = setup({ records: [] });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  manager.closeSheet();
  await settle();
  assert.equal(question.open, false);
});

test('a declined question is not asked again at a foreground, online or offline, while the first link has not run', async () => {
  for (const online of [true, false]) {
    const { manager, calls } = setup({ records: [], sync: { hasLinked: async () => false,
      run: async (userId) => { calls.push(['sync', userId]); throw new Error('offline'); } } });
    manager.openSignIn('profile');
    await manager.signIn('apple');
    manager.setOnline(online);
    await manager.answerConsent(false);
    manager.closeSheet();
    await manager.foreground();
    assert.equal(manager.getSnapshot().consent.prompt, null);
    assert.equal(manager.getSnapshot().sheet, null);
  }
});

test('a question open when the app was killed is asked at the next launch', async () => {
  const question = { open: false };
  const first = setup({ records: [], question });
  first.manager.openSignIn('profile');
  await first.manager.signIn('apple');
  assert.equal(question.open, true);
  // The app is killed here; the next launch restores the stored session.
  const next = setup({ current: identity, records: [], sync: { hasLinked: async () => false }, question });
  await next.manager.start();
  assert.deepEqual(next.manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
  assert.equal(next.manager.getSnapshot().sheet, 'app');
  assert.equal(next.calls.some(([name]) => name === 'sync'), false);
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
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
  manager.openConsent();
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'account', status: 'idle' });
  await manager.answerConsent(true);
  assert.equal(manager.getSnapshot().session.syncConsent, 'given');
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
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
  assert.deepEqual(calls.at(-1), ['sync', 'user-a']);
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

test('an unrevoked Apple deletion reaches the result sheet, which shows app-wide wherever the person is', async () => {
  const { manager } = setup({ current: identity, deletion: { deleteAccount: async () => ({ kind: 'deleted', appleUnrevoked: true }) } });
  await manager.start();
  manager.openSignIn('profile');
  manager.closeSheet();
  await manager.deleteAccount();
  assert.deepEqual(manager.getSnapshot().result, { kind: 'deleted', provider: 'apple', appleUnrevoked: true });
  assert.equal(manager.getSnapshot().sheet, 'app');
});

test('at launch, a revoked or missing Apple credential ends the session the way sign-out does', async () => {
  for (const state of ['revoked', 'notFound']) {
    const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: async () => state } });
    await manager.start();
    assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
    assert.deepEqual(calls, [['sync', 'user-a'], ['signOut']]);
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

test('at every foreground, a revoked or missing Apple credential ends the session the way launch does', async () => {
  for (const state of ['revoked', 'notFound']) {
    let answer = 'authorized';
    const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: async () => answer } });
    await manager.start();
    assert.equal(manager.getSnapshot().session.kind, 'signedIn');
    calls.length = 0;
    answer = state;
    await manager.foreground();
    assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
    // The refresh comes first; the one pass that follows uploads, then the session ends, with no restore pass before it.
    assert.deepEqual(calls, [['refresh'], ['sync', 'user-a'], ['signOut']]);
  }
});

test('at a foreground, an authorized, transferred or unreadable Apple credential keeps the session', async () => {
  for (const check of [async () => 'authorized', async () => 'transferred', async () => { throw new Error('offline'); }]) {
    const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: check } });
    await manager.start();
    await manager.foreground();
    assert.equal(manager.getSnapshot().session.kind, 'signedIn');
    assert.equal(calls.some(([name]) => name === 'signOut'), false);
  }
});

test('a foreground whose refresh cannot answer never asks Apple', async () => {
  let checks = 0;
  let reachable = true;
  const { manager } = setup({ current: identity, auth: {
    refreshSession: async () => { if (!reachable) throw new Error('offline'); return { ...identity }; },
    appleCredentialState: async () => { checks += 1; return reachable ? 'authorized' : 'revoked'; },
  } });
  await manager.start();
  const atLaunch = checks;
  reachable = false;
  await manager.foreground();
  assert.equal(checks, atLaunch);
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
});

test('a Google session never asks Apple, at launch or at a foreground', async () => {
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

test('a foreground that finds the Apple credential revoked while a pass runs ends the session after that pass', async () => {
  const gate = held();
  let passes = 0;
  const { manager, calls } = setup({ current: identity, sync: { run: async (userId) => {
    passes += 1;
    calls.push(['sync', userId]);
    if (passes === 1) await gate.promise;
    return { pendingChanges: 0, closetPieces: 0, historyDays: 0, syncConsent: 'given', firstLink: null };
  } }, auth: { appleCredentialState: async () => (passes > 0 ? 'revoked' : 'authorized') } });
  const started = manager.start();
  await settle();
  const foregrounded = manager.foreground();
  await settle();
  gate.resolve();
  await started;
  await foregrounded;
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
  assert.equal(calls.filter(([name]) => name === 'signOut').length, 1);
});

test('a sign-out while a foreground waits for the refresh leaves the session signed out, ended once', async () => {
  const gate = held();
  let refreshes = 0;
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => {
    refreshes += 1;
    await gate.promise;
    return { ...identity };
  } } });
  await manager.start();
  calls.length = 0;
  const foregrounded = manager.foreground();
  await settle();
  assert.equal(refreshes, 1);
  await manager.signOut();
  const afterSignOut = manager.getSnapshot();
  gate.resolve();
  await foregrounded;
  assert.deepEqual(manager.getSnapshot(), afterSignOut);
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
  assert.deepEqual(calls, [['sync', 'user-a'], ['signOut']]);
});

test('a sign-out while a foreground waits for Apple leaves the session signed out, ended once, even when Apple says revoked', async () => {
  const gate = held();
  let asked = false;
  const { manager, calls } = setup({ current: identity, auth: { appleCredentialState: async () => {
    if (!asked) { asked = true; return 'authorized'; }
    await gate.promise;
    return 'revoked';
  } } });
  await manager.start();
  calls.length = 0;
  const foregrounded = manager.foreground();
  await settle();
  await manager.signOut();
  const afterSignOut = manager.getSnapshot();
  gate.resolve();
  await foregrounded;
  assert.deepEqual(manager.getSnapshot(), afterSignOut);
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
  assert.deepEqual(calls, [['refresh'], ['sync', 'user-a'], ['signOut']]);
});

test('a sign-out while a foreground waits for a definitive end of the session is not repeated', async () => {
  const gate = held();
  const { manager, calls } = setup({ current: identity, auth: { refreshSession: async () => { await gate.promise; return null; } } });
  await manager.start();
  calls.length = 0;
  const foregrounded = manager.foreground();
  await settle();
  await manager.signOut();
  gate.resolve();
  await foregrounded;
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
  assert.equal(calls.filter(([name]) => name === 'signOut').length, 1);
});

const counts = (piecesAdded, historyDaysAdded, piecesReceived, historyDaysReceived) =>
  ({ piecesAdded, historyDaysAdded, piecesReceived, historyDaysReceived });

test('the result after sign-in follows the first link: welcome, restore or merge, and without consent the welcome', async () => {
  const cases = [
    ['first account with phone data', [given], { counts: counts(4, 2, 0, 0), profileFrom: 'phone' },
      { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 4, days: 2, added: 'records' }],
    ['new phone restoring', [given], { counts: counts(0, 0, 9, 5), profileFrom: 'account' },
      { kind: 'restored', pieces: 9, days: 5, profileFrom: 'account' }],
    ['second phone merging', [given], { counts: counts(3, 1, 9, 5), profileFrom: 'accountNameAndGender' },
      { kind: 'merged', counts: counts(3, 1, 9, 5), profileFrom: 'accountNameAndGender' }],
    ['sign-in without consent', [{ ...given, answer: 'withdrawn' }], { counts: counts(0, 0, 0, 0), profileFrom: 'accountNameAndGender' },
      { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, added: 'profile' }],
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

test('under the consent the first link runs only after a failed consent read is answered on the sheet', async () => {
  let reads = 0;
  const { manager, calls } = setup({ records: [], consent: { records: async () => {
    reads += 1;
    if (reads === 1) throw new Error('offline');
    return [];
  } } });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
  await manager.foreground();
  await manager.localWrite();
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  await manager.answerConsent(false);
  assert.deepEqual(calls.filter(([name]) => name === 'sync'), [['sync', 'user-a']]);
  assert.equal(manager.getSnapshot().result.added, 'profile');
});

test('a foreground during the consent read at sign-in runs no pass before the question', async () => {
  const read = held();
  const { manager, calls } = setup({ records: [], consent: { records: async () => read.promise } });
  manager.openSignIn('profile');
  const signingIn = manager.signIn('apple');
  await settle();
  await manager.foreground();
  read.resolve([]);
  await signingIn;
  assert.equal(calls.some(([name]) => name === 'sync'), false);
  assert.deepEqual(manager.getSnapshot().consent, { prompt: 'signIn', status: 'idle' });
});

test('a foreground while a consent is being saved from the Account screen leaves nothing stuck', async () => {
  const give = held();
  const { manager, calls } = setup({ current: identity, records: [], consent: { give: async () => give.promise } });
  await manager.start();
  manager.openConsent();
  const answering = manager.answerConsent(true);
  await manager.foreground();
  const passes = calls.filter(([name]) => name === 'sync').length;
  give.resolve();
  await answering;
  assert.deepEqual(manager.getSnapshot().consent, { prompt: null, status: 'idle' });
  // The answer was taken: the pass for the records followed it.
  assert.equal(calls.filter(([name]) => name === 'sync').length, passes + 1);
});

test('a foreground while the consent after sign-in is being saved still finishes the sign-in and later syncs run', async () => {
  const give = held();
  const { manager, calls } = setup({ records: [], consent: { give: async () => give.promise } });
  manager.openSignIn('profile');
  await manager.signIn('apple');
  const answering = manager.answerConsent(true);
  await manager.foreground();
  give.resolve();
  await answering;
  assert.deepEqual(manager.getSnapshot().signIn, { kind: 'idle' });
  assert.equal(manager.getSnapshot().result.kind, 'signedIn');
  const before = calls.filter(([name]) => name === 'sync').length;
  manager.syncNow();
  await settle();
  assert.equal(calls.filter(([name]) => name === 'sync').length, before + 1);
});

test('a foreground while a withdrawal is saved leaves nothing stuck', async () => {
  const withdraw = held();
  const { manager, calls } = setup({ current: identity, consent: { withdraw: async () => withdraw.promise } });
  await manager.start();
  const withdrawing = manager.withdrawConsent();
  await manager.foreground();
  const passes = calls.filter(([name]) => name === 'sync').length;
  withdraw.resolve();
  await withdrawing;
  assert.deepEqual(manager.getSnapshot().consent, { prompt: null, status: 'idle' });
  assert.equal(calls.filter(([name]) => name === 'sync').length, passes + 1);
});

test('one pass at a time: requests during a pass share one pass after it', async () => {
  const first = held();
  let runs = 0;
  const { manager } = setup({ current: identity, sync: { run: async () => {
    runs += 1;
    if (runs === 1) await first.promise;
    return { pendingChanges: 0, closetPieces: 2, historyDays: 3, syncConsent: 'given', firstLink: null };
  } } });
  const starting = manager.start();
  await settle();
  const foreground = manager.foreground();
  manager.syncNow();
  const write = manager.localWrite();
  await settle();
  assert.equal(runs, 1);
  first.resolve();
  await Promise.all([starting, foreground, write]);
  assert.equal(runs, 2);
});

test('an older pass that fails never overwrites the status of the pass after it', async () => {
  const first = held();
  let runs = 0;
  const { manager } = setup({ current: identity, sync: { run: async () => {
    runs += 1;
    if (runs === 1) { await first.promise; throw new Error('offline'); }
    return { pendingChanges: 0, closetPieces: 2, historyDays: 3, syncConsent: 'given', firstLink: null };
  } } });
  const starting = manager.start();
  await settle();
  const syncing = manager.localWrite();
  first.resolve();
  await Promise.all([starting, syncing]);
  assert.deepEqual(manager.getSnapshot().session.sync, { kind: 'upToDate' });
});

test('a sign-out during a pass uploads after it, then ends the session', async () => {
  const first = held();
  let runs = 0;
  const { manager, calls } = setup({ current: identity, sync: { run: async (userId) => {
    runs += 1;
    calls.push(['sync', userId]);
    if (runs === 1) await first.promise;
    return { pendingChanges: 0, closetPieces: 2, historyDays: 3, syncConsent: 'given', firstLink: null };
  } } });
  const starting = manager.start();
  await settle();
  const signingOut = manager.signOut();
  await settle();
  assert.deepEqual(calls, [['sync', 'user-a']]);
  first.resolve();
  await Promise.all([starting, signingOut]);
  assert.deepEqual(calls, [['sync', 'user-a'], ['sync', 'user-a'], ['signOut']]);
});

test('a pass whose request never answers ends at the request deadline, so sign-out still ends the session', async () => {
  // The live client sends every account request through this deadline.
  const silentServer = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const request = fetchWithTimeout(silentServer, 30);
  const { manager, calls } = setup({ current: identity, sync: { run: async (userId) => {
    calls.push(['sync', userId]);
    await request('https://project.supabase.co/rest/v1/wardrobe_items', { method: 'POST' });
    return { pendingChanges: 0, closetPieces: 0, historyDays: 0, syncConsent: 'given', firstLink: null };
  } } });
  const starting = manager.start();
  await settle();
  const started = Date.now();
  await manager.signOut();
  await starting;
  assert.ok(Date.now() - started < 1000);
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  assert.deepEqual(calls, [['sync', 'user-a'], ['sync', 'user-a'], ['signOut']]);
});

test('a sign-in abandoned for another attempt is signed out when that attempt is cancelled', async () => {
  const exchanges = [held(), held()];
  let attempt = 0;
  const { manager, calls } = setup({ auth: { signIn: async () => exchanges[attempt++].promise } });
  manager.openSignIn('profile');
  const first = manager.signIn('apple');
  manager.closeSheet();
  manager.openSignIn('profile');
  const second = manager.signIn('apple');
  exchanges[0].resolve(identity);
  await first;
  assert.deepEqual(calls, []);
  exchanges[1].resolve(null);
  await second;
  assert.deepEqual(calls, [['signOut']]);
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
  assert.deepEqual(manager.getSnapshot().signIn, { kind: 'cancelled' });
});

test('a sign-in abandoned for another attempt that succeeds leaves that attempt signed in', async () => {
  const exchanges = [held(), held()];
  let attempt = 0;
  const { manager, calls } = setup({ auth: { signIn: async () => exchanges[attempt++].promise } });
  manager.openSignIn('profile');
  const first = manager.signIn('apple');
  manager.closeSheet();
  manager.openSignIn('profile');
  const second = manager.signIn('apple');
  exchanges[0].resolve({ ...identity, userId: 'user-old' });
  await first;
  exchanges[1].resolve(identity);
  await second;
  assert.equal(calls.some(([name]) => name === 'signOut'), false);
  assert.equal(manager.getSnapshot().session.kind, 'signedIn');
});

test('a sign-in abandoned for an attempt already cancelled is signed out when it resolves', async () => {
  const exchanges = [held(), held()];
  let attempt = 0;
  const { manager, calls } = setup({ auth: { signIn: async () => exchanges[attempt++].promise } });
  manager.openSignIn('profile');
  const first = manager.signIn('apple');
  manager.closeSheet();
  manager.openSignIn('profile');
  const second = manager.signIn('apple');
  exchanges[1].resolve(null);
  await second;
  exchanges[0].resolve(identity);
  await first;
  assert.deepEqual(calls, [['signOut']]);
  assert.equal(manager.getSnapshot().session.kind, 'signedOut');
});

test('a failed first sync after sign-in shows a welcome that claims nothing reached the account yet', async () => {
  for (const records of [[given], []]) {
    const { manager } = setup({ records, sync: { run: async () => { throw new Error('offline'); } } });
    manager.openSignIn('profile');
    await manager.signIn('apple');
    if (records.length === 0) await manager.answerConsent(true);
    const snapshot = manager.getSnapshot();
    assert.deepEqual(snapshot.result, { kind: 'signedIn', provider: 'apple', email: identity.email, pieces: 0, days: 0, added: 'nothingYet' });
    assert.deepEqual(snapshot.session.sync, { kind: 'failed' });
  }
});

test('a sign-out whose stored session cannot be removed still ends the session', async () => {
  const { manager } = setup({ current: identity, auth: { signOut: async () => { throw new Error('database is locked'); } } });
  await manager.start();
  await manager.signOut();
  assert.deepEqual(manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
  const revoked = setup({ current: identity, auth: {
    appleCredentialState: async () => 'revoked',
    signOut: async () => { throw new Error('database is locked'); },
  } });
  await revoked.manager.start();
  assert.deepEqual(revoked.manager.getSnapshot().session, { kind: 'signedOut', notice: 'signedOut' });
});
