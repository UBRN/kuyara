import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionSync } from './account-session-sync.ts';
import { syncedProfile, wardrobeItem, historyDay } from '../__tests__/account-fixtures.mjs';

const empty = () => ({ profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] });
const given = { answer: 'given', textVersion: '2026-10-04', answeredAt: '2026-10-04T10:00:00Z', recordedAt: '2026-10-04T10:00:01.000001Z' };
const withdrawn = { ...given, answer: 'withdrawn', recordedAt: '2026-10-04T11:00:01.000001Z' };
const givenAgain = { ...given, recordedAt: '2026-10-04T12:00:01.000001Z' };
const unlinked = { userId: null, lastUserId: null, recordsUserId: null, recordsConsentRecordedAt: null, cursor: null };

function setup({ records = [], link = unlinked, pending = true } = {}) {
  const calls = [];
  let saved = link;
  const rows = {
    profile: { row: syncedProfile(), pendingSync: pending },
    wardrobeItems: [{ row: wardrobeItem(1), pendingSync: pending }, { row: wardrobeItem(2, { deletedAt: '2026-10-01T00:00:00Z' }), pendingSync: false }],
    dressingDayChoices: [],
    dressingDayDepartures: [],
    outfitHistory: [{ row: historyDay(3, '2026-09-10'), pendingSync: false }, { row: historyDay(4, '2026-09-10'), pendingSync: false }],
  };
  const source = {
    read: async () => rows,
    link: async () => saved,
    saveLink: async (next) => { calls.push(['saveLink', next]); saved = next; },
    applyFirstLink: async (merge, next) => { calls.push(['firstLink', next]); saved = next; },
    clearPendingIfUnchanged: async () => {},
    writePulled: async () => { calls.push(['pull']); },
  };
  const remote = {
    pullSnapshot: async (_id, syncConsent) => { calls.push(['snapshot', syncConsent]); return { rows: empty(), cursor: 'c1' }; },
    upload: async (_id, sent) => { calls.push(['upload', sent]); return sent; },
    pull: async (_id, _cursor, syncConsent) => { calls.push(['pullFrom', syncConsent]); return { ...empty(), arrivals: [] }; },
  };
  const consent = { records: async () => records, give: async () => {}, withdraw: async () => {} };
  const sync = createAccountSessionSync({ source, remote, consent, now: () => '2026-10-04T12:00:00Z' });
  return { sync, calls, saved: () => saved };
}

test('the first sign-in without an answer links only the profile and counts no records', async () => {
  const { sync, calls, saved } = setup();
  const summary = await sync.run('user-a', 'signIn');
  assert.deepEqual(calls.filter(([name]) => name === 'snapshot'), [['snapshot', false]]);
  const uploaded = calls.find(([name]) => name === 'upload')[1];
  assert.deepEqual(uploaded.wardrobeItems, []);
  assert.equal('dressStyle' in uploaded.profile, false);
  assert.deepEqual(saved(), { ...unlinked, userId: 'user-a', lastUserId: 'user-a', cursor: 'c1' });
  assert.deepEqual(summary, { pendingChanges: 1, closetPieces: 0, historyDays: 0, syncConsent: 'none',
    firstLink: { counts: { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 0, historyDaysReceived: 0 }, profileFrom: 'phone' } });
});

test('signing back in to the same account without consent resumes and uploads the pending name and gender', async () => {
  const { sync, calls, saved } = setup({ link: { ...unlinked, lastUserId: 'user-a', cursor: 'c1' } });
  await sync.run('user-a', 'signIn');
  assert.deepEqual(saved(), { ...unlinked, userId: 'user-a', lastUserId: 'user-a', cursor: 'c1' });
  assert.deepEqual(calls.map(([name]) => name).filter((name) => name !== 'upload'), ['saveLink', 'pullFrom', 'pull']);
  assert.deepEqual(calls.find(([name]) => name === 'pullFrom'), ['pullFrom', false]);
  const uploaded = calls.find(([name]) => name === 'upload')[1];
  assert.deepEqual(Object.keys(uploaded.profile).sort(), ['createdAt', 'displayName', 'gender', 'updatedAt']);
  assert.deepEqual(uploaded.wardrobeItems, []);
});

test('a consent given on any phone links this phone\'s records with a first link', async () => {
  const { sync, calls, saved } = setup({ records: [given], link: { ...unlinked, userId: 'user-a', lastUserId: 'user-a', cursor: 'c0' } });
  const summary = await sync.run('user-a', 'manual');
  assert.deepEqual(calls.find(([name]) => name === 'snapshot'), ['snapshot', true]);
  assert.deepEqual(saved(), { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a',
    recordsConsentRecordedAt: given.recordedAt, cursor: 'c1' });
  assert.deepEqual(summary, { pendingChanges: 2, closetPieces: 1, historyDays: 1, syncConsent: 'given',
    firstLink: { counts: { piecesAdded: 1, historyDaysAdded: 1, piecesReceived: 0, historyDaysReceived: 0 }, profileFrom: 'phone' } });

  calls.length = 0;
  await sync.run('user-a', 'foreground');
  assert.equal(calls.some(([name]) => name === 'snapshot'), false);
  assert.deepEqual(calls.find(([name]) => name === 'pullFrom'), ['pullFrom', true]);
});

test('a withdrawal on any phone stops record sync here and unjoins the records for the next consent', async () => {
  const joined = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', recordsConsentRecordedAt: given.recordedAt, cursor: 'c0' };
  const { sync, calls, saved } = setup({ records: [given, withdrawn], link: joined });
  const summary = await sync.run('user-a', 'foreground');
  assert.equal(summary.firstLink, null);
  assert.deepEqual(calls[0], ['saveLink', { ...joined, recordsUserId: null, recordsConsentRecordedAt: null }]);
  assert.deepEqual(calls.find(([name]) => name === 'upload')[1].wardrobeItems, []);
  assert.deepEqual(calls.find(([name]) => name === 'pullFrom'), ['pullFrom', false]);
  assert.equal(saved().recordsUserId, null);
  assert.equal(calls.some(([name]) => name === 'snapshot'), false);
  assert.equal(summary.syncConsent, 'withdrawn');
  assert.equal(summary.closetPieces, 0);
});

test('a failed consent read fails the pass before anything crosses', async () => {
  const failing = createAccountSessionSync({
    source: { link: async () => assert.fail('link') },
    remote: {},
    consent: { records: async () => { throw new Error('offline'); } },
    now: () => '2026-10-04T12:00:00Z',
  });
  await assert.rejects(failing.run('user-a', 'signIn'));
});

test('a consent withdrawn and given again on another phone while this one was away takes a first link here', async () => {
  // Phone B joined its records under the first consent, then went offline. Phone A withdrew,
  // which deleted the account's copies, and gave the consent again before B came back.
  const joined = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', recordsConsentRecordedAt: given.recordedAt, cursor: 'c0' };
  const { sync, calls, saved } = setup({ records: [given, withdrawn, givenAgain], link: joined, pending: false });
  const summary = await sync.run('user-a', 'foreground');
  assert.notEqual(summary.firstLink, null);
  assert.deepEqual(calls.find(([name]) => name === 'snapshot'), ['snapshot', true]);
  // Every live record of B goes back to the account, pending or not, with its recent deletion.
  assert.deepEqual(calls.find(([name]) => name === 'upload')[1].wardrobeItems.map(({ id }) => id), [wardrobeItem(1).id, wardrobeItem(2).id]);
  assert.deepEqual(saved(), { ...joined, recordsConsentRecordedAt: givenAgain.recordedAt, cursor: 'c1' });

  calls.length = 0;
  await sync.run('user-a', 'foreground');
  assert.equal(calls.some(([name]) => name === 'snapshot'), false);
});

test('the consent the records joined under, still the latest, resumes without a first link', async () => {
  const joined = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', recordsConsentRecordedAt: given.recordedAt, cursor: 'c0' };
  const { sync, calls } = setup({ records: [given], link: joined });
  assert.equal((await sync.run('user-a', 'foreground')).firstLink, null);
  assert.equal(calls.some(([name]) => name === 'snapshot'), false);
});

test('a redundant given with no withdrawal after the joining one resumes and keeps the phone\'s pending edits', async () => {
  const joined = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', recordsConsentRecordedAt: given.recordedAt, cursor: 'c0' };
  const { sync, calls } = setup({ records: [given, givenAgain], link: joined });
  assert.equal((await sync.run('user-a', 'foreground')).firstLink, null);
  assert.equal(calls.some(([name]) => name === 'snapshot'), false);
  assert.deepEqual(calls.find(([name]) => name === 'pullFrom'), ['pullFrom', true]);
});
