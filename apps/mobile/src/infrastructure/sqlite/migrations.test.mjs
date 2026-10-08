import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { normalizeOptionalWardrobeText } from '@/features/wardrobe/domain/wardrobe-item';
import { WARDROBE_NAME_MAX_LENGTH } from '@/features/wardrobe/domain/wardrobe-name';

import { latestDatabaseVersion, migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const timestamp = '2026-07-30T10:00:00.000Z';
const deletedTimestamp = '2026-07-30T11:00:00.000Z';
// Migration 27: every existing profile reads both units as System.
const unitDefaults = { temperature_unit: 'system', wind_speed_unit: 'system' };

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
        singleton_key, id, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, 'system', 'system', 0, ?, ?, NULL)
    `,
    [id, timestamp, timestamp],
  );
}

test('an empty database applies all migrations in order with the final schema', async (t) => {
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
  const deliveryColumns = await database.getAllAsync(
    'PRAGMA table_info(weather_alert_deliveries)',
  );

  assert.equal(latestDatabaseVersion, 29);
  assert.equal(version.user_version, latestDatabaseVersion);
  assert.equal(profileTable.name, 'local_profiles');
  assert.match(profileTable.sql, /CHECK \(singleton_key = 1\)/);
  assert.deepEqual(
    profileColumns.map(({ name }) => name),
    [
      'singleton_key',
      'id',
      'gender',
      'language_preference',
      'theme_preference',
      'onboarding_completed',
      'created_at',
      'updated_at',
      'deleted_at',
      'notifications_opt_in',
      'birth_date',
      'dress_style',
      'analytics_consent',
      'weather_alert_offer_shown',
      'morning_briefing_opt_in',
      'display_name',
      'name_prompt_version',
      'style_aesthetics',
      'morning_sheet_enabled',
      'easier_to_see',
      'walkthrough_version',
      'swap_hint_shown',
      'pending_sync',
      'temperature_unit',
      'wind_speed_unit',
    ],
  );
  assert.match(profileTable.sql, /weather_alert_offer_shown IN \(0, 1\)/);
  assert.match(profileTable.sql, /morning_briefing_opt_in IN \(0, 1\)/);
  assert.equal(
    profileColumns.find(({ name }) => name === 'morning_briefing_opt_in').dflt_value,
    '0',
  );
  assert.equal(
    profileColumns.find(({ name }) => name === 'morning_briefing_opt_in').notnull,
    1,
  );
  assert.equal(
    profileColumns.find(({ name }) => name === 'weather_alert_offer_shown').dflt_value,
    '0',
  );
  assert.equal(
    profileColumns.find(({ name }) => name === 'weather_alert_offer_shown').notnull,
    1,
  );
  assert.match(profileTable.sql, /analytics_consent IN \('undecided', 'granted', 'withdrawn'\)/);
  assert.equal(
    profileColumns.find(({ name }) => name === 'analytics_consent').dflt_value,
    "'undecided'",
  );
  assert.equal(
    profileColumns.find(({ name }) => name === 'analytics_consent').notnull,
    1,
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
      'color_option_id',
      'color_custom_hex',
      'pending_sync',
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
    ['id', 'local_profile_id', 'category', 'created_at', 'updated_at', 'entry_state', 'pending_sync'],
  );
  assert.equal(
    wardrobeColumns.find(({ name }) => name === 'entry_state').dflt_value,
    "'owned'",
  );
  assert.deepEqual(
    wardrobeIndexColumns.map(({ name }) => name),
    ['local_profile_id', 'deleted_at', 'updated_at'],
  );
  assert.deepEqual(
    deliveryColumns.map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
    [
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'local_profile_id', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'fire_at', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
    ],
  );
});

test('an existing version 1 database upgrades through version 19 without changing profile data', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createReleasedVersionOneDatabase(database);
  await insertProfile(database);

  await migrateDatabase(database);

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync(
    `SELECT id, created_at, notifications_opt_in, analytics_consent,
     weather_alert_offer_shown, morning_briefing_opt_in FROM local_profiles`,
  );
  const wardrobeTable = await database.getFirstAsync(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'wardrobe_items'",
  );

  assert.equal(version.user_version, latestDatabaseVersion);
  assert.deepEqual(rows.map((row) => ({ ...row })), [{
    id: 'stable-profile-id',
    created_at: timestamp,
    notifications_opt_in: 0,
    analytics_consent: 'undecided',
    weather_alert_offer_shown: 0,
    morning_briefing_opt_in: 0,
  }]);
  assert.equal(wardrobeTable.name, 'wardrobe_items');
  // ADR 0004: the contextual offer is answered once, so only 0 and 1 are storable and the
  // answer is never absent.
  await assert.rejects(
    () => database.runAsync('UPDATE local_profiles SET weather_alert_offer_shown = 2'),
    /CHECK/,
  );
  await assert.rejects(
    () => database.runAsync('UPDATE local_profiles SET weather_alert_offer_shown = NULL'),
    /NOT NULL/,
  );
  // ADR 0004: the morning briefing's opt-in is answered the same way, and version 15 leaves
  // every existing row opted out rather than assuming consent.
  await assert.rejects(
    () => database.runAsync('UPDATE local_profiles SET morning_briefing_opt_in = 2'),
    /CHECK/,
  );
  await assert.rejects(
    () => database.runAsync('UPDATE local_profiles SET morning_briefing_opt_in = NULL'),
    /NOT NULL/,
  );
});

test('versions 3 through 12 preserve a released version 2 wardrobe row and are not reapplied', async (t) => {
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
  await migrateDatabase(new NodeSqliteDatabase(database.database));

  const version = await database.getFirstAsync('PRAGMA user_version');
  const rows = await database.getAllAsync('SELECT * FROM wardrobe_items');
  assert.equal(version.user_version, latestDatabaseVersion);
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
    color_option_id: null,
    color_custom_hex: null,
    pending_sync: 0,
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
  assert.equal(version.user_version, latestDatabaseVersion);
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
      color_option_id: null, color_custom_hex: null, pending_sync: 0,
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
      color_option_id: null, color_custom_hex: null, pending_sync: 0,
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
  const injectedError = new Error('injected migration failure');

  const failingDatabase = {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) =>
        task({
              execAsync: async (source) => {
            if (source.includes('CREATE TABLE local_profiles')) {
              throw injectedError;
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
    (error) =>
      error instanceof Error
      && error.message === 'Migration to version 1 failed: injected migration failure'
      && error.cause === injectedError,
  );

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
  assert.equal(version.user_version, latestDatabaseVersion);
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

async function createVersionSevenDatabase(database) {
  const beforeV8 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('CREATE TABLE local_profiles_v8')) throw new Error('stop before v8');
        return transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  try { await migrateDatabase(beforeV8); } catch (error) { assert.match(error.message, /stop before v8/); }
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 7);
}

for (const [preference, gender, deletedAt] of [['womens', 'woman', null], ['mens', 'man', deletedTimestamp], [null, null, null]]) {
  test(`version 8 preserves ${preference} profile and dependent rows`, async (t) => {
    const database = new NodeSqliteDatabase();
    t.after(() => database.close());
    await createVersionSevenDatabase(database);
    await insertProfile(database);
    await database.runAsync(`UPDATE local_profiles SET clothing_preference = ?, language_preference = 'tr', theme_preference = 'dark', onboarding_completed = ?, notifications_opt_in = 1, deleted_at = ?`, [preference, preference === null ? 0 : 1, deletedAt]);
    await database.runAsync(`INSERT INTO wardrobe_items (id, local_profile_id, category, created_at, updated_at, entry_state) VALUES ('item', 'stable-profile-id', 'top', ?, ?, 'wanted')`, [timestamp, timestamp]);
    const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
    const item = { ...await database.getFirstAsync('SELECT * FROM wardrobe_items') };
    await migrateDatabase(database);
    const { clothing_preference, ...preserved } = before;
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
      ...preserved,
      gender,
      birth_date: null,
      dress_style: null,
      onboarding_completed: 0,
      analytics_consent: 'undecided',
      weather_alert_offer_shown: 0,
      morning_briefing_opt_in: 0,
      display_name: null,
      name_prompt_version: 0,
      style_aesthetics: '[]',
      morning_sheet_enabled: 1,
      easier_to_see: 0,
      walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    });
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM wardrobe_items') }, {
      ...item, color_option_id: null, color_custom_hex: null, pending_sync: 0,
    });
    assert.equal((await database.getFirstAsync('PRAGMA user_version' )).user_version, latestDatabaseVersion);
    assert.equal((await database.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    await assert.rejects(() => database.runAsync("UPDATE wardrobe_items SET local_profile_id = 'missing'"), /FOREIGN KEY/);
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('SELECT gender FROM local_profiles')).gender, gender);
  });
}

test('version 8 static date constraint rejects out-of-bounds years', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionSevenDatabase(database);
  await insertProfile(database);
  await migrateDatabase(database);
  for (const date of ['1900-01-01', '2100-12-31', null]) {
    await database.runAsync('UPDATE local_profiles SET birth_date = ?', [date]);
    assert.equal((await database.getFirstAsync('SELECT birth_date FROM local_profiles')).birth_date, date);
  }
  for (const date of ['1899-12-31', '2101-01-01', 'abcd-01-01']) {
    await assert.rejects(() => database.runAsync('UPDATE local_profiles SET birth_date = ?', [date]), /CHECK/);
  }
});

test('version 8 rolls back a failed rebuild and preserves weather and recommendation references on retry', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionSevenDatabase(database);
  await insertProfile(database);
  await database.execAsync(`
    INSERT INTO active_locations VALUES ('stable-profile-id', 'manual:sample', 'manual', 'sample', 0, 0, 'UTC', NULL, '${timestamp}', '${timestamp}');
    INSERT INTO weather_snapshots VALUES ('weather', 'stable-profile-id', 'manual:sample', 'UTC', '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0);
    INSERT INTO weather_hourly_entries VALUES ('weather', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
    INSERT INTO recommendation_snapshots VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample', 'deterministic-fallback', '{}', '[]', '${timestamp}', '${timestamp}');
  `);
  const tables = ['local_profiles', 'active_locations', 'weather_snapshots', 'weather_hourly_entries', 'recommendation_snapshots'];
  const before = await Promise.all(tables.map((table) => database.getAllAsync(`SELECT * FROM ${table}`)));
  const failingDatabase = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        await transaction.execAsync(sql);
        if (sql.includes('ALTER TABLE local_profiles_v8')) throw new Error('failed after rebuild');
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failingDatabase), /failed after rebuild/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 7);
  assert.equal((await database.getFirstAsync('PRAGMA foreign_keys')).foreign_keys, 1);
  assert.equal((await database.getFirstAsync('PRAGMA defer_foreign_keys')).defer_foreign_keys, 0);
  assert.deepEqual(await Promise.all(tables.map((table) => database.getAllAsync(`SELECT * FROM ${table}`))), before);
  await migrateDatabase(database);
  const after = await Promise.all(tables.slice(1).map((table) => database.getAllAsync(`SELECT * FROM ${table}`)));
  assert.deepEqual(after[0].map(({ display_name, ...row }) => row), before[1].map((row) => ({ ...row })));
  assert.equal(after[0][0].display_name, null);
  assert.deepEqual(
    after.slice(1).map((rows) => rows.map((row) => ({ ...row }))),
    [
      before[2].map((row) => ({ ...row, daily_json: null })),
      ...before.slice(3).map((rows) => rows.map((row) => ({ ...row }))),
    ],
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
});

test('version 8 ignores orphaned hourly rows left by a snapshot deleted with foreign keys off', async (t) => {
  // A real device carried 234 such rows at version 7 and TestFlight build 3 could not start.
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionSevenDatabase(database);
  await insertProfile(database);
  await database.execAsync(`
    UPDATE local_profiles SET clothing_preference = 'womens';
    INSERT INTO active_locations VALUES ('stable-profile-id', 'manual:sample', 'manual', 'sample', 0, 0, 'UTC', NULL, '${timestamp}', '${timestamp}');
    INSERT INTO weather_snapshots VALUES ('old', 'stable-profile-id', 'manual:sample', 'UTC', '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0);
    INSERT INTO weather_hourly_entries VALUES ('old', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
    PRAGMA foreign_keys = OFF;
    DELETE FROM weather_snapshots WHERE id = 'old';
    PRAGMA foreign_keys = ON;
    INSERT INTO weather_snapshots VALUES ('current', 'stable-profile-id', 'manual:sample', 'UTC', '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0);
    INSERT INTO weather_hourly_entries VALUES ('current', '${timestamp}', 21, 21, 'clear', 0, 0, 0.5, 0);
  `);
  const orphans = await database.getAllAsync('PRAGMA foreign_key_check');
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].parent, 'weather_snapshots');
  const hourlyBefore = await database.getAllAsync('SELECT * FROM weather_hourly_entries ORDER BY snapshot_id');

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await database.getFirstAsync('SELECT gender FROM local_profiles')).gender, 'woman');
  assert.deepEqual(await database.getAllAsync('SELECT * FROM weather_hourly_entries ORDER BY snapshot_id'), hourlyBefore);
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), orphans);
});

test('version 8 still rejects a child row whose profile does not exist', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionSevenDatabase(database);
  await insertProfile(database);
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    INSERT INTO wardrobe_items (id, local_profile_id, category, created_at, updated_at, entry_state) VALUES ('item', 'missing', 'top', '${timestamp}', '${timestamp}', 'owned');
    PRAGMA foreign_keys = ON;
  `);

  await assert.rejects(() => migrateDatabase(database), /The profile migration violated foreign keys/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 7);
  assert.equal((await database.getFirstAsync('SELECT count(*) AS count FROM wardrobe_items')).count, 1);
});

async function createVersionEightDatabase(database) {
  const beforeV9 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('ADD COLUMN display_name')) throw new Error('stop before v9');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(beforeV9), /stop before v9/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 8);
}

for (const [id, name] of [['sample.istanbul', 'Istanbul'], ['sample.ankara', 'Ankara'], ['sample.london', 'London'], [null, null]]) {
  test(`version 9 preserves ${id ?? 'device'} location and cached weather while backfilling its name`, async (t) => {
    const database = new NodeSqliteDatabase();
    t.after(() => database.close());
    await createVersionEightDatabase(database);
    await insertProfile(database);
    const source = id ? 'manual' : 'device';
    const key = id ? `manual:${id}` : 'device:0:0';
    await database.runAsync('INSERT INTO active_locations VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)', ['stable-profile-id', key, source, id, 'UTC', id ? null : 'approximate', timestamp, timestamp]);
    await database.runAsync("INSERT INTO weather_snapshots VALUES ('weather', 'stable-profile-id', ?, 'UTC', ?, ?, 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0)", [key, timestamp, timestamp]);
    const beforeLocation = { ...await database.getFirstAsync('SELECT * FROM active_locations') };
    const beforeWeather = await database.getAllAsync('SELECT * FROM weather_snapshots');
    const beforeProfile = await database.getAllAsync('SELECT * FROM local_profiles');
    await migrateDatabase(database);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM active_locations') }, { ...beforeLocation, display_name: name });
    assert.deepEqual(
      (await database.getAllAsync('SELECT * FROM weather_snapshots')).map((row) => ({ ...row })),
      beforeWeather.map((row) => ({ ...row, daily_json: null })),
    );
    assert.deepEqual(
      (await database.getAllAsync('SELECT * FROM local_profiles'))
        .map((row) => ({ ...row })),
      beforeProfile.map((row) => ({
        ...row,
        dress_style: null,
        analytics_consent: 'undecided',
        weather_alert_offer_shown: 0,
      morning_briefing_opt_in: 0,
      display_name: null,
      name_prompt_version: 0,
      style_aesthetics: '[]',
      morning_sheet_enabled: 1,
      easier_to_see: 0,
      walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
      })),
    );
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    await database.runAsync("UPDATE active_locations SET display_name = 'Custom name'");
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('SELECT display_name FROM active_locations')).display_name, 'Custom name');
  });
}

test('version 9 rolls back column and backfill together on failure and retries safely', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionEightDatabase(database);
  await insertProfile(database);
  await database.runAsync("INSERT INTO active_locations VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul', 4101, 2898, 'Europe/Istanbul', NULL, ?, ?)", [timestamp, timestamp]);
  const before = await database.getAllAsync('SELECT * FROM active_locations');
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => { await transaction.execAsync(sql); if (sql.includes('ADD COLUMN display_name')) throw new Error('failed v9'); },
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /failed v9/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 8);
  assert.deepEqual(await database.getAllAsync('SELECT * FROM active_locations'), before);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('SELECT display_name FROM active_locations')).display_name, 'Istanbul');
});

async function createVersionNineDatabase(database) {
  const beforeV10 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('SET onboarding_completed = 0')) throw new Error('stop before v10');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(beforeV10), /stop before v10/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 9);
}

test('version 10 resets onboarding once and preserves the profile plus cached data', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionNineDatabase(database);
  await database.runAsync(`
    INSERT INTO local_profiles (
      singleton_key, id, gender, birth_date, language_preference, theme_preference,
      onboarding_completed, notifications_opt_in, created_at, updated_at, deleted_at
    ) VALUES (1, 'stable-profile-id', 'woman', '1994-03-14', 'tr', 'dark', 1, 1, ?, ?, NULL)
  `, [timestamp, timestamp]);
  await database.execAsync(`
    INSERT INTO active_locations VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul', 4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul');
    INSERT INTO weather_snapshots VALUES ('weather', 'stable-profile-id', 'manual:sample.istanbul', 'UTC', '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0);
    INSERT INTO weather_hourly_entries VALUES ('weather', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
    INSERT INTO recommendation_snapshots VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample.istanbul', 'deterministic-fallback', '{}', '[]', '${timestamp}', '${timestamp}');
  `);
  const cachedTables = ['active_locations', 'weather_snapshots', 'weather_hourly_entries', 'recommendation_snapshots'];
  const cachedBefore = await Promise.all(cachedTables.map((table) => database.getAllAsync(`SELECT * FROM ${table}`)));

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
    singleton_key: 1,
    id: 'stable-profile-id',
    gender: 'woman',
    language_preference: 'tr',
    theme_preference: 'dark',
    onboarding_completed: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    notifications_opt_in: 1,
    birth_date: '1994-03-14',
    dress_style: null,
    analytics_consent: 'undecided',
    weather_alert_offer_shown: 0,
    morning_briefing_opt_in: 0,
    display_name: null,
    name_prompt_version: 0,
    style_aesthetics: '[]',
    morning_sheet_enabled: 1,
    easier_to_see: 0,
    walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
  });
  for (const dressStyle of ['casual', 'smart', 'formal', null]) {
    await database.runAsync('UPDATE local_profiles SET dress_style = ?', [dressStyle]);
    assert.equal(
      (await database.getFirstAsync('SELECT dress_style FROM local_profiles')).dress_style,
      dressStyle,
    );
  }
  await assert.rejects(
    () => database.runAsync("UPDATE local_profiles SET dress_style = 'unknown'"),
    /CHECK/,
  );
  assert.deepEqual(
    (await Promise.all(cachedTables.map((table) => database.getAllAsync(`SELECT * FROM ${table}`))))
      .map((rows) => rows.map((row) => ({ ...row }))),
    cachedBefore.map((rows, index) => rows.map((row) => (
      cachedTables[index] === 'weather_snapshots' ? { ...row, daily_json: null } : { ...row }
    ))),
  );
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('SELECT onboarding_completed FROM local_profiles')).onboarding_completed, 0);
});

test('version 10 rolls back the reset and retries safely', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await createVersionNineDatabase(database);
  await database.runAsync(`
    INSERT INTO local_profiles (
      singleton_key, id, gender, birth_date, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at, deleted_at
    ) VALUES (1, 'stable-profile-id', 'man', NULL, 'en', 'light', 1, ?, ?, NULL)
  `, [timestamp, timestamp]);
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        await transaction.execAsync(sql);
        if (sql.includes('SET onboarding_completed = 0')) throw new Error('failed v10');
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };

  await assert.rejects(() => migrateDatabase(failing), /failed v10/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 9);
  assert.equal((await database.getFirstAsync('SELECT onboarding_completed FROM local_profiles')).onboarding_completed, 1);
  assert.equal(
    (await database.getAllAsync('PRAGMA table_info(local_profiles)'))
      .some(({ name }) => name === 'dress_style'),
    false,
  );
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('SELECT onboarding_completed FROM local_profiles')).onboarding_completed, 0);
  assert.equal((await database.getFirstAsync('SELECT dress_style FROM local_profiles')).dress_style, null);
});

test('version 11 adds the weather alert ledger without changing existing rows', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const beforeV11 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('CREATE TABLE weather_alert_deliveries')) {
            throw new Error('stop before v11');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(beforeV11), /stop before v11/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 10);
  await insertProfile(database);
  await database.runAsync(
    `INSERT INTO wardrobe_items (
      id, local_profile_id, category, created_at, updated_at, entry_state
    ) VALUES ('kept-item', 'stable-profile-id', 'top', ?, ?, 'owned')`,
    [timestamp, timestamp],
  );
  const profileBefore = await database.getAllAsync('SELECT * FROM local_profiles');
  const wardrobeBefore = await database.getAllAsync('SELECT * FROM wardrobe_items');

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM local_profiles')).map((row) => ({ ...row })),
    profileBefore.map((row) => ({
      ...row,
      analytics_consent: 'undecided',
      weather_alert_offer_shown: 0,
      morning_briefing_opt_in: 0,
      display_name: null,
      name_prompt_version: 0,
      style_aesthetics: '[]',
      morning_sheet_enabled: 1,
      easier_to_see: 0,
      walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    })),
  );
  assert.deepEqual((await database.getAllAsync('SELECT * FROM wardrobe_items')).map((row) => ({
    ...row, color_option_id: undefined, color_custom_hex: undefined,
  })), wardrobeBefore.map((row) => ({
    ...row, color_option_id: undefined, color_custom_hex: undefined, pending_sync: 0,
  })));
  assert.deepEqual(
    (await database.getAllAsync('PRAGMA table_info(weather_alert_deliveries)'))
      .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk })),
    [
      { name: 'id', type: 'TEXT', notnull: 1, pk: 1 },
      { name: 'local_profile_id', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'fire_at', type: 'TEXT', notnull: 1, pk: 0 },
      { name: 'created_at', type: 'TEXT', notnull: 1, pk: 0 },
    ],
  );
  assert.deepEqual(
    (await database.getAllAsync('PRAGMA foreign_key_list(weather_alert_deliveries)'))
      .map(({ table, from, to, on_update, on_delete }) => ({
        table, from, to, on_update, on_delete,
      })),
    [{
      table: 'local_profiles',
      from: 'local_profile_id',
      to: 'id',
      on_update: 'RESTRICT',
      on_delete: 'RESTRICT',
    }],
  );
});

test('version 12 defaults an existing profile row to undecided analytics consent', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const beforeV12 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('ADD COLUMN analytics_consent')) {
            throw new Error('stop before v12');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(beforeV12), /stop before v12/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 11);
  await insertProfile(database);
  await database.runAsync(
    `UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
     language_preference = 'tr', theme_preference = 'dark', notifications_opt_in = 1`,
  );
  const profileBefore = (await database.getAllAsync('SELECT * FROM local_profiles'))
    .map((row) => ({ ...row }));

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM local_profiles')).map((row) => ({ ...row })),
    profileBefore.map((row) => ({
      ...row,
      analytics_consent: 'undecided',
      weather_alert_offer_shown: 0,
      morning_briefing_opt_in: 0,
      display_name: null,
      name_prompt_version: 0,
      style_aesthetics: '[]',
      morning_sheet_enabled: 1,
      easier_to_see: 0,
      walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    })),
  );
  for (const consent of ['undecided', 'granted', 'withdrawn']) {
    await database.runAsync('UPDATE local_profiles SET analytics_consent = ?', [consent]);
    assert.equal(
      (await database.getFirstAsync('SELECT analytics_consent FROM local_profiles'))
        .analytics_consent,
      consent,
    );
  }
  await assert.rejects(
    () => database.runAsync("UPDATE local_profiles SET analytics_consent = 'maybe'"),
    /CHECK/,
  );
  await assert.rejects(
    () => database.runAsync('UPDATE local_profiles SET analytics_consent = NULL'),
    /NOT NULL/,
  );
  await migrateDatabase(database);
  assert.equal(
    (await database.getFirstAsync('SELECT analytics_consent FROM local_profiles'))
      .analytics_consent,
    'withdrawn',
  );
});

// ADR 0004: version 15 adds the morning briefing's own opt-in. It is additive, so the only
// thing worth asserting is that a real version 14 install crosses it untouched: the profile
// row keeps every value it had, the new column reads 0, the delivery ledger is intact and
// no foreign key is left dangling.
test('version 15 adds the briefing opt-in without disturbing a version 14 install', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const stopBeforeV15 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('ADD COLUMN morning_briefing_opt_in')) {
            throw new Error('stop before v15');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(stopBeforeV15), /stop before v15/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 14);

  await insertProfile(database);
  await database.runAsync(
    `UPDATE local_profiles SET gender = 'woman', dress_style = 'smart', birth_date = '1994-03-14',
     language_preference = 'tr', theme_preference = 'dark', onboarding_completed = 1,
     notifications_opt_in = 1, weather_alert_offer_shown = 1, analytics_consent = 'granted'`,
  );
  await database.runAsync(
    `INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
     VALUES ('precipitation_onset:manual:sample.istanbul:2026-09-09', 'stable-profile-id', ?, ?)`,
    [timestamp, timestamp],
  );
  const profileBefore = (await database.getAllAsync('SELECT * FROM local_profiles'))
    .map((row) => ({ ...row }));
  const deliveriesBefore = (await database.getAllAsync('SELECT * FROM weather_alert_deliveries'))
    .map((row) => ({ ...row }));
  assert.equal('morning_briefing_opt_in' in profileBefore[0], false);

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal(latestDatabaseVersion, 29);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM local_profiles')).map((row) => ({ ...row })),
    profileBefore.map((row) => ({ ...row, morning_briefing_opt_in: 0, display_name: null, name_prompt_version: 0, style_aesthetics: '[]', morning_sheet_enabled: 1, easier_to_see: 0, walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults })),
  );
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM weather_alert_deliveries')).map((row) => ({ ...row })),
    deliveriesBefore,
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
  // The flag is answerable both ways afterwards, and only both ways.
  await database.runAsync('UPDATE local_profiles SET morning_briefing_opt_in = 1');
  assert.equal(
    (await database.getFirstAsync('SELECT morning_briefing_opt_in FROM local_profiles'))
      .morning_briefing_opt_in,
    1,
  );
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.equal(
    (await database.getFirstAsync('SELECT morning_briefing_opt_in FROM local_profiles'))
      .morning_briefing_opt_in,
    1,
  );
});

// ADR 0034 section 3: the widened CHECK is a table rebuild, so the test that matters is
// that every existing snapshot row survives it byte for byte and that an unknown mode is
// still rejected afterwards.
async function migrateToVersionTwelve(database) {
  const stopBeforeV13 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('recommendation_snapshots_v13')) {
            throw new Error('stop before v13');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(stopBeforeV13), /stop before v13/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 12);
}

test('version 13 widens the generation mode check and preserves every snapshot row', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateToVersionTwelve(database);
  await insertProfile(database);
  await database.execAsync(`
    INSERT INTO recommendation_snapshots VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample', 'ai-assisted', '{"a":1}', '[]', '${timestamp}', '${timestamp}');
  `);
  const before = (await database.getAllAsync('SELECT * FROM recommendation_snapshots'))
    .map((row) => ({ ...row }));
  assert.equal(before.length, 1);

  await migrateDatabase(database);

  const after = (await database.getAllAsync('SELECT * FROM recommendation_snapshots'))
    .map((row) => ({ ...row }));
  const table = await database.getFirstAsync(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recommendation_snapshots'",
  );
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(after, before);
  assert.match(
    table.sql,
    /generation_mode IN \('on-device-ai', 'ai-assisted', 'deterministic-fallback'\)/,
  );
  assert.deepEqual(
    (await database.getAllAsync('PRAGMA foreign_key_list(recommendation_snapshots)'))
      .map(({ table: parent, from, to, on_update, on_delete }) =>
        ({ parent, from, to, on_update, on_delete })),
    [{
      parent: 'local_profiles',
      from: 'local_profile_id',
      to: 'id',
      on_update: 'RESTRICT',
      on_delete: 'RESTRICT',
    }],
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
});

test('version 13 accepts the on-device mode and still rejects an unknown one', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  await database.execAsync(`
    INSERT INTO recommendation_snapshots VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample', 'deterministic-fallback', '{}', '[]', '${timestamp}', '${timestamp}');
  `);

  for (const mode of ['on-device-ai', 'ai-assisted', 'deterministic-fallback']) {
    await database.runAsync('UPDATE recommendation_snapshots SET generation_mode = ?', [mode]);
    assert.equal(
      (await database.getFirstAsync('SELECT generation_mode FROM recommendation_snapshots'))
        .generation_mode,
      mode,
    );
  }
  for (const mode of ['on_device_ai', 'apple-intelligence', '']) {
    await assert.rejects(
      () => database.runAsync('UPDATE recommendation_snapshots SET generation_mode = ?', [mode]),
      /CHECK/,
    );
  }
});

test('version 13 carries an orphaned snapshot row through instead of refusing to start', async (t) => {
  // A snapshot whose profile row is gone: never produced by app code (nothing deletes a
  // profile) and now unreachable with foreign keys enforced on every connection, so it is
  // seeded with enforcement off. The rebuild must copy it, not throw, or the app cannot
  // start. Under enforcement the copy bumps the deferred counter and the implicit DELETE of
  // the old table lowers it, so COMMIT sees zero and the orphan is carried through.
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateToVersionTwelve(database);
  await database.execAsync(`
    PRAGMA foreign_keys = OFF;
    INSERT INTO recommendation_snapshots VALUES ('orphan', 'missing-profile', 'weather', 'manual:sample', 'ai-assisted', '{}', '[]', '${timestamp}', '${timestamp}');
    PRAGMA foreign_keys = ON;
  `);
  const before = (await database.getAllAsync('SELECT * FROM recommendation_snapshots'))
    .map((row) => ({ ...row }));
  const orphansBefore = await database.getAllAsync('PRAGMA foreign_key_check');
  assert.equal(orphansBefore.length, 1);

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM recommendation_snapshots')).map((row) => ({ ...row })),
    before,
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), orphansBefore);
});

test('two concurrent callers run the migration set once', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  let transactions = 0;
  const startTransaction = database.withExclusiveTransactionAsync.bind(database);
  database.withExclusiveTransactionAsync = (task) => {
    transactions += 1;
    return startTransaction(task);
  };

  await Promise.all([migrateDatabase(database), migrateDatabase(database)]);

  assert.equal(transactions, latestDatabaseVersion);
  assert.equal(
    (await database.getFirstAsync('PRAGMA user_version')).user_version,
    latestDatabaseVersion,
  );
});

test('a failed migration is not cached, so the next caller retries', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const readVersion = database.getFirstAsync.bind(database);
  let failNextVersionRead = true;
  database.getFirstAsync = async (source, params = []) => {
    if (failNextVersionRead && source === 'PRAGMA user_version') {
      failNextVersionRead = false;
      throw new Error('the database is locked');
    }
    return readVersion(source, params);
  };

  await assert.rejects(() => migrateDatabase(database), /the database is locked/);

  await migrateDatabase(database);

  assert.equal(
    (await database.getFirstAsync('PRAGMA user_version')).user_version,
    latestDatabaseVersion,
  );
});

// Version 16 adds the daily outlook's own column to `weather_snapshots`. It is additive and
// nullable, so what matters is that a real version 15 install crosses it with its cached
// weather intact and reads as carrying no outlook until the next refresh writes one.
test('version 16 adds the daily outlook column without disturbing a version 15 install', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const stopBeforeV16 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('ADD COLUMN daily_json')) {
            throw new Error('stop before v16');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(stopBeforeV16), /stop before v16/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 15);

  await insertProfile(database);
  await database.execAsync(`
    INSERT INTO active_locations VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul', 4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul');
    INSERT INTO weather_snapshots VALUES ('weather', 'stable-profile-id', 'manual:sample.istanbul', 'Europe/Istanbul', '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear', 0, 0, 0.5, 0);
    INSERT INTO weather_hourly_entries VALUES ('weather', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
  `);
  const snapshotsBefore = (await database.getAllAsync('SELECT * FROM weather_snapshots'))
    .map((row) => ({ ...row }));
  const hourlyBefore = (await database.getAllAsync('SELECT * FROM weather_hourly_entries'))
    .map((row) => ({ ...row }));
  assert.equal('daily_json' in snapshotsBefore[0], false);

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal(latestDatabaseVersion, 29);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM weather_snapshots')).map((row) => ({ ...row })),
    snapshotsBefore.map((row) => ({ ...row, daily_json: null })),
  );
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM weather_hourly_entries')).map((row) => ({ ...row })),
    hourlyBefore,
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);

  const dailyColumn = (await database.getAllAsync('PRAGMA table_info(weather_snapshots)'))
    .find(({ name }) => name === 'daily_json');
  assert.deepEqual(
    { type: dailyColumn.type, notnull: dailyColumn.notnull, dflt_value: dailyColumn.dflt_value },
    { type: 'TEXT', notnull: 0, dflt_value: null },
  );

  // The column holds a document afterwards, and a second run of the migration leaves it be.
  const outlook = JSON.stringify([{
    dateKey: '2026-09-18',
    condition: 'clear',
    minimumTemperatureCelsius: 19,
    maximumTemperatureCelsius: 21,
    precipitationProbability: 0.1,
    precipitationMillimetres: null,
  }]);
  await database.runAsync('UPDATE weather_snapshots SET daily_json = ?', [outlook]);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.equal(
    (await database.getFirstAsync('SELECT daily_json FROM weather_snapshots')).daily_json,
    outlook,
  );
});

test('version 17 adds the optional name and prompt gate to a filled version 16 profile', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const stopBeforeV17 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('ALTER TABLE local_profiles') && sql.includes('ADD COLUMN display_name')) {
            throw new Error('stop before v17');
          }
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(stopBeforeV17), /stop before v17/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 16);

  await insertProfile(database);
  await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
    birth_date = '1994-03-14', language_preference = 'tr', theme_preference = 'dark',
    onboarding_completed = 1, notifications_opt_in = 1, analytics_consent = 'granted'`);
  await database.runAsync(`INSERT INTO wardrobe_items
    (id, local_profile_id, name, category, created_at, updated_at, entry_state)
    VALUES ('saved-item', 'stable-profile-id', 'Blue coat', 'outerwear', ?, ?, 'owned')`,
    [timestamp, timestamp]);
  const profileBefore = (await database.getAllAsync('SELECT * FROM local_profiles'))
    .map((row) => ({ ...row }));
  const wardrobeBefore = (await database.getAllAsync('SELECT * FROM wardrobe_items'))
    .map((row) => ({ ...row }));

  const failSecondColumn = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) =>
      database.withExclusiveTransactionAsync((transaction) => task({
        execAsync: async (sql) => {
          if (sql.includes('ADD COLUMN name_prompt_version')) throw new Error('second column failed');
          await transaction.execAsync(sql);
        },
        runAsync: transaction.runAsync.bind(transaction),
        getFirstAsync: transaction.getFirstAsync.bind(transaction),
        getAllAsync: transaction.getAllAsync.bind(transaction),
      })),
  };
  await assert.rejects(() => migrateDatabase(failSecondColumn), /second column failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 16);
  assert.equal((await database.getAllAsync('PRAGMA table_info(local_profiles)'))
    .some(({ name }) => name === 'display_name'), false);

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM local_profiles')).map((row) => ({ ...row })),
    profileBefore.map((row) => ({ ...row, display_name: null, name_prompt_version: 0, style_aesthetics: '[]', morning_sheet_enabled: 1, easier_to_see: 0, walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults })),
  );
  assert.deepEqual(
    (await database.getAllAsync('SELECT * FROM wardrobe_items')).map((row) => ({ ...row })),
    wardrobeBefore.map((row) => ({ ...row, color_option_id: null, color_custom_hex: null, pending_sync: 0 })),
  );
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);

  await database.runAsync(`UPDATE local_profiles SET display_name = 'Deniz', name_prompt_version = 1`);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.deepEqual({ ...await database.getFirstAsync(
    'SELECT display_name, name_prompt_version FROM local_profiles',
  ) }, { display_name: 'Deniz', name_prompt_version: 1 });
});

test('version 18 keeps a filled version 17 profile and adds daily choices', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  const stopBeforeV18 = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      ...transaction,
      execAsync: async (sql) => {
        if (sql.includes('ADD COLUMN style_aesthetics')) throw new Error('stop before v18');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(stopBeforeV18), /stop before v18/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 17);
  await insertProfile(database);
  await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
    display_name = 'Deniz', name_prompt_version = 1, onboarding_completed = 1`);
  await database.execAsync(`
    INSERT INTO active_locations (
      local_profile_id, location_key, source, manual_catalog_id, latitude_e2,
      longitude_e2, time_zone, device_accuracy, created_at, updated_at, display_name
    ) VALUES (
      'stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul',
      4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul'
    );
    INSERT INTO weather_snapshots (
      id, local_profile_id, location_key, time_zone, fetched_at, observed_at,
      origin_kind, source_id, temperature_c, apparent_temperature_c,
      minimum_temperature_c, maximum_temperature_c, condition_code,
      precipitation_probability, wind_speed_mps, humidity, uv_index, daily_json
    ) VALUES (
      'weather', 'stable-profile-id', 'manual:sample.istanbul', 'Europe/Istanbul',
      '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear',
      0, 0, 0.5, 0, NULL
    );
    INSERT INTO weather_hourly_entries (
      snapshot_id, forecast_at, temperature_c, apparent_temperature_c, condition_code,
      precipitation_probability, wind_speed_mps, humidity, uv_index
    ) VALUES ('weather', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
    INSERT INTO recommendation_snapshots (
      id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
      context_json, outfits_json, created_at, updated_at
    ) VALUES (
      'recommendation', 'stable-profile-id', 'weather', 'manual:sample.istanbul',
      'deterministic-fallback', '{"fixture":true}', '[]', '${timestamp}', '${timestamp}'
    );
    INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
    VALUES ('precipitation_onset:manual:sample.istanbul:2026-09-24',
      'stable-profile-id', '${timestamp}', '${timestamp}');
  `);
  await database.runAsync(`INSERT INTO wardrobe_items
    (id, local_profile_id, name, category, created_at, updated_at, entry_state)
    VALUES ('saved-item', 'stable-profile-id', 'Blue coat', 'outerwear', ?, ?, 'owned')`,
    [timestamp, timestamp]);
  const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
  const dependentTables = [
    'wardrobe_items',
    'active_locations',
    'weather_snapshots',
    'weather_hourly_entries',
    'recommendation_snapshots',
    'weather_alert_deliveries',
  ];
  const dependentRowsBefore = Object.fromEntries(await Promise.all(dependentTables.map(async (table) => [
    table,
    (await database.getAllAsync(`SELECT * FROM ${table}`)).map((row) => ({ ...row })),
  ])));
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
    ...before, style_aesthetics: '[]', morning_sheet_enabled: 1, easier_to_see: 0, walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
  });
  const dependentRowsAfter = Object.fromEntries(await Promise.all(dependentTables.map(async (table) => [
    table,
    (await database.getAllAsync(`SELECT * FROM ${table}`)).map((row) => ({ ...row })),
  ])));
  assert.deepEqual(dependentRowsAfter, {
    ...dependentRowsBefore,
    wardrobe_items: dependentRowsBefore.wardrobe_items.map((row) => ({
      ...row, color_option_id: null, color_custom_hex: null, pending_sync: 0,
    })),
  });
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
  await database.runAsync(`INSERT INTO dressing_day_choices
    (id, local_profile_id, day_key, formality, source, created_at, updated_at)
    VALUES ('choice-1', 'stable-profile-id', '2026-09-24', 'casual', 'morning', ?, ?)`,
    [timestamp, timestamp]);
  assert.equal((await database.getFirstAsync('SELECT formality FROM dressing_day_choices')).formality, 'casual');
});

for (const [fixture, version] of [['build-14-schema-16.sql', 16], ['build-16-schema-22.sql', 22]]) {
  test(`${fixture} upgrades through 23 preserving rows in every existing table`, async (t) => {
    const database = new NodeSqliteDatabase();
    t.after(() => database.close());
    await database.execAsync(await readFile(new URL(`./${fixture}`, import.meta.url), 'utf8'));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, version);
    await insertProfile(database);
    await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
      onboarding_completed = 1`);
    await database.execAsync(`
      INSERT INTO wardrobe_items
        (id, local_profile_id, name, category, photo_relative_path, created_at, updated_at,
         entry_state, garment_type_id)
      VALUES
        ('owned-coat', 'stable-profile-id', 'Rain coat', 'outerwear',
         'kuyara/wardrobe/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
         '${timestamp}', '${timestamp}', 'owned', 'rain_jacket'),
        ('wanted-shoes', 'stable-profile-id', 'Shoes', 'footwear', NULL,
         '${timestamp}', '${timestamp}', 'wanted', 'sneakers'),
        ('legacy-top', 'stable-profile-id', 'Old top', 'top', NULL,
         '${timestamp}', '${timestamp}', 'owned', NULL);
      INSERT INTO active_locations
        (local_profile_id, location_key, source, manual_catalog_id, latitude_e2,
         longitude_e2, time_zone, device_accuracy, created_at, updated_at, display_name)
      VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul',
        4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul');
      INSERT INTO weather_snapshots
        (id, local_profile_id, location_key, time_zone, fetched_at, observed_at,
         origin_kind, source_id, temperature_c, apparent_temperature_c,
         minimum_temperature_c, maximum_temperature_c, condition_code,
         precipitation_probability, wind_speed_mps, humidity, uv_index, daily_json)
      VALUES ('weather', 'stable-profile-id', 'manual:sample.istanbul', 'Europe/Istanbul',
        '${timestamp}', '${timestamp}', 'sample', 'test', 20, 20, 19, 21, 'clear',
        0, 0, 0.5, 0, NULL);
      INSERT INTO weather_hourly_entries
        (snapshot_id, forecast_at, temperature_c, apparent_temperature_c, condition_code,
         precipitation_probability, wind_speed_mps, humidity, uv_index)
      VALUES ('weather', '${timestamp}', 20, 20, 'clear', 0, 0, 0.5, 0);
      INSERT INTO recommendation_snapshots
        (id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
         context_json, outfits_json, created_at, updated_at)
      VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample.istanbul',
        'deterministic-fallback', '{"fixture":true}', '[]', '${timestamp}', '${timestamp}');
      INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
      VALUES ('precipitation_onset:manual:sample.istanbul:2026-09-24',
        'stable-profile-id', '${timestamp}', '${timestamp}');
    `);
    const tables = ['local_profiles', 'wardrobe_items', 'active_locations',
      'weather_snapshots', 'weather_hourly_entries', 'recommendation_snapshots',
      'weather_alert_deliveries'];
    const before = Object.fromEntries(await Promise.all(tables.map(async (table) => [table,
      (await database.getAllAsync(`SELECT * FROM ${table}`)).map((row) => ({ ...row }))])));
    assert.ok(tables.every((table) => before[table].length > 0));
    await migrateDatabase(database);
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    for (const table of tables) {
      const after = (await database.getAllAsync(`SELECT * FROM ${table}`)).map((row) => ({ ...row }));
      assert.equal(after.length, before[table].length, `${table} row count`);
      for (let index = 0; index < after.length; index++) {
        for (const [column, value] of Object.entries(before[table][index])) {
          assert.deepEqual(after[index][column], value, `${table}.${column}`);
        }
      }
    }
    assert.equal((await database.getAllAsync('SELECT * FROM wardrobe_items'))
      .find((row) => row.id === 'legacy-top').garment_type_id, null);
    for (const table of ['outfit_history', 'dressing_day_choices', 'dressing_day_departures']) {
      assert.equal((await database.getFirstAsync(`SELECT COUNT(*) AS count FROM ${table}`)).count, 0);
    }
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
}

test('build 15 schema 19 upgrades to the schema produced by a fresh install', async (t) => {
  const shipped = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { shipped.close(); fresh.close(); });
  await shipped.execAsync(await readFile(new URL('./build-15-schema-19.sql', import.meta.url), 'utf8'));
  await insertProfile(shipped);
  await shipped.runAsync("UPDATE local_profiles SET display_name = 'Saved name'");
  await migrateDatabase(shipped);
  await migrateDatabase(fresh);

  const schema = async (database) => (await database.getAllAsync(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
  )).map((row) => ({ ...row }));
  assert.deepEqual(await schema(fresh), await schema(shipped));
  assert.equal((await shipped.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await shipped.getFirstAsync('SELECT display_name FROM local_profiles')).display_name, 'Saved name');
});

for (const fixture of ['build-14-schema-16.sql', 'build-15-schema-19.sql', 'build-16-schema-20.sql', 'build-16-schema-22.sql']) {
  test(`${fixture} preserves representative Closet rows through version 23`, async (t) => {
    const database = new NodeSqliteDatabase();
    t.after(() => database.close());
    await database.execAsync(await readFile(new URL(`./${fixture}`, import.meta.url), 'utf8'));
    await insertProfile(database);
    const families = ['black', 'white', 'gray', 'brown', 'beige', 'red', 'orange',
      'yellow', 'green', 'blue', 'purple', 'pink', 'multicolor'];
    for (const [index, family] of families.entries()) {
      await database.runAsync(`INSERT INTO wardrobe_items
        (id, local_profile_id, name, category, color, color_family, photo_relative_path,
         entry_state, garment_type_id, created_at, updated_at, deleted_at)
        VALUES (?, 'stable-profile-id', ?, 'top', ?, ?, ?, ?, ?, ?, ?, ?)`, [
        `item-${index}`, `Piece ${index}`, index === 0 ? 'Legacy free text' : null,
        family, index === 1 ? 'kuyara/wardrobe/photos/owned.jpg' : null,
        index % 2 === 0 ? 'owned' : 'wanted', index === 0 ? null : 't_shirt',
        timestamp, index === 2 ? deletedTimestamp : timestamp,
        index === 2 ? deletedTimestamp : null,
      ]);
    }
    const before = (await database.getAllAsync('SELECT * FROM wardrobe_items ORDER BY id'))
      .map((row) => ({ ...row }));
    await migrateDatabase(database);
    const after = (await database.getAllAsync('SELECT * FROM wardrobe_items ORDER BY id'))
      .map((row) => ({ ...row }));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    assert.equal(after.length, before.length);
    for (const [index, row] of after.entries()) {
      for (const [column, value] of Object.entries(before[index])) {
        assert.deepEqual(row[column], value, `${fixture} ${row.id}.${column}`);
      }
      assert.equal(row.color_option_id, null);
      assert.equal(row.color_custom_hex, null);
    }
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
    await assert.rejects(() => database.runAsync(
      "UPDATE wardrobe_items SET color_custom_hex = '#ABC' WHERE id = 'item-0'",
    ));
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.deepEqual((await database.getAllAsync('SELECT * FROM wardrobe_items ORDER BY id'))
      .map((row) => ({ ...row })), after);
  });
}

// O13, migration 21: the "Easier to see" switch. Each frozen schema a device can hold before
// build 16 (build 15 at version 19, and version 20) keeps its profile row unchanged and
// gains the switch off.
for (const [fixture, version] of [['build-15-schema-19.sql', 19], ['build-16-schema-20.sql', 20]]) {
  test(`${fixture} upgrades to version 21 with Easier to see off and the profile intact`, async (t) => {
    const database = new NodeSqliteDatabase();
    const fresh = new NodeSqliteDatabase();
    t.after(() => { database.close(); fresh.close(); });
    await database.execAsync(await readFile(new URL(`./${fixture}`, import.meta.url), 'utf8'));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, version);
    await insertProfile(database);
    await database.runAsync(`UPDATE local_profiles SET gender = 'man', dress_style = 'formal',
      display_name = 'Deniz', name_prompt_version = 1, onboarding_completed = 1,
      theme_preference = 'dark', language_preference = 'tr', morning_sheet_enabled = 0,
      style_aesthetics = '["classic"]'`);
    const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
    assert.equal('easier_to_see' in before, false);

    await migrateDatabase(database);
    await migrateDatabase(fresh);

    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
      ...before, easier_to_see: 0, walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    });
    const schema = async (db) => (await db.getAllAsync(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )).map((row) => ({ ...row }));
    assert.deepEqual(await schema(database), await schema(fresh));
    await database.runAsync('UPDATE local_profiles SET easier_to_see = 1');
    await assert.rejects(() => database.runAsync('UPDATE local_profiles SET easier_to_see = 2'));
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('SELECT easier_to_see FROM local_profiles')).easier_to_see, 1);
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
}

test('a failed version 21 migration rolls back and leaves version 20 intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-16-schema-20.sql', import.meta.url), 'utf8'));
  await insertProfile(database);
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('ADD COLUMN easier_to_see')) throw new Error('v21 failed');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /v21 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 20);
  assert.equal((await database.getAllAsync('PRAGMA table_info(local_profiles)'))
    .some(({ name }) => name === 'easier_to_see'), false);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await database.getFirstAsync('SELECT easier_to_see FROM local_profiles')).easier_to_see, 0);
});

// Phase 8, migration 22: the coach-mark tour's one-time gate (ADR 0036). The last released
// schema (build 15 at version 19) and the version 21 state that precedes the tour both keep
// the profile row and its dependent rows unchanged, gain the gate at 0, and end with the
// schema a fresh install produces.
for (const [fixture, version] of [['build-15-schema-19.sql', 19], ['build-16-schema-21.sql', 21]]) {
  test(`${fixture} upgrades through version 22 with the tour gate at 0 and the profile intact`, async (t) => {
    const database = new NodeSqliteDatabase();
    const fresh = new NodeSqliteDatabase();
    t.after(() => { database.close(); fresh.close(); });
    await database.execAsync(await readFile(new URL(`./${fixture}`, import.meta.url), 'utf8'));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, version);
    await insertProfile(database);
    await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
      display_name = 'Ada', name_prompt_version = 1, onboarding_completed = 1,
      analytics_consent = 'granted', theme_preference = 'dark', language_preference = 'tr',
      morning_sheet_enabled = 0, style_aesthetics = '["classic"]'`);
    if (version >= 21) await database.runAsync('UPDATE local_profiles SET easier_to_see = 1');
    await database.runAsync(`INSERT INTO wardrobe_items (id, local_profile_id, name, category,
      created_at, updated_at, garment_type_id, entry_state)
      VALUES ('piece', 'stable-profile-id', NULL, 'top', ?, ?, 'sweater', 'wanted')`, [timestamp, timestamp]);
    await database.runAsync(`INSERT INTO outfit_history (id, local_profile_id, day_key, outfit_json,
      worn_at, created_at, updated_at) VALUES ('worn', 'stable-profile-id', '2026-09-27', '{}', ?, ?, ?)`,
    [timestamp, timestamp, timestamp]);
    const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
    const dependents = async () => Promise.all(['wardrobe_items', 'outfit_history'].map(async (table) =>
      (await database.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)).map((row) => ({ ...row }))));
    const dependentsBefore = await dependents();
    assert.equal('walkthrough_version' in before, false);

    await migrateDatabase(database);
    await migrateDatabase(fresh);

    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
      ...before, ...(version < 21 ? { easier_to_see: 0 } : {}), walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    });
    assert.deepEqual(await dependents(), dependentsBefore.map((rows, index) => (index === 0
      ? rows.map((row) => ({ ...row, ...(version < 20 ? { color_option_id: null, color_custom_hex: null } : {}), pending_sync: 0 }))
      : rows.map((row) => ({ ...row, piece_colors_json: null, pending_sync: 0 })))));
    const schema = async (db) => (await db.getAllAsync(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )).map((row) => ({ ...row }));
    assert.deepEqual(await schema(database), await schema(fresh));
    const column = (await database.getAllAsync('PRAGMA table_info(local_profiles)'))
      .find(({ name }) => name === 'walkthrough_version');
    assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
      { type: 'INTEGER', notnull: 1, dflt_value: '0' });
    await database.runAsync('UPDATE local_profiles SET walkthrough_version = 1');
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('SELECT walkthrough_version FROM local_profiles'))
      .walkthrough_version, 1);
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
}

test('a fresh install creates the profile with the tour gate at 0', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await database.getFirstAsync('SELECT walkthrough_version FROM local_profiles'))
    .walkthrough_version, 0);
});

test('a failed version 22 migration rolls back and leaves version 21 intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-16-schema-21.sql', import.meta.url), 'utf8'));
  await insertProfile(database);
  await database.runAsync('UPDATE local_profiles SET easier_to_see = 1');
  const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('ADD COLUMN walkthrough_version')) throw new Error('v22 failed');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /Migration to version 22 failed: v22 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 21);
  assert.equal((await database.getAllAsync('PRAGMA table_info(local_profiles)'))
    .some(({ name }) => name === 'walkthrough_version'), false);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, before);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
    ...before, walkthrough_version: 0, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
  });
});

// Migration 23: the outfit detail's one-time swipe hint. The App Store schema (build 15 at
// version 19) and build 16's schema 22 both keep the profile row and its dependent rows
// unchanged, gain the flag unset, and end with the schema a fresh install produces.
for (const [fixture, version] of [['build-15-schema-19.sql', 19], ['build-16-schema-22.sql', 22]]) {
  test(`${fixture} upgrades to the latest version with the swipe hint unset and the profile intact`, async (t) => {
    const database = new NodeSqliteDatabase();
    const fresh = new NodeSqliteDatabase();
    t.after(() => { database.close(); fresh.close(); });
    await database.execAsync(await readFile(new URL(`./${fixture}`, import.meta.url), 'utf8'));
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, version);
    await insertProfile(database);
    await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
      display_name = 'Ada', name_prompt_version = 1, onboarding_completed = 1,
      analytics_consent = 'granted', theme_preference = 'dark', language_preference = 'tr',
      morning_sheet_enabled = 0, style_aesthetics = '["classic"]'`);
    if (version >= 22) {
      await database.runAsync('UPDATE local_profiles SET easier_to_see = 1, walkthrough_version = 1');
    }
    await database.runAsync(`INSERT INTO wardrobe_items (id, local_profile_id, name, category,
      created_at, updated_at, garment_type_id, entry_state)
      VALUES ('piece', 'stable-profile-id', NULL, 'top', ?, ?, 'sweater', 'wanted')`, [timestamp, timestamp]);
    await database.runAsync(`INSERT INTO outfit_history (id, local_profile_id, day_key, outfit_json,
      worn_at, created_at, updated_at) VALUES ('worn', 'stable-profile-id', '2026-09-27', '{}', ?, ?, ?)`,
    [timestamp, timestamp, timestamp]);
    const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
    const dependents = async () => Promise.all(['wardrobe_items', 'outfit_history'].map(async (table) =>
      (await database.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)).map((row) => ({ ...row }))));
    const dependentsBefore = await dependents();
    assert.equal('swap_hint_shown' in before, false);

    await migrateDatabase(database);
    await migrateDatabase(fresh);

    assert.equal(latestDatabaseVersion, 29);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
    assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
      ...before,
      ...(version < 22 ? { easier_to_see: 0, walkthrough_version: 0 } : {}),
      swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
    });
    assert.deepEqual(await dependents(), dependentsBefore.map((rows, index) => (index === 0
      ? rows.map((row) => ({ ...row, ...(version < 20 ? { color_option_id: null, color_custom_hex: null } : {}), pending_sync: 0 }))
      : rows.map((row) => ({ ...row, piece_colors_json: null, pending_sync: 0 })))));
    const schema = async (db) => (await db.getAllAsync(
      "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )).map((row) => ({ ...row }));
    assert.deepEqual(await schema(database), await schema(fresh));
    const column = (await database.getAllAsync('PRAGMA table_info(local_profiles)'))
      .find(({ name }) => name === 'swap_hint_shown');
    assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
      { type: 'INTEGER', notnull: 1, dflt_value: '0' });
    await assert.rejects(() => database.runAsync('UPDATE local_profiles SET swap_hint_shown = 2'));
    await database.runAsync('UPDATE local_profiles SET swap_hint_shown = 1');
    await migrateDatabase(new NodeSqliteDatabase(database.database));
    assert.equal((await database.getFirstAsync('SELECT swap_hint_shown FROM local_profiles'))
      .swap_hint_shown, 1);
    assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
    assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  });
}

test('a fresh install creates the profile with the swipe hint unset', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  assert.equal((await database.getFirstAsync('SELECT swap_hint_shown FROM local_profiles'))
    .swap_hint_shown, 0);
});

test('a failed version 23 migration rolls back and leaves version 22 intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-16-schema-22.sql', import.meta.url), 'utf8'));
  await insertProfile(database);
  await database.runAsync('UPDATE local_profiles SET walkthrough_version = 1');
  const before = { ...await database.getFirstAsync('SELECT * FROM local_profiles') };
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        if (sql.includes('ADD COLUMN swap_hint_shown')) throw new Error('v23 failed');
        await transaction.execAsync(sql);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /Migration to version 23 failed: v23 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 22);
  assert.equal((await database.getAllAsync('PRAGMA table_info(local_profiles)'))
    .some(({ name }) => name === 'swap_hint_shown'), false);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, before);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual({ ...await database.getFirstAsync('SELECT * FROM local_profiles') }, {
    ...before, swap_hint_shown: 0, pending_sync: 0, ...unitDefaults,
  });
});

// An older binary can meet a newer schema (a rollback, or a TestFlight build older than the
// one that migrated). The guard is the only thing that keeps the old code from reading and
// writing tables it does not understand.
test('a database from a newer application is refused untouched, every time', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  const newer = latestDatabaseVersion + 1;
  await database.execAsync(`PRAGMA user_version = ${newer}`);
  const profileBefore = await database.getFirstAsync('SELECT * FROM local_profiles');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      () => migrateDatabase(new NodeSqliteDatabase(database.database)),
      /newer than this application supports/,
    );
  }

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, newer);
  assert.deepEqual(await database.getFirstAsync('SELECT * FROM local_profiles'), profileBefore);
});

// Migration 24: a worn day keeps the swatch each piece was drawn in. Build 17 ships schema 23;
// a phone holding it, with rows in every table, upgrades with every row and value intact, its
// worn days reading as "no colour" (History draws them in the fixed scheme), and the schema
// it ends with is the one a fresh install creates.
const historyOutfit = (top) => JSON.stringify({
  garments: { primary_top: top, bottom: 'jeans', outer_layer: 'rain_jacket', footwear: 'sneakers', handheld: 'umbrella' },
  archetypeId: 'rain_ready', formality: 'casual', source: 'recommended',
});
const wornIds = ['3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b', '7d9e0f1a-2b3c-4d5e-8f6a-7b8c9d0e1f2a',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'];

async function fillBuildSeventeen(database) {
  await insertProfile(database);
  await database.runAsync(`UPDATE local_profiles SET gender = 'woman', dress_style = 'smart',
    display_name = 'Ada', name_prompt_version = 1, onboarding_completed = 1,
    analytics_consent = 'granted', theme_preference = 'dark', language_preference = 'tr',
    morning_sheet_enabled = 0, style_aesthetics = '["classic"]', easier_to_see = 1,
    walkthrough_version = 1, swap_hint_shown = 1`);
  await database.execAsync(`
    INSERT INTO wardrobe_items
      (id, local_profile_id, name, category, color_family, photo_relative_path, created_at,
       updated_at, deleted_at, entry_state, garment_type_id, color_option_id, color_custom_hex)
    VALUES
      ('owned-coat', 'stable-profile-id', 'Rain coat', 'outerwear', 'yellow',
       'kuyara/wardrobe/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
       '${timestamp}', '${timestamp}', NULL, 'owned', 'rain_jacket', 'rainyellow', NULL),
      ('custom-tee', 'stable-profile-id', NULL, 'top', 'red', NULL,
       '${timestamp}', '${timestamp}', NULL, 'owned', 't_shirt', NULL, '#AA3344'),
      ('deleted-jeans', 'stable-profile-id', NULL, 'bottom', 'blue', NULL,
       '${timestamp}', '${deletedTimestamp}', '${deletedTimestamp}', 'wanted', 'jeans', NULL, NULL),
      ('legacy-top', 'stable-profile-id', 'Old top', 'top', NULL, NULL,
       '${timestamp}', '${timestamp}', NULL, 'owned', NULL, NULL, NULL);
    INSERT INTO active_locations
      (local_profile_id, location_key, source, manual_catalog_id, latitude_e2,
       longitude_e2, time_zone, device_accuracy, created_at, updated_at, display_name)
    VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul',
      4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul');
    INSERT INTO weather_snapshots
      (id, local_profile_id, location_key, time_zone, fetched_at, observed_at,
       origin_kind, source_id, temperature_c, apparent_temperature_c,
       minimum_temperature_c, maximum_temperature_c, condition_code,
       precipitation_probability, wind_speed_mps, humidity, uv_index, daily_json)
    VALUES ('weather', 'stable-profile-id', 'manual:sample.istanbul', 'Europe/Istanbul',
      '${timestamp}', '${timestamp}', 'sample', 'test', 9.4, 7, 7.2, 9.6, 'rain',
      0.8, 5.5, 0.9, 1, '[{"date":"2026-07-31"}]');
    INSERT INTO weather_hourly_entries
      (snapshot_id, forecast_at, temperature_c, apparent_temperature_c, condition_code,
       precipitation_probability, wind_speed_mps, humidity, uv_index)
    VALUES ('weather', '${timestamp}', 9.4, 7, 'rain', 0.8, 5.5, 0.9, 1);
    INSERT INTO recommendation_snapshots
      (id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
       context_json, outfits_json, created_at, updated_at)
    VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample.istanbul',
      'on-device-ai', '{"fixture":true}', '[]', '${timestamp}', '${timestamp}');
    INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
    VALUES ('precipitation_onset:manual:sample.istanbul:2026-09-24',
      'stable-profile-id', '${timestamp}', '${timestamp}');
    INSERT INTO dressing_day_choices
      (id, local_profile_id, day_key, formality, source, created_at, updated_at, deleted_at, style_aesthetics)
    VALUES ('choice', 'stable-profile-id', '2026-09-30', 'smart', 'chip', '${timestamp}', '${timestamp}', NULL, '["classic"]');
    INSERT INTO dressing_day_departures
      (id, local_profile_id, day_key, departure_at, time_zone, created_at, updated_at, deleted_at)
    VALUES ('departure', 'stable-profile-id', '2026-09-30', '2026-09-30T06:30:00.000Z',
      'Europe/Istanbul', '${timestamp}', '${timestamp}', NULL);
    INSERT INTO outfit_history
      (id, local_profile_id, day_key, outfit_json, photo_path, worn_at, created_at, updated_at, deleted_at)
    VALUES
      ('${wornIds[0]}', 'stable-profile-id', '2026-09-30', '${historyOutfit('t_shirt')}',
       'kuyara/history/photos/${wornIds[0]}.jpg', '${timestamp}', '${timestamp}', '${timestamp}', NULL),
      ('${wornIds[1]}', 'stable-profile-id', '2026-09-29', '${historyOutfit('sweater')}',
       NULL, '${timestamp}', '${timestamp}', '${timestamp}', NULL),
      ('${wornIds[2]}', 'stable-profile-id', '2026-09-28', '${historyOutfit('shirt')}',
       NULL, '${timestamp}', '${timestamp}', '${deletedTimestamp}', '${deletedTimestamp}');
  `);
}

const userTables = async (database) => (await database.getAllAsync(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
)).map(({ name }) => name);
const tableRows = async (database) => Object.fromEntries(await Promise.all((await userTables(database))
  .map(async (table) => [table, (await database.getAllAsync(`SELECT * FROM "${table}" ORDER BY rowid`))
    .map((row) => ({ ...row }))])));
const withUnitDefaults = (rows) => ({
  ...rows, local_profiles: rows.local_profiles.map((row) => ({ ...row, ...unitDefaults })),
});
const sqliteSchema = async (database) => (await database.getAllAsync(
  "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
)).map((row) => ({ ...row }));

test('build-17-schema-23.sql upgrades with every row intact and worn days uncoloured', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 23);
  await fillBuildSeventeen(database);
  const before = await tableRows(database);
  assert.ok(Object.values(before).every((rows) => rows.length > 0), 'every build 17 table holds a row');

  await migrateDatabase(database);
  await migrateDatabase(fresh);

  assert.equal(latestDatabaseVersion, 29);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  const after = await tableRows(database);
  assert.deepEqual(Object.keys(after), [...Object.keys(before), 'device_account_link'].sort());
  assert.deepEqual(after.device_account_link, [{ singleton_key: 1, linked_user_id: null,
    last_linked_user_id: null, last_pull_cursor: null, sign_in_card_dismissed: 0, records_user_id: null,
    records_consent_recorded_at: null }]);
  for (const [table, rows] of Object.entries(before)) {
    assert.deepEqual(after[table], rows.map((row) => ({ ...row,
      ...(table === 'outfit_history' ? { piece_colors_json: null } : {}),
      ...(['local_profiles', 'wardrobe_items', 'dressing_day_choices',
        'dressing_day_departures', 'outfit_history'].includes(table) ? { pending_sync: 0 } : {}),
      ...(table === 'local_profiles' ? unitDefaults : {}),
    })), table);
  }
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  const column = (await database.getAllAsync('PRAGMA table_info(outfit_history)'))
    .find(({ name }) => name === 'piece_colors_json');
  assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
    { type: 'TEXT', notnull: 0, dflt_value: null });

  // The upgraded days read through the repository as they did, in the fixed scheme; a new
  // "Wore this today" stores its colours beside them.
  const { SqliteOutfitHistoryRepository } = await import('../../features/recommendation/data/sqlite-outfit-history-repository.ts');
  const repo = new SqliteOutfitHistoryRepository(database, () => '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    () => '2026-10-01T07:00:00.000Z', { resolveUri: () => null });
  const days = await repo.list('stable-profile-id');
  assert.deepEqual(days.map(({ dayKey, pieceColors }) => [dayKey, pieceColors]),
    [['2026-09-30', null], ['2026-09-29', null]]);
  assert.equal(days[0].photoPath, `kuyara/history/photos/${wornIds[0]}.jpg`);
  const colors = { primary_top: 'ecru', bottom: 'indigo', outer_layer: 'rainyellow', footwear: 'white', handheld: 'black' };
  const logged = await repo.log('stable-profile-id', '2026-10-01', JSON.parse(historyOutfit('t_shirt')), { kind: 'keep' }, colors);
  assert.deepEqual(logged.pieceColors, colors);

  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.equal((await database.getFirstAsync('SELECT COUNT(*) AS count FROM outfit_history')).count, 4);
  assert.deepEqual(await database.getAllAsync('PRAGMA foreign_key_check'), []);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
});

test('a failed version 24 migration rolls back and leaves the build 17 schema intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  await fillBuildSeventeen(database);
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        await transaction.execAsync(sql);
        if (sql.includes('ADD COLUMN piece_colors_json')) throw new Error('v24 failed');
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /Migration to version 24 failed: v24 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 23);
  assert.deepEqual(await sqliteSchema(database), schemaBefore);
  assert.deepEqual(await tableRows(database), before);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await database.getAllAsync('SELECT piece_colors_json FROM outfit_history'))
    .every(({ piece_colors_json: colors }) => colors === null), true);
});

test('a failed version 25 migration rolls back and leaves version 24 with its rows intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  await fillBuildSeventeen(database);
  const failing = {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        await transaction.execAsync(sql);
        if (sql.includes('CREATE TABLE device_account_link')) throw new Error('v25 failed');
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
  await assert.rejects(() => migrateDatabase(failing), /Migration to version 25 failed: v25 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 24);
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);
  assert.equal(before.wardrobe_items.length > 0, true);
  assert.equal(schemaBefore.some(({ name }) => name === 'device_account_link'), false);
  await assert.rejects(() => migrateDatabase(failing), /Migration to version 25 failed: v25 failed/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 24);
  assert.deepEqual(await sqliteSchema(database), schemaBefore);
  assert.deepEqual(await tableRows(database), before);
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.equal((await database.getFirstAsync('SELECT COUNT(*) AS n FROM device_account_link')).n, 1);
  assert.equal((await database.getFirstAsync(
    'SELECT COUNT(*) AS n FROM wardrobe_items WHERE pending_sync = 0')).n, before.wardrobe_items.length);
});

// Migration 26: a dressing day holds several worn looks. The table is rebuilt without the
// `(local_profile_id, day_key)` constraint; every version 25 row keeps every value.
function failingOn(database, marker, message) {
  return {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: async (sql) => {
        await transaction.execAsync(sql);
        if (sql.includes(marker)) throw new Error(message);
      },
      runAsync: transaction.runAsync.bind(transaction),
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: transaction.getAllAsync.bind(transaction),
    })),
  };
}

/** A filled build 17 database carried to version 25, with every kind of history value set. */
async function filledVersionTwentyFive(database) {
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  await fillBuildSeventeen(database);
  // The runner stops at 26 here (its whole script runs, then the failure rolls it back), so the
  // database is exactly what version 25 left.
  await assert.rejects(() => migrateDatabase(failingOn(database, 'outfit_history_v26', 'stop at 25')),
    /Migration to version 26 failed: stop at 25/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
  await database.runAsync(`UPDATE outfit_history SET piece_colors_json = ?, pending_sync = 1 WHERE id = ?`,
    ['{"primary_top":"navy","bottom":"indigo","footwear":"white"}', wornIds[0]]);
  // A row whose profile is gone, as foreign keys off once allowed: it rides through the rebuild.
  await database.execAsync('PRAGMA foreign_keys = OFF;');
  await database.runAsync(`INSERT INTO outfit_history
    (id, local_profile_id, day_key, outfit_json, worn_at, created_at, updated_at)
    VALUES ('4e5f6a7b-8c9d-4e0f-a1b2-c3d4e5f6a7b8', 'gone-profile', '2026-09-27', ?, ?, ?, ?)`,
  [historyOutfit('t_shirt'), timestamp, timestamp, timestamp]);
  await database.execAsync('PRAGMA foreign_keys = ON;');
}

test('version 26 keeps every version 25 row and value and lets a day hold several looks', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await filledVersionTwentyFive(database);
  const before = await tableRows(database);
  assert.equal(before.outfit_history.length, 4);
  const orphansBefore = (await database.getAllAsync('PRAGMA foreign_key_check')).map((row) => ({ ...row }));
  assert.equal(orphansBefore.length, 1);

  await migrateDatabase(database);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  await migrateDatabase(fresh);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  assert.deepEqual((await database.getAllAsync('PRAGMA foreign_key_check')).map((row) => ({ ...row })), orphansBefore);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');

  // A second look for a day that already holds one is a second row.
  await database.runAsync(`INSERT INTO outfit_history
    (id, local_profile_id, day_key, outfit_json, worn_at, created_at, updated_at)
    VALUES ('5f6a7b8c-9d0e-4f1a-b2c3-d4e5f6a7b8c9', 'stable-profile-id', '2026-09-30', ?, ?, ?, ?)`,
  [historyOutfit('sweater'), deletedTimestamp, deletedTimestamp, deletedTimestamp]);
  assert.equal((await database.getFirstAsync(
    "SELECT COUNT(*) AS n FROM outfit_history WHERE day_key = '2026-09-30'")).n, 2);
});

test('a fresh version 26 schema keeps the history checks, foreign key and index without the day constraint', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  const { sql } = await database.getFirstAsync("SELECT sql FROM sqlite_master WHERE name = 'outfit_history'");
  assert.doesNotMatch(sql, /UNIQUE/);
  assert.deepEqual((await database.getAllAsync('PRAGMA table_info(outfit_history)')).map(({ name }) => name),
    ['id', 'local_profile_id', 'day_key', 'outfit_json', 'photo_path', 'worn_at', 'created_at',
      'updated_at', 'deleted_at', 'piece_colors_json', 'pending_sync']);
  assert.deepEqual((await database.getAllAsync('PRAGMA index_list(outfit_history)'))
    .map(({ name, unique }) => [name, unique]).sort(),
  [['idx_outfit_history_profile_live_day', 0], ['sqlite_autoindex_outfit_history_1', 1]]);
  assert.deepEqual((await database.getAllAsync('PRAGMA index_xinfo(idx_outfit_history_profile_live_day)'))
    .filter(({ key }) => key === 1).map(({ name, desc }) => [name, desc]),
  [['local_profile_id', 0], ['deleted_at', 0], ['day_key', 1]]);
  const insert = (id, profile, day, pending = 0) => database.runAsync(`INSERT INTO outfit_history
    (id, local_profile_id, day_key, outfit_json, worn_at, created_at, updated_at, pending_sync)
    VALUES (?, ?, ?, '{}', ?, ?, ?, ?)`, [id, profile, day, timestamp, timestamp, timestamp, pending]);
  await insert('a', 'stable-profile-id', '2026-10-03');
  await insert('b', 'stable-profile-id', '2026-10-03', 1);
  await assert.rejects(() => insert('a', 'stable-profile-id', '2026-10-04'), /UNIQUE constraint/);
  await assert.rejects(() => insert('c', 'stable-profile-id', '3 Oct'), /CHECK constraint/);
  await assert.rejects(() => insert('d', 'stable-profile-id', '2026-10-03', 2), /CHECK constraint/);
  await assert.rejects(() => insert('e', 'unknown-profile', '2026-10-03'), /FOREIGN KEY constraint/);
});

test('a failed version 26 migration rolls back the rebuild and leaves version 25 with its rows intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await filledVersionTwentyFive(database);
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);
  // The failure lands after the old table was dropped and the new one renamed into place.
  const failing = failingOn(database, 'DROP TABLE outfit_history', 'v26 failed');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => migrateDatabase(failing), /Migration to version 26 failed: v26 failed/);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
    assert.deepEqual(await sqliteSchema(database), schemaBefore);
    assert.deepEqual(await tableRows(database), before);
  }
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
});

// Build 18 ships schema 25. A phone holding it, with rows in every table (history with photo
// paths, wardrobe, profile, account link), upgrades to the current version with every row and
// value intact, ends with the schema a fresh install creates, and a second run changes nothing.
async function fillBuildEighteen(
  database, schema = 'build-18-schema-25.sql', laterProfileColumns = '',
) {
  await database.execAsync(await readFile(new URL(`./${schema}`, import.meta.url), 'utf8'));
  await insertProfile(database);
  await database.runAsync(`UPDATE local_profiles SET gender = 'man', dress_style = 'casual',
    display_name = 'Can', name_prompt_version = 1, onboarding_completed = 1,
    analytics_consent = 'granted', theme_preference = 'light', language_preference = 'en',
    style_aesthetics = '["classic"]', walkthrough_version = 1, swap_hint_shown = 1, pending_sync = 1${laterProfileColumns}`);
  await database.execAsync(`
    INSERT INTO wardrobe_items
      (id, local_profile_id, name, category, color_family, photo_relative_path, created_at,
       updated_at, deleted_at, entry_state, garment_type_id, color_option_id, color_custom_hex,
       pending_sync)
    VALUES
      ('owned-coat', 'stable-profile-id', 'Rain coat', 'outerwear', 'yellow',
       'kuyara/wardrobe/photos/550e8400-e29b-41d4-a716-446655440000.jpg',
       '${timestamp}', '${timestamp}', NULL, 'owned', 'rain_jacket', 'rainyellow', NULL, 1),
      ('custom-tee', 'stable-profile-id', NULL, 'top', 'red', NULL,
       '${timestamp}', '${timestamp}', NULL, 'owned', 't_shirt', NULL, '#AA3344', 0),
      ('deleted-jeans', 'stable-profile-id', NULL, 'bottom', 'blue', NULL,
       '${timestamp}', '${deletedTimestamp}', '${deletedTimestamp}', 'wanted', 'jeans', NULL, NULL, 1);
    INSERT INTO active_locations
      (local_profile_id, location_key, source, manual_catalog_id, latitude_e2,
       longitude_e2, time_zone, device_accuracy, created_at, updated_at, display_name)
    VALUES ('stable-profile-id', 'manual:sample.istanbul', 'manual', 'sample.istanbul',
      4101, 2898, 'Europe/Istanbul', NULL, '${timestamp}', '${timestamp}', 'Istanbul');
    INSERT INTO weather_snapshots
      (id, local_profile_id, location_key, time_zone, fetched_at, observed_at,
       origin_kind, source_id, temperature_c, apparent_temperature_c,
       minimum_temperature_c, maximum_temperature_c, condition_code,
       precipitation_probability, wind_speed_mps, humidity, uv_index, daily_json)
    VALUES ('weather', 'stable-profile-id', 'manual:sample.istanbul', 'Europe/Istanbul',
      '${timestamp}', '${timestamp}', 'sample', 'test', 9.4, 7, 7.2, 9.6, 'rain',
      0.8, 5.5, 0.9, 1, '[{"date":"2026-07-31"}]');
    INSERT INTO weather_hourly_entries
      (snapshot_id, forecast_at, temperature_c, apparent_temperature_c, condition_code,
       precipitation_probability, wind_speed_mps, humidity, uv_index)
    VALUES ('weather', '${timestamp}', 9.4, 7, 'rain', 0.8, 5.5, 0.9, 1);
    INSERT INTO recommendation_snapshots
      (id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
       context_json, outfits_json, created_at, updated_at)
    VALUES ('recommendation', 'stable-profile-id', 'weather', 'manual:sample.istanbul',
      'on-device-ai', '{"fixture":true}', '[]', '${timestamp}', '${timestamp}');
    INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
    VALUES ('precipitation_onset:manual:sample.istanbul:2026-10-02',
      'stable-profile-id', '${timestamp}', '${timestamp}');
    INSERT INTO dressing_day_choices
      (id, local_profile_id, day_key, formality, source, created_at, updated_at, deleted_at,
       style_aesthetics, pending_sync)
    VALUES ('choice', 'stable-profile-id', '2026-10-02', 'casual', 'chip', '${timestamp}',
      '${timestamp}', NULL, '["classic"]', 1);
    INSERT INTO dressing_day_departures
      (id, local_profile_id, day_key, departure_at, time_zone, created_at, updated_at, deleted_at)
    VALUES ('departure', 'stable-profile-id', '2026-10-02', '2026-10-02T06:30:00.000Z',
      'Europe/Istanbul', '${timestamp}', '${timestamp}', NULL);
    INSERT INTO outfit_history
      (id, local_profile_id, day_key, outfit_json, photo_path, worn_at, created_at, updated_at,
       deleted_at, piece_colors_json, pending_sync)
    VALUES
      ('${wornIds[0]}', 'stable-profile-id', '2026-10-02', '${historyOutfit('t_shirt')}',
       'kuyara/history/photos/${wornIds[0]}.jpg', '${timestamp}', '${timestamp}', '${timestamp}',
       NULL, '{"primary_top":"navy","bottom":"indigo","footwear":"white"}', 1),
      ('${wornIds[1]}', 'stable-profile-id', '2026-10-01', '${historyOutfit('sweater')}',
       NULL, '${timestamp}', '${timestamp}', '${timestamp}', NULL, NULL, 0),
      ('${wornIds[2]}', 'stable-profile-id', '2026-09-30', '${historyOutfit('shirt')}',
       NULL, '${timestamp}', '${timestamp}', '${deletedTimestamp}', '${deletedTimestamp}', NULL, 0);
    INSERT INTO device_account_link
      (singleton_key, linked_user_id, last_linked_user_id, last_pull_cursor, sign_in_card_dismissed)
    VALUES (1, '9b2f6c1e-0d3a-4b8e-a7c4-5e1f2a3b4c5d', '9b2f6c1e-0d3a-4b8e-a7c4-5e1f2a3b4c5d',
      '2026-10-02T09:00:00.000Z', 1);
  `);
}

test('build-18-schema-25.sql upgrades with every row intact and matches a fresh install', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await fillBuildEighteen(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 25);
  const before = await tableRows(database);
  assert.equal(Object.keys(before).length, 11);
  assert.ok(Object.values(before).every((rows) => rows.length > 0), 'every build 18 table holds a row');

  await migrateDatabase(database);
  await migrateDatabase(fresh);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  assert.equal((await database.getAllAsync('PRAGMA foreign_key_check')).length, 0);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');

  // Re-entry through a second caller runs the chain again and changes nothing.
  const upgradedSchema = await sqliteSchema(database);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
  assert.deepEqual(await sqliteSchema(database), upgradedSchema);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
});

// Build 19 ships schema 27, the first build to carry the unit choices. A phone holding it, with
// rows in every table and the units its owner picked, upgrades to the current version with every
// row and value intact, including the pending flags and the unit choices, and ends with the
// schema a fresh install creates.
test('build-19-schema-27.sql upgrades with every row intact and matches a fresh install', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await fillBuildEighteen(database, 'build-19-schema-27.sql',
    ", easier_to_see = 1, temperature_unit = 'fahrenheit', wind_speed_unit = 'mph'");
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 27);
  const before = await tableRows(database);
  assert.equal(Object.keys(before).length, 11);
  assert.ok(Object.values(before).every((rows) => rows.length > 0), 'every build 19 table holds a row');
  assert.equal(before.local_profiles[0].temperature_unit, 'fahrenheit');
  assert.ok(Object.values(before).flat().some((row) => row.pending_sync === 1));

  await migrateDatabase(database);
  await migrateDatabase(fresh);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  // Version 28 adds only the two NULL link columns: the units, the pending flags and every
  // other value stay exactly as the phone stored them.
  assert.deepEqual(await tableRows(database), withRecordsUserId(before));
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  assert.equal((await database.getAllAsync('PRAGMA foreign_key_check')).length, 0);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');

  const upgradedSchema = await sqliteSchema(database);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.deepEqual(await tableRows(database), withRecordsUserId(before));
  assert.deepEqual(await sqliteSchema(database), upgradedSchema);
});

// Migration 27: the temperature and wind unit choices, device-only profile columns that start at
// System, so every upgraded phone reads exactly the units it read before.
async function filledVersionTwentySix(database) {
  await filledVersionTwentyFive(database);
  await assert.rejects(() => migrateDatabase(failingOn(database, 'temperature_unit', 'stop at 26')),
    /Migration to version 27 failed: stop at 26/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 26);
  await database.runAsync(`UPDATE local_profiles SET theme_preference = 'dark', language_preference = 'tr',
    easier_to_see = 1, pending_sync = 1`);
}

test('version 27 keeps every version 26 row and value and starts both units at System', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await filledVersionTwentySix(database);
  const before = await tableRows(database);
  assert.ok(Object.values(before).every((rows) => rows.length > 0), 'every version 26 table holds a row');
  const orphansBefore = (await database.getAllAsync('PRAGMA foreign_key_check')).length;

  // Migration 28 follows 27, so stop the chain right after 27 to read exactly version 27.
  await assert.rejects(() => migrateDatabase(failingOn(database, 'records_user_id', 'stop at 27')),
    /Migration to version 28 failed: stop at 27/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 27);
  assert.deepEqual(await tableRows(database), withUnitDefaults(before));

  await migrateDatabase(database);
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  await migrateDatabase(fresh);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  assert.equal((await database.getAllAsync('PRAGMA foreign_key_check')).length, orphansBefore);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
  const columns = (await database.getAllAsync('PRAGMA table_info(local_profiles)'))
    .filter(({ name }) => name.endsWith('_unit'))
    .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));
  assert.deepEqual(columns, [
    { name: 'temperature_unit', type: 'TEXT', notnull: 1, dflt_value: "'system'" },
    { name: 'wind_speed_unit', type: 'TEXT', notnull: 1, dflt_value: "'system'" },
  ]);
});

test('version 27 stores only the closed unit values', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await insertProfile(database);
  assert.deepEqual({ ...await database.getFirstAsync(
    'SELECT temperature_unit, wind_speed_unit FROM local_profiles') }, unitDefaults);
  for (const value of ['system', 'celsius', 'fahrenheit']) {
    await database.runAsync('UPDATE local_profiles SET temperature_unit = ?', [value]);
  }
  for (const value of ['system', 'kmh', 'mph']) {
    await database.runAsync('UPDATE local_profiles SET wind_speed_unit = ?', [value]);
  }
  for (const value of ['kelvin', 'kmh', 'Celsius', '', null]) {
    await assert.rejects(() => database.runAsync('UPDATE local_profiles SET temperature_unit = ?', [value]),
      /constraint failed/, String(value));
  }
  for (const value of ['celsius', 'km/h', 'MPH', 'mps', '', null]) {
    await assert.rejects(() => database.runAsync('UPDATE local_profiles SET wind_speed_unit = ?', [value]),
      /constraint failed/, String(value));
  }
});

test('a failed version 27 migration rolls back and leaves version 26 with its rows intact', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await filledVersionTwentySix(database);
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);
  const failing = failingOn(database, 'wind_speed_unit', 'v27 failed');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => migrateDatabase(failing), /Migration to version 27 failed: v27 failed/);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 26);
    assert.deepEqual(await sqliteSchema(database), schemaBefore);
    assert.deepEqual(await tableRows(database), before);
  }
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(withUnitDefaults(before)));
});

// Released migrations are never edited. Each hash is a sha256 prefix of the version's source with
// whitespace collapsed and whole-line comments dropped; to add the next version, append its line
// (run the same normalisation over its block) and leave the earlier ones alone.
const releasedMigrationHashes = {
  1: 'bfc300a3d913a052',
  2: '6f4d8af79a428d5a',
  3: '34f05d02b87c6221',
  4: '6f96def4b2879c02',
  5: '2489cd9cc38b13ba',
  6: '1f69dabe77240401',
  7: '293941bfa88aea53',
  8: 'fccbe8fef805276d',
  9: '6b6e0b617493d8f4',
  10: '2c05b2f90b704206',
  11: 'f7a37cdd96367662',
  12: '1e3a7ad377e1ba59',
  13: 'a7d37d8c5d0bc665',
  14: '8416e0cedca700d9',
  15: '1facfd37c8c72bcb',
  16: 'ce98e206673a0385',
  17: 'c303abb18b693490',
  18: '0c59e330a7152ea0',
  19: 'd41d66fd595ed7fd',
  20: '5b67ef2103c29cfc',
  21: '406e263d0f419bde',
  22: 'e6b3615060fb0317',
  23: '58a4ccba3107e333',
  24: '3c9930adb70b2bd7',
  25: '076827bf1bc6faed',
  26: '91802149fcd4f7c3',
  27: '516b4d6f4eddaeb4',
  28: '9c0af0743970463f',
  29: '48511f831aebe085',
};

test('the hash lock freezes every migration through 29, and later versions may be appended', async () => {
  const source = await readFile(new URL('./migrations.ts', import.meta.url), 'utf8');
  const blocks = Array.from(source.matchAll(/^const migrationV(\d+): Migration = \{\n[\s\S]*?^\};$/gm));
  const hashes = Object.fromEntries(blocks.map(([block, version]) => [version, createHash('sha256')
    .update(block.replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)]));
  assert.deepEqual(blocks.map(([, version]) => Number(version)),
    Array.from({ length: latestDatabaseVersion }, (_, index) => index + 1));
  for (const [version, hash] of Object.entries(releasedMigrationHashes)) {
    assert.equal(hashes[version], hash, `migration ${version} was edited after release`);
  }
});

/** Version 28 adds the link's records account and its consent record arrival, NULL on every existing link. */
function withRecordsUserId(rows) {
  return { ...rows, device_account_link: rows.device_account_link.map((row) => ({
    ...row, records_user_id: null, records_consent_recorded_at: null,
  })) };
}

test('version 28 keeps a used device account link and adds the records account and its consent arrival as NULL', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await database.execAsync(await readFile(new URL('./build-17-schema-23.sql', import.meta.url), 'utf8'));
  await fillBuildSeventeen(database);
  await assert.rejects(() => migrateDatabase(failingOn(database, 'records_user_id', 'stop at 27')),
    /Migration to version 28 failed: stop at 27/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 27);
  await database.runAsync(`UPDATE device_account_link SET linked_user_id = 'user-a',
    last_linked_user_id = 'user-a', last_pull_cursor = '2026-10-01T00:00:00.000000Z', sign_in_card_dismissed = 1`);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);

  // A failure rolls the column back, twice in a row, and the next run adds it.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => migrateDatabase(failingOn(database, 'records_user_id', 'v28 failed')),
      /Migration to version 28 failed: v28 failed/);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 27);
    assert.deepEqual(await sqliteSchema(database), schemaBefore);
    assert.deepEqual(await tableRows(database), before);
  }
  await migrateDatabase(database);
  await migrateDatabase(fresh);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  assert.deepEqual(await tableRows(database), withRecordsUserId(before));
  assert.deepEqual(before.device_account_link.map(({ linked_user_id: linked }) => linked), ['user-a']);
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  for (const name of ['records_user_id', 'records_consent_recorded_at']) {
    const column = (await database.getAllAsync('PRAGMA table_info(device_account_link)'))
      .find((info) => info.name === name);
    assert.deepEqual({ type: column.type, notnull: column.notnull, dflt_value: column.dflt_value },
      { type: 'TEXT', notnull: 0, dflt_value: null }, name);
  }
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
});

// Migration 29: Closet names over 200 UTF-16 units, which builds before the form's limit stored,
// are shortened on the phone so the account's 800-byte name bound never drops an upload batch.
// Only live rows' names move; every other column and every row stays.
const emojiFamily = '\u{1f468}\u{200d}\u{1f469}\u{200d}\u{1f467}';
// These literal results freeze with the release of migration 29: a different rule needs a new migration.
const longClosetNames = [
  // [id, name, expected name after migration, deleted_at, pending_sync]
  ['long-ascii', 'x'.repeat(250), 'x'.repeat(200), null, 0],
  ['long-pair', `${'p'.repeat(199)}\u{1f600}${'tail'.repeat(10)}`, 'p'.repeat(199), null, 1],
  ['long-zwj', `${'z'.repeat(198)}${emojiFamily}${'tail'.repeat(10)}`, 'z'.repeat(198), null, 0],
  ['long-combining', `${'c'.repeat(199)}e\u{301}${'tail'.repeat(10)}`, 'c'.repeat(199), null, 1],
  ['long-flag', `${'f'.repeat(198)}\u{1f1f9}\u{1f1f7}${'tail'.repeat(10)}`, 'f'.repeat(198), null, 0],
  ['long-spaces', `${'s'.repeat(190)}${' '.repeat(30)}${'tail'.repeat(10)}`, 's'.repeat(190), null, 0],
  // 150 code points but 300 UTF-16 units: SQLite's own length() would not see it as long.
  ['long-emoji', '\u{1f600}'.repeat(150), '\u{1f600}'.repeat(100), null, 0],
  ['exact-200', 'e'.repeat(200), 'e'.repeat(200), null, 1],
  // 200 units but 400 UTF-8 bytes: the byte query selects it and the rule leaves it as it is.
  ['accent-200', '\u{e9}'.repeat(200), '\u{e9}'.repeat(200), null, 0],
  ['short-name', 'Rain coat', 'Rain coat', null, 0],
  ['null-name', null, null, null, 0],
  // A deleted row uploads as a marker without its name and keeps whatever it held.
  ['long-deleted', 'd'.repeat(300), 'd'.repeat(300), deletedTimestamp, 1],
];

async function addLongClosetNames(database) {
  for (const [id, name, , deletedAt, pending] of longClosetNames) {
    await database.runAsync(`INSERT INTO wardrobe_items
      (id, local_profile_id, name, category, color_family, photo_relative_path, created_at, updated_at,
       deleted_at, entry_state, garment_type_id, color_option_id, color_custom_hex, pending_sync)
      VALUES (?, 'stable-profile-id', ?, 'top', 'red', NULL, ?, ?, ?, 'owned', 't_shirt', NULL, '#AA3344', ?)`,
    [id, name, timestamp, timestamp, deletedAt, pending]);
  }
}

/** The rows with the one thing migration 29 changes, the live long names, replaced by their expectation. */
function withShortenedClosetNames(rows) {
  const expected = new Map(longClosetNames.map(([id, , name]) => [id, name]));
  return { ...rows, wardrobe_items: rows.wardrobe_items.map((row) => (
    expected.has(row.id) ? { ...row, name: expected.get(row.id) } : row)) };
}

/** Runs the chain until migration 29, which fails (before any change when `afterUpdates` is 0, else right after that many name updates). */
function failingInVersion29(database, message, afterUpdates = 0) {
  let updates = 0;
  return {
    execAsync: database.execAsync.bind(database),
    getFirstAsync: database.getFirstAsync.bind(database),
    withExclusiveTransactionAsync: (task) => database.withExclusiveTransactionAsync((transaction) => task({
      execAsync: transaction.execAsync.bind(transaction),
      runAsync: async (sql, params) => {
        const result = await transaction.runAsync(sql, params);
        if (sql.startsWith('UPDATE wardrobe_items SET name')) {
          updates += 1;
          if (afterUpdates > 0 && updates >= afterUpdates) throw new Error(message);
        }
        return result;
      },
      getFirstAsync: transaction.getFirstAsync.bind(transaction),
      getAllAsync: async (sql, params) => {
        if (afterUpdates === 0 && sql.includes('FROM wardrobe_items WHERE deleted_at IS NULL')) throw new Error(message);
        return transaction.getAllAsync(sql, params);
      },
    })),
  };
}

function assertShortenedClosetNames(rows) {
  const byId = new Map(rows.wardrobe_items.map((row) => [row.id, row]));
  assert.equal(rows.wardrobe_items.length >= longClosetNames.length, true);
  for (const [id, , expected, deletedAt] of longClosetNames) {
    const { name } = byId.get(id);
    assert.equal(name, expected, id);
    if (deletedAt === null && name !== null) {
      // The domain takes it as it is, and the form's own limit (UTF-16 units) holds it.
      assert.equal(normalizeOptionalWardrobeText(name), name, id);
      assert.ok(name.length <= WARDROBE_NAME_MAX_LENGTH, id);
      assert.ok(name.isWellFormed(), id);
    }
  }
}

test('version 29 shortens live Closet names over 200 units from the frozen build 19 schema 27 and changes nothing else', async (t) => {
  const database = new NodeSqliteDatabase();
  const fresh = new NodeSqliteDatabase();
  t.after(() => { database.close(); fresh.close(); });
  await fillBuildEighteen(database, 'build-19-schema-27.sql',
    ", easier_to_see = 1, temperature_unit = 'fahrenheit', wind_speed_unit = 'mph'");
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 27);
  await addLongClosetNames(database);
  const before = await tableRows(database);
  assert.ok(before.wardrobe_items.some(({ name }) => name !== null && name.length > WARDROBE_NAME_MAX_LENGTH));
  // The byte query selects the accented 200-unit name; the rule must leave it byte for byte.
  assert.equal((await database.getFirstAsync("SELECT COUNT(*) AS n FROM wardrobe_items WHERE id = 'accent-200' AND length(CAST(name AS BLOB)) > 200")).n, 1);
  const orphansBefore = (await database.getAllAsync('PRAGMA foreign_key_check')).length;

  await migrateDatabase(database);
  await migrateDatabase(fresh);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, latestDatabaseVersion);
  const after = await tableRows(database);
  // Every row survives; the long names are shortened, and every other column of every row,
  // the pending flags and the deleted row included, is exactly what the phone stored.
  assert.deepEqual(after, withShortenedClosetNames(withRecordsUserId(before)));
  assertShortenedClosetNames(after);
  assert.deepEqual(await sqliteSchema(database), await sqliteSchema(fresh));
  assert.equal((await database.getAllAsync('PRAGMA foreign_key_check')).length, orphansBefore);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');

  // Re-entry through a second caller changes nothing.
  await migrateDatabase(new NodeSqliteDatabase(database.database));
  assert.deepEqual(await tableRows(database), after);
});

test('version 29 upgrades a version 28 database the same way', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await fillBuildEighteen(database, 'build-19-schema-27.sql');
  await assert.rejects(() => migrateDatabase(failingInVersion29(database, 'stop at 28')),
    /Migration to version 29 failed: stop at 28/);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 28);
  await addLongClosetNames(database);
  const before = await tableRows(database);

  await migrateDatabase(database);

  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 29);
  const after = await tableRows(database);
  assert.deepEqual(after, withShortenedClosetNames(before));
  assertShortenedClosetNames(after);
  assert.equal((await database.getFirstAsync('PRAGMA integrity_check')).integrity_check, 'ok');
});

test('a failed version 29 migration rolls back and leaves version 28 with every row and name untouched', async (t) => {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await fillBuildEighteen(database, 'build-19-schema-27.sql');
  await assert.rejects(() => migrateDatabase(failingInVersion29(database, 'stop at 28')),
    /Migration to version 29 failed: stop at 28/);
  await addLongClosetNames(database);
  const before = await tableRows(database);
  const schemaBefore = await sqliteSchema(database);

  // The failure comes after the second name was already rewritten inside the transaction.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => migrateDatabase(failingInVersion29(database, 'v29 failed', 2)),
      /Migration to version 29 failed: v29 failed/);
    assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 28);
    assert.deepEqual(await sqliteSchema(database), schemaBefore);
    assert.deepEqual(await tableRows(database), before);
  }
  await migrateDatabase(database);
  assert.equal((await database.getFirstAsync('PRAGMA user_version')).user_version, 29);
  assert.deepEqual(await tableRows(database), withShortenedClosetNames(before));
});
