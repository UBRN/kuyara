import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSyncFlow } from './account-sync.ts';
import { unlinked } from '../domain/account-link.ts';
import { emptyRows as empty, historyDay, syncedProfile, wardrobeItem } from '../__tests__/account-fixtures.mjs';
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
    link: async () => unlinked,
    applyFirstLink: async (merge, link) => {
      calls.push(['merge', merge, link]);
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
  const outcome = await flow.firstLink('user-a', true, '2026-10-02T00:00:00.000001Z');
  assert.deepEqual(outcome, { counts: { piecesAdded: 1, historyDaysAdded: 0, piecesReceived: 1, historyDaysReceived: 0 }, profileFrom: 'account' });
  assert.deepEqual(calls.map(([name]) => name).slice(0, 3), ['pullSnapshot', 'merge', 'upload']);
  assert.deepEqual(calls[1][2], { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a',
    recordsConsentRecordedAt: '2026-10-02T00:00:00.000001Z', cursor: '2026-10-01T00:00:00.000000Z' });
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
    link: async () => ({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', cursor: '2026-09-30T00:00:00.000000Z' }),
    applyFirstLink: async (merge, link) => { assert.equal(link.recordsUserId, 'user-b'); rows = local(merge.sendToAccount, true); },
    clearPendingIfUnchanged: async () => {},
    writePulled: async () => assert.fail('write'),
  };
  const remote = {
    pullSnapshot: async (userId) => { assert.equal(userId, 'user-b'); return { rows: empty(), cursor: null }; },
    upload: async (userId, sent) => { uploads.push([userId, sent]); return sent; },
    pull: async () => assert.fail('pull'),
  };
  const { counts } = await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').firstLink('user-b', true);
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
    link: async () => ({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', cursor: '2026-09-30T00:00:00.000000Z' }),
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
  const source = { read: async () => local({ ...empty(), profile: syncedProfile() }, true), link: async () => unlinked,
    clearPendingIfUnchanged: async () => assert.fail('clear'), writePulled: async () => assert.fail('write'), applyFirstLink: async () => assert.fail('merge') };
  const remote = { upload: async () => { throw new Error('offline'); }, pull: async () => { pulled = true; return empty(); }, pullSnapshot: async () => assert.fail('snapshot') };
  await assert.rejects(createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', false));
  assert.equal(pulled, false);
});

test('without sync consent the flow sends only profile fields', async () => {
  const sent = [];
  const source = {
    read: async () => local({ ...empty(), profile: syncedProfile(), wardrobeItems: [wardrobeItem(1)] }, true),
    link: async () => unlinked,
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
  const { dressStyle: _style, styleAesthetics: _aesthetics, ...nameAndGender } = syncedProfile();
  assert.deepEqual(sent, [{ ...empty(), profile: nameAndGender }]);
  assert.equal('dressStyle' in sent[0].profile, false);
  assert.equal('styleAesthetics' in sent[0].profile, false);
});

const profileKeys = ['createdAt', 'displayName', 'dressStyle', 'gender', 'styleAesthetics', 'updatedAt'];
const nameAndGenderKeys = ['createdAt', 'displayName', 'gender', 'updatedAt'];

// ADR 0041 section 8: device-only profile fields never reach a sync payload, even when the row
// source hands over the whole device profile.
const deviceProfile = () => ({
  ...syncedProfile(),
  id: 'phone-profile', birthDate: '1990-01-01', analyticsConsent: 'granted', notificationsOptIn: true,
  language: 'tr', appearance: 'dark', easierToSee: true, localProfileId: 'phone-profile',
});

function flowWith({ phone, account = empty(), pulled = { ...empty(), arrivals: [] } }) {
  const calls = { uploads: [], firstLinks: [], writes: [] };
  const source = {
    read: async () => local(phone, true),
    link: async () => unlinked,
    saveLink: async () => {},
    applyFirstLink: async (merge, link) => { calls.firstLinks.push([merge, link]); },
    clearPendingIfUnchanged: async () => {},
    writePulled: async (rows, cursor) => { calls.writes.push([rows, cursor]); },
  };
  const remote = {
    pullSnapshot: async () => ({ rows: account, cursor: null }),
    upload: async (_id, rows) => { calls.uploads.push(rows); return rows; },
    pull: async () => pulled,
  };
  return { flow: createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z'), calls };
}

test('sync payloads carry only the account profile fields, and without consent only name and gender', async () => {
  for (const [syncConsent, keys] of [[true, profileKeys], [false, nameAndGenderKeys]]) {
    const ongoing = flowWith({ phone: { ...empty(), profile: deviceProfile() } });
    await ongoing.flow.sync('user-a', syncConsent);
    assert.deepEqual(Object.keys(ongoing.calls.uploads[0].profile).sort(), keys);

    const first = flowWith({ phone: { ...empty(), profile: deviceProfile() } });
    await first.flow.firstLink('user-a', syncConsent);
    assert.deepEqual(Object.keys(first.calls.firstLinks[0][0].sendToAccount.profile).sort(), keys);
  }
});

test('without consent a pull never writes dress style or style aesthetics to the phone', async () => {
  const accountProfile = syncedProfile({ displayName: 'Account', dressStyle: 'formal', styleAesthetics: ['sporty'] });
  const phone = { ...empty(), profile: syncedProfile() };
  const writes = [];
  const source = {
    read: async () => local(phone, false),
    link: async () => unlinked,
    clearPendingIfUnchanged: async () => {},
    writePulled: async (rows) => { writes.push(rows); },
  };
  const remote = { upload: async (_id, rows) => rows, pull: async () => ({ ...empty(), profile: accountProfile, arrivals: [] }) };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', false);
  assert.deepEqual(writes[0].profile, {
    displayName: 'Account', gender: 'woman', createdAt: accountProfile.createdAt, updatedAt: accountProfile.updatedAt,
  });

  const first = flowWith({ phone, account: { ...empty(), profile: accountProfile } });
  await first.flow.firstLink('user-a', false);
  assert.deepEqual(Object.keys(first.calls.firstLinks[0][0].writeToPhone.profile).sort(), nameAndGenderKeys);
});

test('a pulled deletion marker soft-deletes the phone\'s settled row, skips a pending one and needs no content', async () => {
  const marker = (n) => ({ kind: 'deletionMarker', id: wardrobeItem(n).id, createdAt: wardrobeItem(n).createdAt,
    updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' });
  const writes = [];
  const source = {
    read: async () => ({ ...local(empty()), wardrobeItems: [
      { row: wardrobeItem(1), pendingSync: false },
      { row: wardrobeItem(2, { name: 'Edited here' }), pendingSync: true },
    ] }),
    link: async () => ({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', cursor: null }),
    clearPendingIfUnchanged: async () => {},
    writePulled: async (rows, cursor) => writes.push([rows, cursor]),
    applyFirstLink: async () => assert.fail('first link'),
  };
  const remote = {
    upload: async (_id, rows) => rows,
    pull: async () => ({
      ...empty(),
      wardrobeItems: [1, 2, 3].map((n) => ({ row: marker(n), serverUpdatedAt: '2026-10-01T00:00:00.000001Z' })),
      arrivals: [{ serverUpdatedAt: '2026-10-01T00:00:00.000001Z' }],
    }),
    pullSnapshot: async () => assert.fail('snapshot'),
  };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', true);
  assert.deepEqual(writes[0][0].wardrobeItems, [
    wardrobeItem(1, { updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' }),
  ]);
  assert.equal(writes[0][1], '2026-10-01T00:00:00.000001Z');
});

test('a pull mixing markers and whole rows lands each with its own arrival, the latest per row winning', async () => {
  const at = (n) => `2026-10-01T00:00:00.00000${n}Z`;
  const marker = (n) => ({ kind: 'deletionMarker', id: wardrobeItem(n).id, createdAt: wardrobeItem(n).createdAt,
    updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' });
  const writes = [];
  const source = {
    read: async () => local({ ...empty(), wardrobeItems: [wardrobeItem(1), wardrobeItem(2)] }),
    link: async () => ({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', cursor: null }),
    clearPendingIfUnchanged: async () => {},
    writePulled: async (rows) => writes.push(rows),
    applyFirstLink: async () => assert.fail('first link'),
  };
  const remote = {
    upload: async (_id, rows) => rows,
    pull: async () => ({
      ...empty(),
      wardrobeItems: [
        { row: wardrobeItem(1, { name: 'Older' }), serverUpdatedAt: at(1) },
        { row: marker(1), serverUpdatedAt: at(2) },
        { row: marker(2), serverUpdatedAt: at(1) },
        { row: wardrobeItem(2, { name: 'Newer' }), serverUpdatedAt: at(3) },
        { row: wardrobeItem(4), serverUpdatedAt: at(1) },
      ],
      arrivals: [{ serverUpdatedAt: at(3) }],
    }),
    pullSnapshot: async () => assert.fail('snapshot'),
  };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').sync('user-a', true);
  assert.deepEqual(writes[0].wardrobeItems.map((row) => [row.id, row.name, row.deletedAt]), [
    [wardrobeItem(1).id, 'Linen shirt', '2026-10-01T00:00:00.000Z'],
    [wardrobeItem(2).id, 'Newer', null],
    [wardrobeItem(4).id, 'Linen shirt', null],
  ]);
});

test('at a first link an account marker deletes the phone\'s copy and is never sent back', async () => {
  let merged = null;
  const own = wardrobeItem(1);
  const source = {
    read: async () => local({ ...empty(), wardrobeItems: [own] }, true),
    link: async () => unlinked,
    applyFirstLink: async (merge) => { merged = merge; },
    clearPendingIfUnchanged: async () => {},
    writePulled: async () => assert.fail('write'),
  };
  const remote = {
    pullSnapshot: async () => ({ rows: { ...empty(), wardrobeItems: [{ kind: 'deletionMarker', id: own.id,
      createdAt: own.createdAt, updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' }] }, cursor: null }),
    upload: async (_id, rows) => rows,
    pull: async () => assert.fail('pull'),
  };
  await createAccountSyncFlow(source, remote, () => '2026-10-03T00:00:00Z').firstLink('user-a', true);
  assert.deepEqual(merged.writeToPhone.wardrobeItems, [{ ...own, updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' }]);
  assert.deepEqual(merged.sendToAccount.wardrobeItems, []);
});
