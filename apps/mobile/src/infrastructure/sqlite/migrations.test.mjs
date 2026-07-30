import assert from 'node:assert/strict';
import test from 'node:test';

import { latestDatabaseVersion, migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

test('an empty database migrates to version 1 with the required singleton table', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const table = await database.getFirstAsync(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'local_profiles'",
  );
  const columns = await database.getAllAsync('PRAGMA table_info(local_profiles)');

  assert.equal(version.user_version, latestDatabaseVersion);
  assert.equal(table.name, 'local_profiles');
  assert.match(table.sql, /CHECK \(singleton_key = 1\)/);
  assert.match(table.sql, /UNIQUE/);
  assert.deepEqual(
    columns.map(({ name }) => name),
    [
      'singleton_key',
      'id',
      'clothing_preference',
      'language_preference',
      'theme_preference',
      'onboarding_completed',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  );
});

test('version 1 is not reapplied and existing data remains untouched', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  const timestamp = '2026-07-30T10:00:00.000Z';

  await database.runAsync(
    `
      INSERT INTO local_profiles (
        singleton_key, id, clothing_preference, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, NULL, 'system', 'system', 0, ?, ?, NULL)
    `,
    ['stable-id', timestamp, timestamp],
  );

  await migrateDatabase(database);

  const rows = await database.getAllAsync('SELECT id FROM local_profiles');
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ id: 'stable-id' }]);
});

test('schema constraints reject duplicate profiles and invalid stored preferences', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  const timestamp = '2026-07-30T10:00:00.000Z';

  await database.runAsync(
    `
      INSERT INTO local_profiles (
        singleton_key, id, clothing_preference, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, NULL, 'system', 'system', 0, ?, ?, NULL)
    `,
    ['first-id', timestamp, timestamp],
  );

  await assert.rejects(() =>
    database.runAsync(
      `
        INSERT INTO local_profiles (
          singleton_key, id, clothing_preference, language_preference,
          theme_preference, onboarding_completed, created_at, updated_at, deleted_at
        ) VALUES (1, ?, NULL, 'system', 'system', 0, ?, ?, NULL)
      `,
      ['second-id', timestamp, timestamp],
    ),
  );
  await assert.rejects(() =>
    database.runAsync(
      "UPDATE local_profiles SET theme_preference = 'sepia' WHERE singleton_key = 1",
    ),
  );
});

test('a failed migration rolls back its schema and version without deleting other data', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync('CREATE TABLE sentinel (value TEXT NOT NULL);');
  await database.runAsync('INSERT INTO sentinel (value) VALUES (?)', ['keep-me']);

  const failingDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          ...transaction,
          execAsync: async (source) => {
            if (source.includes('CREATE TABLE local_profiles')) {
              throw new Error('injected migration failure');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(() => migrateDatabase(failingDatabase), /injected migration failure/);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const sentinel = await database.getFirstAsync('SELECT value FROM sentinel');
  const profileTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_profiles'",
  );
  assert.equal(version.user_version, 0);
  assert.deepEqual({ ...sentinel }, { value: 'keep-me' });
  assert.equal(profileTable, null);
});
