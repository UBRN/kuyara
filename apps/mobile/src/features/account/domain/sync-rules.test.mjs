import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPulledByDay,
  applyPulledById,
  applyPulledProfile,
  accountTables,
  nextCursor,
  pendingRows,
  pullCursorAt,
} from './sync-rules.ts';
import { canonicalServerInstant } from './server-instant.ts';
import {
  dayChoice, emptyRows as empty, historyDay, stamp, syncedProfile, uuid, wardrobeItem,
} from '../__tests__/account-fixtures.mjs';

const at = (minute) => canonicalServerInstant(`2026-09-30T10:${String(minute).padStart(2, '0')}:00+00:00`);
const settled = (row) => ({ row, pendingSync: false });
const pending = (row) => ({ row, pendingSync: true });
const arrival = (row, minute) => ({ row, serverUpdatedAt: at(minute) });
const marker = (row) => ({ ...row, deletedAt: stamp(20), updatedAt: stamp(20) });

test('only the pending rows are uploaded', () => {
  const rows = [settled(wardrobeItem(1)), pending(wardrobeItem(2)), pending(wardrobeItem(3))];
  assert.deepEqual(pendingRows(rows).map((row) => row.id), [uuid(2), uuid(3)]);
});

test('the server arrival wins over a row that is not pending', () => {
  const local = wardrobeItem(1, { name: 'Old' });
  const pulled = wardrobeItem(1, { name: 'New' });
  assert.deepEqual(applyPulledById([settled(local)], [arrival(pulled, 1)]), [pulled]);
});

test('a pull never overwrites a pending row', () => {
  const write = applyPulledById(
    [pending(wardrobeItem(1, { name: 'Edited here' }))],
    [arrival(wardrobeItem(1, { name: 'Edited there' }), 1)],
  );
  assert.deepEqual(write, []);
  assert.deepEqual(applyPulledById([pending(historyDay(1, '2026-09-10'))],
    [arrival(historyDay(1, '2026-09-10'), 1)]), []);
  assert.deepEqual(applyPulledByDay([pending(dayChoice(1, '2026-09-10'))],
    [arrival(dayChoice(2, '2026-09-10'), 1)]), []);
});

test('a deletion marker is a write like any other, and one for a row the phone never held is dropped', () => {
  const local = wardrobeItem(1);
  const write = applyPulledById([settled(local)],
    [arrival(marker(wardrobeItem(1)), 1), arrival(marker(wardrobeItem(2)), 2)]);
  assert.deepEqual(write.map((row) => [row.id, row.deletedAt]), [[uuid(1), stamp(20)]]);
});

test('a row only the account holds is written, and among several arrivals for one key the latest wins', () => {
  const write = applyPulledById([], [
    arrival(wardrobeItem(1, { name: 'Second' }), 5),
    arrival(wardrobeItem(1, { name: 'First' }), 2),
    arrival(wardrobeItem(3, { name: 'Other' }), 3),
  ]);
  assert.deepEqual(write.map((row) => row.name), ['Second', 'Other']);
});

test('a pulled History look lands beside the phone\'s looks of its day, and the same look is overwritten', () => {
  const mine = historyDay(1, '2026-09-10');
  const sameLook = historyDay(1, '2026-09-10', { updatedAt: stamp(7) });
  const otherLook = historyDay(2, '2026-09-10');
  const write = applyPulledById([settled(mine)], [arrival(sameLook, 1), arrival(otherLook, 2)]);
  assert.deepEqual(write, [sameLook, otherLook]);
});

test('a same-day choice with a different id overwrites the phone\'s row, which adopts the account id', () => {
  const write = applyPulledByDay([settled(dayChoice(1, '2026-09-10'))],
    [arrival(dayChoice(2, '2026-09-10', { formality: 'formal' }), 1)]);
  assert.deepEqual(write.map((row) => [row.id, row.formality]), [[uuid(2), 'formal']]);
});

test('a pulled day the phone does not hold is written, its deletion marker dropped', () => {
  const write = applyPulledByDay([], [
    arrival(dayChoice(2, '2026-09-10'), 1),
    arrival(marker(dayChoice(3, '2026-09-11')), 2),
  ]);
  assert.deepEqual(write.map((row) => row.dayKey), ['2026-09-10']);
});

test('each table\'s cursor is the latest arrival ever seen there, refused rows included, and never moves back', () => {
  const none = pullCursorAt(null);
  assert.deepEqual(nextCursor(none, []), none);
  assert.deepEqual(nextCursor(pullCursorAt(at(4)), []), pullCursorAt(at(4)));
  const closet = (serverUpdatedAt) => ({ table: 'wardrobeItems', serverUpdatedAt });
  assert.deepEqual(nextCursor(none, [closet(at(2)), closet(at(9)), closet(null)]), { ...none, wardrobeItems: at(9) });
  assert.deepEqual(nextCursor(pullCursorAt(at(9)), [closet(at(2))]), pullCursorAt(at(9)));
  const micro = canonicalServerInstant('2026-09-30T10:09:00.000001Z');
  assert.deepEqual(nextCursor(pullCursorAt(at(9)), [closet(micro)]), { ...pullCursorAt(at(9)), wardrobeItems: micro });
});

test('a late arrival in one table never moves another table\'s position', () => {
  const next = nextCursor(pullCursorAt(at(1)), [{ table: 'outfitHistory', serverUpdatedAt: at(9) }, { table: 'profile', serverUpdatedAt: at(3) }]);
  assert.deepEqual(next, { profile: at(3), wardrobeItems: at(1), dressingDayChoices: at(1), dressingDayDepartures: at(1), outfitHistory: at(9) });
  // Every table the pull reads has a position.
  assert.deepEqual([...accountTables].sort(), Object.keys(empty()).sort());
});

test('the pulled profile is written unless the phone\'s own edit is waiting', () => {
  const pulled = syncedProfile({ displayName: 'From account' });
  assert.deepEqual(applyPulledProfile({ pendingSync: false }, pulled), pulled);
  assert.equal(applyPulledProfile({ pendingSync: true }, pulled), null);
  assert.equal(applyPulledProfile({ pendingSync: false }, null), null);
});
