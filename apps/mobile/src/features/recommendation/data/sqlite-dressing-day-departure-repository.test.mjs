import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import { SqliteDressingDayDepartureRepository } from './sqlite-dressing-day-departure-repository.ts';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const id = 'f60a06dd-65a7-455b-9af3-c28101172170';

test('Later is stored under the departure own dressing day across 18:00 and 04:00', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await database.runAsync(`INSERT INTO local_profiles
    (singleton_key, id, language_preference, theme_preference, onboarding_completed,
      created_at, updated_at) VALUES (1, ?, 'system', 'system', 0, ?, ?)`,
  [profileId, '2026-09-24T05:00:00.000Z', '2026-09-24T05:00:00.000Z']);
  let nextId = 0;
  const repo = new SqliteDressingDayDepartureRepository(database,
    () => nextId++ === 0 ? id : 'f60a06dd-65a7-455b-9af3-c28101172171',
    () => '2026-09-24T15:00:00.000Z');
  const evening = await repo.upsert(profileId, '2026-09-24:evening',
    '2026-09-24T18:00:00.000Z', 'Etc/UTC');
  assert.equal(evening.dayKey, '2026-09-24:evening');
  assert.equal(await repo.get(profileId, '2026-09-24'), null);
  await assert.rejects(() => repo.upsert(profileId, '2026-09-24',
    '2026-09-24T18:00:00.000Z', 'Etc/UTC'), /does not match/);
  const nextMorning = await repo.upsert(profileId, '2026-09-25',
    '2026-09-25T05:00:00.000Z', 'Etc/UTC');
  assert.equal(nextMorning.dayKey, '2026-09-25');
  assert.equal(await repo.clear(profileId, '2026-09-24:evening'), true);
  assert.equal(await repo.get(profileId, '2026-09-24:evening'), null);
  assert.equal((await repo.get(profileId, '2026-09-25'))?.dayKey, '2026-09-25');
});
