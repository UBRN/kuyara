import assert from 'node:assert/strict';
import test from 'node:test';

import { latestDatabaseVersion, migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const timestamp = '2026-07-30T10:00:00.000Z';
const deletedTimestamp = '2026-07-30T11:00:00.000Z';

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

async function createReleasedVersionTwoDatabase(database) {
  await createReleasedVersionOneDatabase(database);
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS wardrobe_items (
      id TEXT PRIMARY KEY NOT NULL,
      local_profile_id TEXT NOT NULL,
      name TEXT,
      category TEXT NOT NULL CHECK (
        category IN ('top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory')
      ),
      color TEXT,
      photo_relative_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_wardrobe_items_profile_deleted_updated
    ON wardrobe_items (local_profile_id, deleted_at, updated_at DESC);
    PRAGMA user_version = 2;
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

test('an empty database applies versions 1 through 7 in order with the final schema', async (t) => {
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

  assert.equal(latestDatabaseVersion, 7);
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
      'notifications_opt_in',
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
      'garment_type_id',
      'color_family',
      'thermal_level_override',
      'water_protection_override',
      'wind_protection_override',
      'breathability_override',
      'arm_coverage_override',
      'leg_coverage_override',
      'traction_suitability_override',
      'entry_state',
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
    ['id', 'local_profile_id', 'category', 'created_at', 'updated_at', 'entry_state'],
  );
  assert.equal(
    wardrobeColumns.find(({ name }) => name === 'entry_state').dflt_value,
    "'owned'",
  );
  assert.deepEqual(
    wardrobeIndexColumns.map(({ name }) => name),
    ['local_profile_id', 'deleted_at', 'updated_at'],
  );
});

test('an existing version 1 database upgrades through version 7 without changing profile data', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionOneDatabase(database);
  await insertProfile(database);

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync(
    'SELECT id, created_at, notifications_opt_in FROM local_profiles',
  );
  const wardrobeTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );

  assert.equal(version.user_version, 7);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{
    id: 'stable-profile-id',
    created_at: timestamp,
    notifications_opt_in: 0,
  }]);
  assert.equal(wardrobeTable.name, 'wardrobe_items');
});

test('versions 3 through 7 preserve a released version 2 wardrobe row and are not reapplied', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionTwoDatabase(database);
  await insertProfile(database);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'top', 'Mavi', 'wardrobe/legacy.jpg', ?, ?, ?)
    `,
    [
      'item-id',
      'stable-profile-id',
      'Kazak',
      timestamp,
      deletedTimestamp,
      deletedTimestamp,
    ],
  );

  await migrateDatabase(database);
  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync('SELECT * FROM wardrobe_items');
  assert.equal(version.user_version, 7);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{
    id: 'item-id',
    local_profile_id: 'stable-profile-id',
    name: 'Kazak',
    category: 'top',
    color: 'Mavi',
    photo_relative_path: 'wardrobe/legacy.jpg',
    created_at: timestamp,
    updated_at: deletedTimestamp,
    deleted_at: deletedTimestamp,
    garment_type_id: null,
    color_family: null,
    thermal_level_override: null,
    water_protection_override: null,
    wind_protection_override: null,
    breathability_override: null,
    arm_coverage_override: null,
    leg_coverage_override: null,
    traction_suitability_override: null,
    entry_state: 'owned',
  }]);
});

test('version 7 preserves version 6 wardrobe rows and defaults their entry state to owned', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());

  const stopBeforeVersionSeven = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: async (source) => {
            if (source.includes('ADD COLUMN entry_state')) {
              throw new Error('stop before version 7');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(
    () => migrateDatabase(stopBeforeVersionSeven),
    /stop before version 7/,
  );
  await insertProfile(database);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at, garment_type_id, color_family
      ) VALUES
        ('active-item', 'stable-profile-id', 'Kazak', 'top', 'Mavi', NULL, ?, ?, NULL, 'sweater', 'blue'),
        ('deleted-item', 'stable-profile-id', 'Bot', 'footwear', 'Siyah', 'wardrobe/boot.jpg', ?, ?, ?, 'weather_boots', 'black')
    `,
    [timestamp, timestamp, timestamp, deletedTimestamp, deletedTimestamp],
  );

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync('SELECT * FROM wardrobe_items ORDER BY id');
  assert.equal(version.user_version, 7);
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    {
      id: 'active-item', local_profile_id: 'stable-profile-id', name: 'Kazak',
      category: 'top', color: 'Mavi', photo_relative_path: null,
      created_at: timestamp, updated_at: timestamp, deleted_at: null,
      garment_type_id: 'sweater', color_family: 'blue',
      thermal_level_override: null, water_protection_override: null,
      wind_protection_override: null, breathability_override: null,
      arm_coverage_override: null, leg_coverage_override: null,
      traction_suitability_override: null,
      entry_state: 'owned',
    },
    {
      id: 'deleted-item', local_profile_id: 'stable-profile-id', name: 'Bot',
      category: 'footwear', color: 'Siyah', photo_relative_path: 'wardrobe/boot.jpg',
      created_at: timestamp, updated_at: deletedTimestamp, deleted_at: deletedTimestamp,
      garment_type_id: 'weather_boots', color_family: 'black',
      thermal_level_override: null, water_protection_override: null,
      wind_protection_override: null, breathability_override: null,
      arm_coverage_override: null, leg_coverage_override: null,
      traction_suitability_override: null, entry_state: 'owned',
    },
  ]);
});

test('wardrobe schema enforces owner, category, and entry state constraints', async (t) => {
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
  await database.runAsync(
    "UPDATE wardrobe_items SET entry_state = 'wanted' WHERE id = 'valid-item'",
  );
  await assert.rejects(() =>
    database.runAsync(
      "UPDATE wardrobe_items SET entry_state = 'borrowed' WHERE id = 'valid-item'",
    ),
  );

  const rows = await database.getAllAsync('SELECT id, category, entry_state FROM wardrobe_items');
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: 'valid-item', category: 'accessory', entry_state: 'wanted' },
  ]);
});

test('version 3 constrains nullable taxonomy enums without constraining catalog IDs', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at, garment_type_id, color_family
      ) VALUES (?, ?, NULL, 'top', NULL, NULL, ?, ?, NULL, ?, 'blue')
    `,
    ['future-type-item', 'stable-profile-id', timestamp, timestamp, 'future_type'],
  );

  const invalidEnumValues = [
    ['color_family', 'cyan'],
    ['thermal_level_override', 'extreme'],
    ['water_protection_override', 'submersible'],
    ['wind_protection_override', 'windproof'],
    ['breathability_override', 'maximum'],
    ['arm_coverage_override', 'quarter'],
    ['leg_coverage_override', 'quarter'],
    ['traction_suitability_override', 'certified'],
  ];
  for (const [column, value] of invalidEnumValues) {
    await assert.rejects(() =>
      database.runAsync(
        `UPDATE wardrobe_items SET ${column} = ? WHERE id = ?`,
        [value, 'future-type-item'],
      ),
    );
  }

  const row = await database.getFirstAsync(
    'SELECT garment_type_id, color_family FROM wardrobe_items WHERE id = ?',
    ['future-type-item'],
  );
  assert.deepEqual({ ...row }, {
    garment_type_id: 'future_type',
    color_family: 'blue',
  });
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

test('a failed version 3 migration rolls back added columns and preserves version 2 rows', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionTwoDatabase(database);
  await insertProfile(database);
  await database.runAsync(
    `
      INSERT INTO wardrobe_items (
        id, local_profile_id, name, category, color, photo_relative_path,
        created_at, updated_at, deleted_at
      ) VALUES ('legacy-item', 'stable-profile-id', 'Kazak', 'top', NULL, NULL, ?, ?, NULL)
    `,
    [timestamp, timestamp],
  );

  const failingDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: async (source) => {
            if (source.includes('ADD COLUMN garment_type_id')) {
              await transaction.execAsync(
                'ALTER TABLE wardrobe_items ADD COLUMN garment_type_id TEXT;',
              );
              throw new Error('injected version 3 failure');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(
    () => migrateDatabase(failingDatabase),
    /injected version 3 failure/,
  );

  const version = await database.getFirstAsync('PRAGMA user_version');
  const columns = await database.getAllAsync('PRAGMA table_info(wardrobe_items)');
  const row = await database.getFirstAsync(
    'SELECT id, name, category FROM wardrobe_items WHERE id = ?',
    ['legacy-item'],
  );
  assert.equal(version.user_version, 2);
  assert.equal(columns.some(({ name }) => name === 'garment_type_id'), false);
  assert.deepEqual({ ...row }, {
    id: 'legacy-item',
    name: 'Kazak',
    category: 'top',
  });
});

test('version 4 upgrades a released version 3 database and rolls back atomically on failure', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionTwoDatabase(database);
  await insertProfile(database);

  const stopBeforeVersionFour = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: async (source) => {
            if (source.includes('CREATE TABLE IF NOT EXISTS active_locations')) {
              throw new Error('injected version 4 failure');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(
    () => migrateDatabase(stopBeforeVersionFour),
    /injected version 4 failure/,
  );
  const failedVersion = await database.getFirstAsync('PRAGMA user_version');
  const failedWeatherTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'weather_snapshots'",
  );
  const profile = await database.getFirstAsync('SELECT id FROM local_profiles');
  assert.equal(failedVersion.user_version, 3);
  assert.equal(failedWeatherTable, null);
  assert.deepEqual({ ...profile }, { id: 'stable-profile-id' });

  await migrateDatabase(database);
  const version = await database.getFirstAsync('PRAGMA user_version');
  const tables = await database.getAllAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('active_locations', 'weather_snapshots', 'weather_hourly_entries') ORDER BY name",
  );
  assert.equal(version.user_version, 7);
  assert.deepEqual(tables.map(({ name }) => name), [
    'active_locations',
    'weather_hourly_entries',
    'weather_snapshots',
  ]);
});

test('a failed version 6 migration rolls back the profile column and version', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());

  const failingDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
          execAsync: async (source) => {
            if (source.includes('notifications_opt_in')) {
              throw new Error('injected version 6 failure');
            }
            return transaction.execAsync(source);
          },
          runAsync: transaction.runAsync.bind(transaction),
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
        }),
      ),
  };

  await assert.rejects(
    () => migrateDatabase(failingDatabase),
    /injected version 6 failure/,
  );

  const version = await database.getFirstAsync('PRAGMA user_version');
  const columns = await database.getAllAsync('PRAGMA table_info(local_profiles)');
  assert.equal(version.user_version, 5);
  assert.equal(columns.some(({ name }) => name === 'notifications_opt_in'), false);
});
