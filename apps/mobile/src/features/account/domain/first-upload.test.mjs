import assert from 'node:assert/strict';
import test from 'node:test';

import { firstUploadRows } from './first-upload.ts';
import {
  dayChoice, departure, historyDay, wardrobeItem,
} from '../__tests__/account-fixtures.mjs';

const now = '2026-10-01T12:00:00.000Z';
const day = 24 * 60 * 60 * 1000;
const ago = (milliseconds) => new Date(Date.parse(now) - milliseconds).toISOString();

const local = {
  wardrobeItems: [
    wardrobeItem(1),
    wardrobeItem(2, { deletedAt: ago(29 * day) }),
    wardrobeItem(3, { deletedAt: ago(31 * day) }),
  ],
  dressingDayChoices: [dayChoice(4, '2026-09-10'), dayChoice(5, '2026-09-11', { deletedAt: ago(40 * day) })],
  dressingDayDepartures: [departure(6, '2026-09-10'), departure(7, '2026-09-11', { deletedAt: ago(1 * day) })],
  outfitHistory: [historyDay(8, '2026-09-10'), historyDay(9, '2026-09-11', { deletedAt: ago(30 * day + 1) })],
};

test('live rows go up whatever their age, with the deletion markers of the last 30 days', () => {
  const up = firstUploadRows(local, now);
  assert.deepEqual(up.wardrobeItems.map((row) => row.id), [local.wardrobeItems[0].id, local.wardrobeItems[1].id]);
  assert.deepEqual(up.dressingDayChoices.map((row) => row.dayKey), ['2026-09-10']);
  assert.deepEqual(up.dressingDayDepartures.map((row) => row.dayKey), ['2026-09-10', '2026-09-11']);
  assert.deepEqual(up.outfitHistory.map((row) => row.dayKey), ['2026-09-10']);
});

test('the 30 day boundary is inclusive: a marker exactly 30 days old goes, one millisecond older stays', () => {
  const pick = (deletedAt) => firstUploadRows(
    { ...local, wardrobeItems: [wardrobeItem(1, { deletedAt })] }, now,
  ).wardrobeItems.length;
  assert.equal(pick(ago(30 * day)), 1);
  assert.equal(pick(ago(30 * day + 1)), 0);
  assert.equal(pick(ago(0)), 1);
});

test('the input is not mutated', () => {
  const before = JSON.stringify(local);
  firstUploadRows(local, now);
  assert.equal(JSON.stringify(local), before);
});
