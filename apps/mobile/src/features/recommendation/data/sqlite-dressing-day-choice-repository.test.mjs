import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import { SqliteDressingDayChoiceRepository } from './sqlite-dressing-day-choice-repository.ts';
import { nextBareDressingDayKey, resolvedFormality } from '../domain/dressing-day-choice.ts';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const choiceId = 'f60a06dd-65a7-455b-9af3-c28101172170';

test('tomorrow uses the next bare key across evening and year boundaries', () => {
  assert.equal(nextBareDressingDayKey('2026-09-24'), '2026-09-25');
  assert.equal(nextBareDressingDayKey('2026-12-31:evening'), '2027-01-01');
});

test('daily choice upsert preserves identity and creation time and resolves only its key', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await database.runAsync(`INSERT INTO local_profiles
    (singleton_key, id, language_preference, theme_preference, onboarding_completed,
      created_at, updated_at)
    VALUES (1, ?, 'system', 'system', 0, ?, ?)`,
  [profileId, '2026-09-23T10:00:00.000Z', '2026-09-23T10:00:00.000Z']);
  let timestamp = '2026-09-24T05:00:00.000Z';
  const repository = new SqliteDressingDayChoiceRepository(database, () => choiceId, () => timestamp);
  assert.equal(await repository.get(profileId, '2026-09-24'), null);
  assert.equal(resolvedFormality(null, 'smart'), 'smart');
  const morning = await repository.upsert(profileId, '2026-09-24', 'casual', 'morning');
  assert.equal(morning.id, choiceId);
  assert.equal(morning.createdAt, timestamp);
  timestamp = '2026-09-24T08:00:00.000Z';
  const chip = await repository.upsert(profileId, '2026-09-24', 'formal', 'chip');
  assert.equal(chip.id, choiceId);
  assert.equal(chip.createdAt, morning.createdAt);
  assert.equal(chip.updatedAt, timestamp);
  assert.equal(chip.source, 'chip');
  assert.equal(resolvedFormality(chip, 'smart'), 'formal');
  assert.equal(await repository.get(profileId, '2026-09-24:evening'), null);
  assert.equal((await database.getFirstAsync('SELECT COUNT(*) AS count FROM dressing_day_choices')).count, 1);
});

test('daily choice mapper rejects malformed rows and SQLite enforces closed values', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await database.runAsync(`INSERT INTO local_profiles
    (singleton_key, id, language_preference, theme_preference, onboarding_completed,
      created_at, updated_at) VALUES (1, ?, 'system', 'system', 0, ?, ?)`,
  [profileId, '2026-09-23T10:00:00.000Z', '2026-09-23T10:00:00.000Z']);
  const repo = new SqliteDressingDayChoiceRepository(database, () => choiceId,
    () => '2026-09-24T05:00:00.000Z');
  await assert.rejects(() => repo.upsert(profileId, 'bad-key', 'smart', 'chip'), /Invalid choice/);
  await assert.rejects(() => repo.upsert(profileId, '2026-09-24', 'invalid', 'chip'), /CHECK constraint/);
  await assert.rejects(() => database.runAsync(`INSERT INTO dressing_day_choices
    (id, local_profile_id, day_key, formality, source, created_at, updated_at)
    VALUES (?, ?, '2026-09-24', 'smart', 'other', 'now', 'now')`, [choiceId, profileId]), /CHECK constraint/);
});
