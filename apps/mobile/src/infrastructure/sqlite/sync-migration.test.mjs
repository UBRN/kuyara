import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { latestDatabaseVersion, migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const syncedTables = [
  'local_profiles', 'wardrobe_items', 'dressing_day_choices',
  'dressing_day_departures', 'outfit_history',
];
const now = '2026-10-02T10:00:00.000Z';
// What each migration adds to an existing row, by the schema the database starts from.
// Migration 25 adds the pending flag at 0, so a database that already holds it (build 18 and
// later) keeps the flags it was left with, and every Closet or History edit made on those
// builds is still marked. Migration 27 gives every existing profile both unit choices at System
// and a database that already holds them keeps the choices; migration 28 gives the device
// account link a NULL records account and consent arrival.
const upgraded = (table, row, versionBefore = 24) => ({
  ...row,
  ...(syncedTables.includes(table) && versionBefore < 25 ? { pending_sync: 0 } : {}),
  ...(table === 'local_profiles' && versionBefore < 27
    ? { temperature_unit: 'system', wind_speed_unit: 'system' } : {}),
  ...(table === 'device_account_link' ? { records_user_id: null, records_consent_recorded_at: null } : {}),
});

async function rows(database, table) {
  return (await database.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`))
    .map((row) => ({ ...row }));
}

test('fresh schema has five checked pending flags and one device account link', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  assert.equal(latestDatabaseVersion, 28);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  for (const table of syncedTables) {
    const column = (await database.getAllAsync(`PRAGMA table_info(${table})`))
      .find(({ name }) => name === 'pending_sync');
    assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
      { type: 'INTEGER', notnull: 1, dflt_value: '0' }, table);
  }
  assert.deepEqual(await rows(database, 'device_account_link'), [{
    singleton_key: 1, linked_user_id: null, last_linked_user_id: null,
    last_pull_cursor: null, sign_in_card_dismissed: 0, records_user_id: null, records_consent_recorded_at: null,
  }]);
  await assert.rejects(() => database.runAsync(
    'INSERT INTO device_account_link (singleton_key) VALUES (2)'), /CHECK constraint/);
  await assert.rejects(() => database.runAsync(
    'UPDATE device_account_link SET sign_in_card_dismissed = 2'), /CHECK constraint/);
});

test('version 24 rows in all sync tables keep every value and start unmarked', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  await database.execAsync('ALTER TABLE outfit_history ADD COLUMN piece_colors_json TEXT; PRAGMA user_version = 24;');
  await database.execAsync(`
    INSERT INTO local_profiles (singleton_key, id, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at)
      VALUES (1, 'profile', 'tr', 'dark', 1, '${now}', '${now}');
    INSERT INTO wardrobe_items (id, local_profile_id, category, entry_state, created_at, updated_at)
      VALUES ('item', 'profile', 'top', 'owned', '${now}', '${now}');
    INSERT INTO dressing_day_choices (id, local_profile_id, day_key, formality, source,
      created_at, updated_at) VALUES ('choice', 'profile', '2026-10-02', 'casual', 'chip', '${now}', '${now}');
    INSERT INTO dressing_day_departures (id, local_profile_id, day_key, departure_at, time_zone,
      created_at, updated_at) VALUES ('departure', 'profile', '2026-10-02', '${now}',
      'Europe/Istanbul', '${now}', '${now}');
    INSERT INTO outfit_history (id, local_profile_id, day_key, outfit_json, worn_at,
      created_at, updated_at) VALUES ('history', 'profile', '2026-10-02', '{}',
      '${now}', '${now}', '${now}');
  `);
  const before = Object.fromEntries(await Promise.all(syncedTables.map(async (table) =>
    [table, await rows(database, table)])));
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  for (const table of syncedTables) {
    assert.deepEqual(await rows(database, table),
      before[table].map((row) => upgraded(table, row)), table);
    await assert.rejects(() => database.runAsync(`UPDATE ${table} SET pending_sync = 2`),
      /CHECK constraint/, table);
  }
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
});

test('copied device database replays any version from 19 to the one before the latest to the latest version with every row and value intact',
  { skip: !process.env.KUYARA_DEVICE_DB_FIXTURE }, async (t) => {
    const source = process.env.KUYARA_DEVICE_DB_FIXTURE;
    const directory = await mkdtemp(join(tmpdir(), 'kuyara-sync-migration-'));
    const target = join(directory, 'kuyara.db');
    t.after(async () => rm(directory, { recursive: true, force: true }));
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(source + suffix)) await copyFile(source + suffix, target + suffix);
    }
    const database = new NodeSqliteDatabase(new DatabaseSync(target));
    t.after(() => database.close());
    const versionBefore = (await database.getFirstAsync('PRAGMA user_version')).user_version;
    assert.ok(versionBefore >= 19 && versionBefore < latestDatabaseVersion,
      `user_version ${versionBefore} is outside 19 to ${latestDatabaseVersion - 1}`);
    t.diagnostic(`user_version: ${versionBefore} -> ${latestDatabaseVersion}`);
    const tables = (await database.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
      .map(({ name }) => name);
    const before = Object.fromEntries(await Promise.all(tables.map(async (table) =>
      [table, await rows(database, table)])));
    const orphansBefore = (await database.getAllAsync('PRAGMA foreign_key_check')).length;
    await migrateDatabase(database);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    for (const table of tables) {
      const after = await rows(database, table);
      assert.equal(after.length, before[table].length, `${table} row count`);
      // Migrations 20 to 24 add columns to some tables of an older database; those are not
      // compared here, every column the source had is, along with the ones 25, 27 and 28 add.
      const expected = before[table].map((row) => upgraded(table, row, versionBefore));
      assert.deepEqual(
        after.map((row, index) => Object.fromEntries(Object.keys(expected[index]).map((column) =>
          [column, row[column]]))),
        expected, table);
      t.diagnostic(`${table}: ${before[table].length} -> ${after.length}`);
    }
    assert.equal((await database.getAllAsync('PRAGMA foreign_key_check')).length, orphansBefore);
    assert.doesNotMatch((await database.getFirstAsync(
      "SELECT sql FROM sqlite_master WHERE name = 'outfit_history'")).sql, /UNIQUE/);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
