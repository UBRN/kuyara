import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import { SqliteOutfitHistoryRepository } from './sqlite-outfit-history-repository.ts';
import { SqliteDressingDayDepartureRepository } from './sqlite-dressing-day-departure-repository.ts';
import { SqliteDressingDayChoiceRepository } from './sqlite-dressing-day-choice-repository.ts';
import { resolvedStyleAesthetics } from '../domain/dressing-day-choice.ts';
import { departureTimeZoneSchema } from '../domain/dressing-day-departure.ts';

const profileId = randomUUID();
const now = '2026-09-24T10:00:00.000Z';
const first = { garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
  archetypeId: 'everyday_easy', formality: 'casual', source: 'recommended' };
const second = { ...first, garments: { primary_top: 'shirt', bottom: 'trousers', footwear: 'loafers' },
  source: 'manual' };

async function setup(t) {
  const db = new NodeSqliteDatabase();
  t.after(() => db.close());
  await migrateDatabase(db);
  await db.runAsync(`INSERT INTO local_profiles
    (singleton_key, id, language_preference, theme_preference, onboarding_completed, created_at, updated_at)
    VALUES (1, ?, 'system', 'system', 0, ?, ?)`, [profileId, now, now]);
  return db;
}

test('history overwrites and revives one day, lists newest first, and reads only seven live rows', async (t) => {
  const db = await setup(t);
  let clock = now;
  const photos = { copyStaged: async () => 'kuyara/history/photos/' + randomUUID() + '.jpg',
    discardStaged: async () => {}, deleteStored: async () => {}, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => clock, photos);
  const original = await repo.log(profileId, '2026-09-01', first);
  clock = '2026-09-24T11:00:00.000Z';
  const overwritten = await repo.log(profileId, '2026-09-01', second);
  assert.equal(overwritten.id, original.id);
  assert.equal(overwritten.createdAt, original.createdAt);
  assert.equal(overwritten.outfit.source, 'manual');
  assert.equal(await repo.softDelete(profileId, '2026-09-01'), true);
  assert.equal(await repo.get(profileId, '2026-09-01'), null);
  const revived = await repo.log(profileId, '2026-09-01', first);
  assert.equal(revived.id, original.id);
  assert.equal(revived.deletedAt, null);
  for (let day = 2; day <= 9; day++) {
    await repo.log(profileId, `2026-09-${String(day).padStart(2, '0')}`, first);
  }
  assert.equal((await repo.list(profileId)).length, 9);
  assert.deepEqual((await repo.lastSeven(profileId)).map((entry) => entry.dayKey),
    ['09', '08', '07', '06', '05', '04', '03'].map((day) => `2026-09-${day}`));
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM outfit_history')).count, 9);
});

test('history rejects catalog garments in incompatible slots and incomplete or conflicting cores', async (t) => {
  const db = await setup(t);
  const photos = { copyStaged: async () => { throw new Error('unexpected photo copy'); },
    discardStaged: async () => {}, deleteStored: async () => {}, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  const invalid = [
    { ...first, garments: { ...first.garments, footwear: 'trousers' } },
    { ...first, garments: { ...first.garments, hands: 'scarf' } },
    { ...first, garments: { primary_top: 't_shirt', footwear: 'sneakers' } },
    { ...first, garments: { ...first.garments, one_piece: 'dress' } },
  ];
  for (const outfit of invalid) {
    await assert.rejects(() => repo.log(profileId, '2026-09-24', outfit));
  }
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM outfit_history')).count, 0);
});

test('history photo copy precedes write; failed write cleans new file and leaves old file', async (t) => {
  const db = await setup(t);
  const events = [];
  const paths = [randomUUID(), randomUUID()].map((id) => `kuyara/history/photos/${id}.jpg`);
  const photos = { copyStaged: async () => { events.push('copy'); return paths.shift(); },
    discardStaged: async () => { events.push('discard'); },
    deleteStored: async (path) => { events.push(`delete:${path}`); }, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  const original = await repo.log(profileId, '2026-09-24', first, { kind: 'replace', stagedUri: 'stage' });
  const oldPath = original.photoPath;
  assert.deepEqual(events, ['copy', 'discard']);
  const retained = await repo.log(profileId, '2026-09-24', second);
  assert.equal(retained.photoPath, oldPath);
  const replacement = await repo.log(profileId, '2026-09-24', first,
    { kind: 'replace', stagedUri: 'stage' });
  assert.deepEqual(events, ['copy', 'discard', 'copy', 'discard', `delete:${oldPath}`]);
  assert.notEqual(replacement.photoPath, oldPath);
  const removed = await repo.log(profileId, '2026-09-24', first, { kind: 'remove' });
  assert.equal(removed.photoPath, null);
  assert.equal(events.at(-1), `delete:${replacement.photoPath}`);
  paths.push(`kuyara/history/photos/${randomUUID()}.jpg`);
  const beforeFailure = await repo.log(profileId, '2026-09-24', first,
    { kind: 'replace', stagedUri: 'stage' });
  const failingPhotos = { ...photos, copyStaged: async () => {
    events.push('copy'); return `kuyara/history/photos/${randomUUID()}.jpg`;
  } };
  const failWrite = {
    getFirstAsync: db.getFirstAsync.bind(db),
    getAllAsync: db.getAllAsync.bind(db),
    runAsync: db.runAsync.bind(db),
    withExclusiveTransactionAsync: (task) => db.withExclusiveTransactionAsync((transaction) => task({
      ...transaction,
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      runAsync: async () => { throw new Error('write failed'); },
    })),
  };
  const failingRepo = new SqliteOutfitHistoryRepository(failWrite, randomUUID, () => now, failingPhotos);
  await assert.rejects(() => failingRepo.log(profileId, '2026-09-24', first,
    { kind: 'replace', stagedUri: 'stage' }), /write failed/);
  assert.match(events.at(-1), /^delete:kuyara\/history\/photos\//);
  assert.equal((await repo.get(profileId, '2026-09-24')).photoPath, beforeFailure.photoPath);
  assert.equal(events.includes(`delete:${beforeFailure.photoPath}`), false);
});

test('daily styles are sorted, empty falls back, and evening has no inherited answer', async (t) => {
  const db = await setup(t);
  const repo = new SqliteDressingDayChoiceRepository(db, randomUUID, () => now);
  const morning = await repo.upsert(profileId, '2026-09-24', 'casual', 'morning',
    ['sporty', 'classic']);
  assert.deepEqual(morning.styleAesthetics, ['classic', 'sporty']);
  assert.deepEqual(resolvedStyleAesthetics(morning, ['minimal']), ['classic', 'sporty']);
  assert.equal(await repo.get(profileId, '2026-09-24:evening'), null);
  const evening = await repo.upsert(profileId, '2026-09-24:evening', 'smart', 'morning', []);
  assert.deepEqual(resolvedStyleAesthetics(evening, ['minimal']), ['minimal']);
  const changed = await repo.upsert(profileId, '2026-09-24', 'formal', 'chip');
  assert.deepEqual(changed.styleAesthetics, ['classic', 'sporty']);
  assert.equal((await db.getFirstAsync(`SELECT style_aesthetics FROM dressing_day_choices
    WHERE day_key = '2026-09-24'`)).style_aesthetics, '["classic","sporty"]');
});

test('departure belongs to its own dressing day, clears and revives its one row', async (t) => {
  const db = await setup(t);
  const repo = new SqliteDressingDayDepartureRepository(db, randomUUID, () => now);
  await assert.rejects(() => repo.upsert(profileId, '2026-09-24',
    '2026-09-24T19:00:00.000Z', 'Europe/Istanbul'), /does not match/);
  const planned = await repo.upsert(profileId, '2026-09-24:evening',
    '2026-09-24T19:00:00.000Z', 'Europe/Istanbul');
  assert.equal(planned.dayKey, '2026-09-24:evening');
  assert.equal(await repo.clear(profileId, planned.dayKey), true);
  assert.equal(await repo.get(profileId, planned.dayKey), null);
  const revived = await repo.upsert(profileId, planned.dayKey,
    '2026-09-24T20:00:00.000Z', 'Europe/Istanbul');
  assert.equal(revived.id, planned.id);
  assert.equal(revived.createdAt, planned.createdAt);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM dressing_day_departures')).count, 1);
});

test('departure zones accept IANA names but reject numeric offsets and abbreviations', () => {
  assert.equal(departureTimeZoneSchema.safeParse('Europe/Istanbul').success, true);
  assert.equal(departureTimeZoneSchema.safeParse('America/New_York').success, true);
  for (const zone of ['+03:00', 'UTC', 'GMT+3', 'PST']) {
    assert.equal(departureTimeZoneSchema.safeParse(zone).success, false, zone);
  }
});
