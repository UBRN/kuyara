import assert from 'node:assert/strict';
import test from 'node:test';

import { latestDatabaseVersion, migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const timestamp = '2026-07-30T10:00:00.000Z';

async function createReleasedVersionOneDatabase(database) {
  await database.execAsync(`
    CREATE TABLE local_profiles (
      singleton_key INTEGER PRIMARY KEY NOT NULL CHECK (singleton_key = 1),
      id TEXT NOT NULL UNIQUE,
      clothing_preference TEXT CHECK (
        clothing_preference IS NULL OR clothing_preference IN ('womens', 'mens')
      ),
      language_preference TEXT NOT NULL CHECK (
        language_preference IN ('system', 'tr', 'en')
      ),
      theme_preference TEXT NOT NULL CHECK (
        theme_preference IN ('system', 'light', 'dark')
      ),
      onboarding_completed INTEGER NOT NULL CHECK (onboarding_completed IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    PRAGMA user_version = 1;
  `);
}

async function insertProfile(database, id = 'stable-profile-id') {
  await database.runAsync(
    `
      INSERT INTO local_profiles (
        singleton_key, id, clothing_preference, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, NULL, 'system', 'system', 0, ?, ?, NULL)
    `,
    [id, timestamp, timestamp],
  );
}

test('an empty database applies versions 1 and 2 in order with the final schema', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const profileTable = await database.getFirstAsync(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'local_profiles'",
  );
  const wardrobeTable = await database.getFirstAsync(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );
  const profileColumns = await database.getAllAsync('PRAGMA table_info(local_profiles)');
  const wardrobeColumns = await database.getAllAsync('PRAGMA table_info(wardrobe_items)');
  const indexes = await database.getAllAsync('PRAGMA index_list(wardrobe_items)');
  const wardrobeIndexColumns = await database.getAllAsync(
    'PRAGMA index_info(idx_wardrobe_items_profile_deleted_updated)',
  );

  assert.equal(latestDatabaseVersion, 2);
  assert.equal(version.user_version, latestDatabaseVersion);
  assert.equal(profileTable.name, 'local_profiles');
  assert.match(profileTable.sql, /CHECK \(singleton_key = 1\)/);
  assert.deepEqual(
    profileColumns.map(({ name }) => name),
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
  assert.equal(wardrobeTable.name, 'wardrobe_items');
  assert.match(wardrobeTable.sql, /FOREIGN KEY \(local_profile_id\)/);
  assert.match(wardrobeTable.sql, /category IN \('top', 'bottom', 'one_piece'/);
  assert.deepEqual(
    wardrobeColumns.map(({ name }) => name),
    [
      'id',
      'local_profile_id',
      'name',
      'category',
      'color',
      'photo_relative_path',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  );
  assert.equal(
    indexes.some(({ name }) => name === 'idx_wardrobe_items_profile_deleted_updated'),
    true,
  );
  assert.deepEqual(
    wardrobeColumns
      .filter(({ notnull }) => notnull === 1)
      .map(({ name }) => name),
    ['id', 'local_profile_id', 'category', 'created_at', 'updated_at'],
  );
  assert.deepEqual(
    wardrobeIndexColumns.map(({ name }) => name),
    ['local_profile_id', 'deleted_at', 'updated_at'],
  );
});

test('an existing version 1 database upgrades without changing local profile data', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionOneDatabase(database);
  await insertProfile(database);

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync('SELECT id, created_at FROM local_profiles');
  const wardrobeTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );

  assert.equal(version.user_version, 2);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{
    id: 'stable-profile-id',
    created_at: timestamp,
  }]);
  assert.equal(wardrobeTable.name, 'wardrobe_items');
});

test('version 2 is idempotent and preserves existing wardrobe rows when retried', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'top', NULL, NULL, ?, ?, NULL)
    `,
    ['item-id', 'stable-profile-id', 'Kazak', timestamp, timestamp],
  );

  await database.execAsync('PRAGMA user_version = 1;');
  await migrateDatabase(database);
  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync('SELECT id, name FROM wardrobe_items');
  assert.equal(version.user_version, 2);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ id: 'item-id', name: 'Kazak' }]);
});

test('wardrobe schema enforces owner and category constraints', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);

  const insertWardrobeItem = (id, profileId, category) =>
    database.runAsync(
      `
        INSERT INTO wardrobe_items (
          id, local_profile_id, name, category, color, photo_relative_path,
          created_at, updated_at, deleted_at
        ) VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, NULL)
      `,
      [id, profileId, category, timestamp, timestamp],
    );

  await assert.rejects(() => insertWardrobeItem('orphan', 'missing-profile', 'top'));
  await assert.rejects(() => insertWardrobeItem('invalid-category', 'stable-profile-id', 'hat'));
  await insertWardrobeItem('valid-item', 'stable-profile-id', 'accessory');

  const rows = await database.getAllAsync('SELECT id, category FROM wardrobe_items');
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: 'valid-item', category: 'accessory' },
  ]);
});

test('version 1 profile constraints remain enforced after the version 2 migration', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database, 'first-profile-id');

  await assert.rejects(() => insertProfile(database, 'second-profile-id'));
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

test('a failed version 2 migration rolls back its table, version, and preserves version 1 profiles', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionOneDatabase(database);
  await insertProfile(database);

  const failingDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: async (source) => {
            if (source.includes('idx_wardrobe_items_profile_deleted_updated')) {
              throw new Error('injected version 2 failure');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(() => migrateDatabase(failingDatabase), /injected version 2 failure/);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const profile = await database.getFirstAsync('SELECT id FROM local_profiles');
  const wardrobeTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );

  assert.equal(version.user_version, 1);
  assert.deepEqual({ ...profile }, { id: 'stable-profile-id' });
  assert.equal(wardrobeTable, null);
});
