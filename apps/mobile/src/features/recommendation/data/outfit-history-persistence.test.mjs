import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import { SqliteOutfitHistoryRepository } from './sqlite-outfit-history-repository.ts';
import { recommendOutfits } from '../application/recommend-outfits.ts';
import { SqliteDressingDayDepartureRepository } from './sqlite-dressing-day-departure-repository.ts';
import { SqliteDressingDayChoiceRepository } from './sqlite-dressing-day-choice-repository.ts';
import { resolvedStyleAesthetics } from '../domain/dressing-day-choice.ts';
import { departureTimeZoneSchema } from '../domain/dressing-day-departure.ts';
import { isValidTimeZone } from '../../../domain/intl-format.ts';

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
  const original = await repo.log(profileId, '2026-09-01', first, { kind: 'keep' }, null);
  clock = '2026-09-24T11:00:00.000Z';
  const overwritten = await repo.log(profileId, '2026-09-01', second, { kind: 'keep' }, null);
  assert.equal(overwritten.id, original.id);
  assert.equal(overwritten.createdAt, original.createdAt);
  assert.equal(overwritten.outfit.source, 'manual');
  assert.equal(await repo.softDelete(profileId, '2026-09-01'), true);
  assert.equal(await repo.get(profileId, '2026-09-01'), null);
  const revived = await repo.log(profileId, '2026-09-01', first, { kind: 'keep' }, null);
  assert.equal(revived.id, original.id);
  assert.equal(revived.deletedAt, null);
  for (let day = 2; day <= 9; day++) {
    await repo.log(profileId, `2026-09-${String(day).padStart(2, '0')}`, first, { kind: 'keep' }, null);
  }
  assert.equal((await repo.list(profileId)).length, 9);
  assert.deepEqual((await repo.lastSeven(profileId)).map((entry) => entry.dayKey),
    ['09', '08', '07', '06', '05', '04', '03'].map((day) => `2026-09-${day}`));
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM outfit_history')).count, 9);
});

test('history skips corrupt rows while preserving seven valid reads and recommendation generation', async (t) => {
  const db = await setup(t);
  const photos = { copyStaged: async () => { throw new Error('unexpected photo copy'); },
    discardStaged: async () => {}, deleteStored: async () => {}, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  for (let day = 1; day <= 8; day++) {
    await repo.log(profileId, `2026-09-${String(day).padStart(2, '0')}`, first, { kind: 'keep' }, null);
  }
  await db.runAsync(`UPDATE outfit_history SET outfit_json = ? WHERE day_key = ?`,
    ['{"garments":"invalid"}', '2026-09-07']);
  assert.deepEqual((await repo.list(profileId)).map((entry) => entry.dayKey),
    ['08', '06', '05', '04', '03', '02', '01'].map((day) => `2026-09-${day}`));
  assert.equal((await repo.get(profileId, '2026-09-08')).dayKey, '2026-09-08');
  const recentWorn = (await repo.lastSeven(profileId)).map((entry) => entry.outfit);
  assert.equal(recentWorn.length, 7);
  const observedAt = '2026-09-24T09:00:00.000Z';
  const measurements = { temperatureCelsius: 20, apparentTemperatureCelsius: 20,
    condition: 'clear', precipitationProbability: 0, windSpeedMetersPerSecond: 0,
    humidity: 0.5, uvIndex: 0 };
  const recommendation = recommendOutfits({
    snapshot: { id: randomUUID(), localProfileId: profileId, locationKey: 'manual:test',
      timeZone: 'UTC', fetchedAt: observedAt, origin: { kind: 'sample', sourceId: 'test' },
      current: { observedAt, ...measurements }, minimumTemperatureCelsius: 20,
      maximumTemperatureCelsius: 21,
      hourly: [{ forecastAt: '2026-09-24T10:00:00.000Z', ...measurements }] },
    now: observedAt, clothingPreference: 'womens', dayVariant: 0, recentWorn,
  });
  assert.equal(recommendation.status, 'recommended');
  assert.equal(recommendation.outfits.length, 3);
});

test('history list reads preserve database errors', async () => {
  const unreadable = { getAllAsync: async () => { throw new Error('database unreadable'); } };
  const repo = new SqliteOutfitHistoryRepository(unreadable, randomUUID, () => now, {});
  await assert.rejects(() => repo.list(profileId), /database unreadable/);
  await assert.rejects(() => repo.lastSeven(profileId), /database unreadable/);
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
    await assert.rejects(() => repo.log(profileId, '2026-09-24', outfit, { kind: 'keep' }, null));
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
  const original = await repo.log(profileId, '2026-09-24', first, { kind: 'replace', stagedUri: 'stage' }, null);
  const oldPath = original.photoPath;
  assert.deepEqual(events, ['copy', 'discard']);
  const retained = await repo.log(profileId, '2026-09-24', second, { kind: 'keep' }, null);
  assert.equal(retained.photoPath, oldPath);
  const replacement = await repo.log(profileId, '2026-09-24', first,
    { kind: 'replace', stagedUri: 'stage' }, null);
  assert.deepEqual(events, ['copy', 'discard', 'copy', 'discard', `delete:${oldPath}`]);
  assert.notEqual(replacement.photoPath, oldPath);
  const removed = await repo.log(profileId, '2026-09-24', first, { kind: 'remove' }, null);
  assert.equal(removed.photoPath, null);
  assert.equal(events.at(-1), `delete:${replacement.photoPath}`);
  paths.push(`kuyara/history/photos/${randomUUID()}.jpg`);
  const beforeFailure = await repo.log(profileId, '2026-09-24', first,
    { kind: 'replace', stagedUri: 'stage' }, null);
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
    { kind: 'replace', stagedUri: 'stage' }, null), /write failed/);
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

test('departure zones accept every name the weather layer accepts but not numeric offsets', () => {
  for (const zone of ['Europe/Istanbul', 'America/New_York', 'UTC', 'GMT', 'CET', 'EST5EDT']) {
    assert.equal(departureTimeZoneSchema.safeParse(zone).success, true, zone);
    assert.equal(isValidTimeZone(zone), true, zone);
  }
  for (const zone of ['+03:00', '-0300', 'GMT+3', 'Nowhere/Land']) {
    assert.equal(departureTimeZoneSchema.safeParse(zone).success, false, zone);
  }
});

test('an invalid same-day row reads as absent and can be overwritten or deleted, with its photo cleaned up', async (t) => {
  const db = await setup(t);
  const deleted = [];
  const photoPath = `kuyara/history/photos/${randomUUID()}.jpg`;
  const photos = { copyStaged: async () => photoPath, discardStaged: async () => {},
    deleteStored: async (path) => { deleted.push(path); }, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  await repo.log(profileId, '2026-09-07', first, { kind: 'replace', stagedUri: 'stage' }, null);
  await repo.log(profileId, '2026-09-08', first, { kind: 'replace', stagedUri: 'stage' }, null);
  await db.runAsync(`UPDATE outfit_history SET outfit_json = ?`, ['{"garments":"invalid"}']);

  assert.equal(await repo.get(profileId, '2026-09-07'), null);
  const overwritten = await repo.log(profileId, '2026-09-07', second, { kind: 'remove' }, null);
  assert.equal(overwritten.outfit.source, 'manual');
  assert.equal(deleted.at(-1), photoPath);
  assert.equal(await repo.softDelete(profileId, '2026-09-08'), true);
  assert.equal(deleted.length, 2);
});

// The history stores the user's own photos. File cleanup follows a database step that has
// already decided the outcome, so a cleanup that throws must not turn a committed write into
// an error the user would retry.
test('history file cleanup that rejects never fails a write that already committed', async (t) => {
  const db = await setup(t);
  const photos = {
    copyStaged: async () => `kuyara/history/photos/${randomUUID()}.jpg`,
    discardStaged: async () => { throw new Error('staging locked'); },
    deleteStored: async () => { throw new Error('file locked'); },
    resolveUri: () => null,
  };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  const stored = await repo.log(profileId, '2026-09-24', first, { kind: 'replace', stagedUri: 'stage' }, null);
  assert.notEqual(stored.photoPath, null);
  const replaced = await repo.log(profileId, '2026-09-24', second, { kind: 'replace', stagedUri: 'stage' }, null);
  assert.equal(replaced.outfit.source, 'manual');
  assert.notEqual(replaced.photoPath, stored.photoPath);
  const removed = await repo.log(profileId, '2026-09-24', first, { kind: 'remove' }, null);
  assert.equal(removed.photoPath, null);
  await repo.log(profileId, '2026-09-24', first, { kind: 'replace', stagedUri: 'stage' }, null);
  assert.equal(await repo.softDelete(profileId, '2026-09-24'), true);
  const row = await db.getFirstAsync(
    'SELECT photo_path, deleted_at FROM outfit_history WHERE day_key = ?', ['2026-09-24']);
  assert.equal(row.photo_path, null);
  assert.notEqual(row.deleted_at, null);
});

// A photo_path that is not a managed kuyara/history/photos/<uuid>.jpg is never trusted: it
// reads back as no photo and is never handed to a file delete.
for (const unmanaged of ['../../Library/x.jpg', '/abs/x.jpg', 'kuyara/history/photos/not-a-uuid.jpg']) {
  test(`a stored photo_path ${unmanaged} reads as no photo and is never deleted`, async (t) => {
    const db = await setup(t);
    const deleted = [];
    const photos = {
      copyStaged: async () => `kuyara/history/photos/${randomUUID()}.jpg`,
      discardStaged: async () => {},
      deleteStored: async (path) => { deleted.push(path); },
      resolveUri: () => null,
    };
    const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
    for (const day of ['2026-09-10', '2026-09-11']) {
      await repo.log(profileId, day, first, { kind: 'replace', stagedUri: 'stage' }, null);
    }
    deleted.length = 0;
    await db.runAsync('UPDATE outfit_history SET photo_path = ?', [unmanaged]);

    assert.equal((await repo.get(profileId, '2026-09-10')).photoPath, null);
    assert.equal((await repo.list(profileId)).every((entry) => entry.photoPath === null), true);
    await repo.log(profileId, '2026-09-10', second, { kind: 'remove' }, null);
    assert.equal(await repo.softDelete(profileId, '2026-09-11'), true);
    assert.deepEqual(deleted, [], 'an unmanaged path must never reach deleteStored');
  });
}

test('a staged copy that comes back with an unmanaged path is rejected, removed and leaves no row', async (t) => {
  const db = await setup(t);
  const deleted = [];
  const photos = {
    copyStaged: async () => 'elsewhere/a.jpg',
    discardStaged: async () => {},
    deleteStored: async (path) => { deleted.push(path); },
    resolveUri: () => null,
  };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => now, photos);
  await assert.rejects(
    () => repo.log(profileId, '2026-09-24', first, { kind: 'replace', stagedUri: 'stage' }, null),
    /Invalid history photo path/,
  );
  assert.deepEqual(deleted, ['elsewhere/a.jpg']);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM outfit_history')).count, 0);
});

// Migration 24: a worn day keeps the swatch each piece was drawn in, so History draws it as it
// was seen. The colours are display data: a value that does not fit the day is dropped to
// null (the fixed scheme), never a reason to lose the day.
test('history stores, overwrites and drops the colours a day was drawn in', async (t) => {
  const db = await setup(t);
  let clock = now;
  const photos = { copyStaged: async () => 'kuyara/history/photos/' + randomUUID() + '.jpg',
    discardStaged: async () => {}, deleteStored: async () => {}, resolveUri: () => null };
  const repo = new SqliteOutfitHistoryRepository(db, randomUUID, () => clock, photos);
  const colors = { primary_top: 'burgundy', bottom: 'indigo', footwear: 'white' };
  const stored = async () => (await db.getFirstAsync(
    "SELECT piece_colors_json FROM outfit_history WHERE day_key = '2026-09-24'")).piece_colors_json;

  const written = await repo.log(profileId, '2026-09-24', first, { kind: 'keep' }, colors);
  assert.deepEqual(written.pieceColors, colors);
  assert.deepEqual((await repo.get(profileId, '2026-09-24')).pieceColors, colors);
  assert.deepEqual((await repo.list(profileId))[0].pieceColors, colors);
  assert.deepEqual(JSON.parse(await stored()), colors);

  // A new look for the day replaces the old look's colours, and a write without colours clears them.
  clock = '2026-09-24T11:00:00.000Z';
  const recoloured = { primary_top: 'oxford', bottom: 'stone', footwear: 'tan' };
  assert.deepEqual((await repo.log(profileId, '2026-09-24', second, { kind: 'keep' }, recoloured)).pieceColors, recoloured);
  assert.equal((await repo.log(profileId, '2026-09-24', first, { kind: 'keep' }, null)).pieceColors, null);
  assert.equal(await stored(), null);

  // A write that does not state its colours is refused and leaves the stored ones alone.
  await repo.log(profileId, '2026-09-24', first, { kind: 'keep' }, colors);
  await assert.rejects(() => repo.log(profileId, '2026-09-24', second, { kind: 'keep' }), /piece colours/);
  assert.deepEqual(JSON.parse(await stored()), colors);

  // Colours outside the swatch vocabulary, for a slot the day did not wear, or empty are not stored.
  for (const invalid of [{ primary_top: 'neon' }, { head: 'navy' }, {}, { primary_top: 'Navy' }]) {
    const record = await repo.log(profileId, '2026-09-24', first, { kind: 'keep' }, invalid);
    assert.equal(record.pieceColors, null);
    assert.equal(await stored(), null);
  }

  // A stored value this build cannot read still reads the day, in the fixed scheme.
  for (const raw of ['not json', '"navy"', '{"primary_top":"neon"}', '{"head":"navy"}', '[]']) {
    await db.runAsync("UPDATE outfit_history SET piece_colors_json = ? WHERE day_key = '2026-09-24'", [raw]);
    const read = await repo.get(profileId, '2026-09-24');
    assert.deepEqual(read.outfit, first);
    assert.equal(read.pieceColors, null);
    assert.equal((await repo.list(profileId)).length, 1);
  }
});
