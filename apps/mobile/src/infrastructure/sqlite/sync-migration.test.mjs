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

async function rows(database, table) {
  return (await database.getAllAsync(`SELECT * FROM ${table} ORDER BY rowid`))
    .map((row) => ({ ...row }));
}

test('fresh schema has five checked pending flags and one device account link', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  assert.equal(latestDatabaseVersion, 25);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
  for (const table of syncedTables) {
    const column = (await database.getAllAsync(`PRAGMA table_info(${table})`))
      .find(({ name }) => name === 'pending_sync');
    assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
      { type: 'INTEGER', notnull: 1, dflt_value: '0' }, table);
  }
  assert.deepEqual(await rows(database, 'device_account_link'), [{
    singleton_key: 1, linked_user_id: null, last_linked_user_id: null,
    last_pull_cursor: null, sign_in_card_dismissed: 0,
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
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
  for (const table of syncedTables) {
    assert.deepEqual(await rows(database, table),
      before[table].map((row) => ({ ...row, pending_sync: 0 })), table);
    await assert.rejects(() => database.runAsync(`UPDATE ${table} SET pending_sync = 2`),
      /CHECK constraint/, table);
  }
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
});

test('copied device database replays version 24 to 25 without losing rows',
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
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 24);
    const tables = (await database.getAllAsync(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
      .map(({ name }) => name);
    const before = Object.fromEntries(await Promise.all(tables.map(async (table) =>
      [table, (await database.getFirstAsync(`SELECT COUNT(*) AS count FROM ${table}`)).count])));
    await migrateDatabase(database);
    for (const table of tables) {
      const count = (await database.getFirstAsync(`SELECT COUNT(*) AS count FROM ${table}`)).count;
      assert.equal(count, before[table], table);
      t.diagnostic(`${table}: ${count} -> ${count}`);
    }
    for (const table of syncedTables) {
      assert.equal((await database.getFirstAsync(
        `SELECT COUNT(*) AS count FROM ${table} WHERE pending_sync <> 0`)).count, 0, table);
    }
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
