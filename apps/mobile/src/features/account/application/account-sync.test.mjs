import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSyncFlow } from './account-sync.ts';
import { historyDay, syncedProfile, wardrobeItem } from '../__tests__/account-fixtures.mjs';

const empty = () => ({ profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] });
const local = (rows = empty(), pending = false) => ({
  profile: rows.profile === null ? null : { row: rows.profile, pendingSync: pending },
  wardrobeItems: rows.wardrobeItems.map((row) => ({ row, pendingSync: pending })),
  dressingDayChoices: rows.dressingDayChoices.map((row) => ({ row, pendingSync: pending })),
  dressingDayDepartures: rows.dressingDayDepartures.map((row) => ({ row, pendingSync: pending })),
  outfitHistory: rows.outfitHistory.map((row) => ({ row, pendingSync: pending })),
});

test('first link pulls and merges before uploading, then records the cursor', async () => {
  const calls = [];
  const phone = { ...empty(), profile: syncedProfile(), wardrobeItems: [wardrobeItem(1)] };
  const account = { ...empty(), profile: syncedProfile({ displayName: 'Account' }), wardrobeItems: [wardrobeItem(2)] };
  let rows = local(phone);
  const source = {
    read: async () => rows,
    cursor: async () => null,
    applyFirstLink: async (merge, cursor) => {
      calls.push(['merge', merge, cursor]);
      rows = { ...local({ ...merge.writeToPhone, profile: merge.writeToPhone.profile }),
        wardrobeItems: [
          ...merge.writeToPhone.wardrobeItems.map((row) => ({ row, pendingSync: false })),
          ...merge.sendToAccount.wardrobeItems.map((row) => ({ row, pendingSync: true })),
        ] };
    },
    clearPendingIfUnchanged: async (returned) => calls.push(['clear', returned]),
    writePulled: async (write, cursor) => calls.push(['write', write, cursor]),
  };
  const remote = {
    pullSnapshot: async () => { calls.push(['pullSnapshot']); return { rows: account, cursor: '2026-10-01T00:00:00.000000Z' }; },
    upload: async (_id, sent) => { calls.push(['upload', sent]); return sent; },
    pull: async () => ({ ...empty(), arrivals: [] }),
  };
  const flow = createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z');
  const counts = await flow.firstLink('user-a', true);
  assert.deepEqual(counts, { piecesAdded: 1, historyDaysAdded: 0, piecesReceived: 1, historyDaysReceived: 0 });
  assert.deepEqual(calls.map(([name]) => name).slice(0, 3), ['pullSnapshot', 'merge', 'upload']);
  assert.deepEqual(calls[2][1].wardrobeItems.map((row) => row.id), [phone.wardrobeItems[0].id]);
});

test('a different account receives the changes the previous account had not synced yet', async () => {
  const uploads = [];
  const edited = wardrobeItem(1, { name: 'Edited after the last sync' });
  const removed = wardrobeItem(2, { deletedAt: '2026-10-02T00:00:00.000Z' });
  const day = historyDay(3, '2026-10-02');
  let rows = local({ ...empty(), wardrobeItems: [edited, removed], outfitHistory: [day] }, true);
  const source = {
    read: async () => rows,
    cursor: async () => '2026-09-30T00:00:00.000000Z',
    applyFirstLink: async (merge) => { rows = local(merge.sendToAccount, true); },
    clearPendingIfUnchanged: async () => {},
    writePulled: async () => assert.fail('write'),
  };
  const remote = {
    pullSnapshot: async (userId) => { assert.equal(userId, 'user-b'); return { rows: empty(), cursor: null }; },
    upload: async (userId, sent) => { uploads.push([userId, sent]); return sent; },
    pull: async () => assert.fail('pull'),
  };
  const counts = await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').firstLink('user-b', true);
  assert.deepEqual(counts, { piecesAdded: 1, historyDaysAdded: 1, piecesReceived: 0, historyDaysReceived: 0 });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0][0], 'user-b');
  assert.deepEqual(uploads[0][1].wardrobeItems, [edited, removed]);
  assert.deepEqual(uploads[0][1].outfitHistory, [day]);
});

test('ongoing sync uploads pending rows, clears only matched versions, then lands server arrival and cursor', async () => {
  const calls = [];
  const own = wardrobeItem(1, { name: 'Here' });
  const arriving = historyDay(2, '2026-09-10', { photoPath: null });
  const source = {
    read: async () => local({ ...empty(), wardrobeItems: [own] }, true),
    cursor: async () => '2026-09-30T00:00:00.000000Z',
    clearPendingIfUnchanged: async (rows) => calls.push(['clear', rows]),
    writePulled: async (rows, cursor) => calls.push(['write', rows, cursor]),
    applyFirstLink: async () => assert.fail('first link'),
  };
  const remote = {
    upload: async (_id, rows) => { calls.push(['upload', rows]); return rows; },
    pull: async () => ({
      ...empty(), outfitHistory: [{ row: arriving, serverUpdatedAt: '2026-10-01T00:00:00.000000Z' }],
      wardrobeItems: [{ row: wardrobeItem(1, { name: 'There' }), serverUpdatedAt: '2026-10-01T00:00:00.000000Z' }],
      arrivals: [{ serverUpdatedAt: '2026-10-02T00:00:00.000000Z' }],
    }),
    pullSnapshot: async () => assert.fail('snapshot'),
  };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', true);
  assert.deepEqual(calls.map(([name]) => name), ['upload', 'clear', 'write']);
  assert.deepEqual(calls[2][1].wardrobeItems, []);
  assert.deepEqual(calls[2][1].outfitHistory, [arriving]);
  assert.equal(calls[2][2], '2026-10-02T00:00:00.000000Z');
});

test('failed upload skips pull and keeps pending flags', async () => {
  let pulled = false;
  const source = { read: async () => local({ ...empty(), profile: syncedProfile() }, true), cursor: async () => null,
    clearPendingIfUnchanged: async () => assert.fail('clear'), writePulled: async () => assert.fail('write'), applyFirstLink: async () => assert.fail('merge') };
  const remote = { upload: async () => { throw new Error('offline'); }, pull: async () => { pulled = true; return empty(); }, pullSnapshot: async () => assert.fail('snapshot') };
  await assert.rejects(createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', false));
  assert.equal(pulled, false);
});

test('without sync consent the flow sends only profile fields', async () => {
  const sent = [];
  const source = {
    read: async () => local({ ...empty(), profile: syncedProfile(), wardrobeItems: [wardrobeItem(1)] }, true),
    cursor: async () => null,
    clearPendingIfUnchanged: async () => {},
    writePulled: async () => {},
    applyFirstLink: async () => {},
  };
  const remote = {
    upload: async (_id, rows) => { sent.push(rows); return rows; },
    pull: async () => ({ ...empty(), arrivals: [] }),
    pullSnapshot: async () => assert.fail('snapshot'),
  };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', false);
  assert.deepEqual(sent, [{ ...empty(), profile: syncedProfile() }]);
});
