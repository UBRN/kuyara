import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type UserVersionRow = Readonly<{ user_version: number }>;

type Migration = Readonly<{
  version: number;
  migrate: (database: SqliteExecutor) => Promise<void>;
}>;

export const latestDatabaseVersion = 13;

// Foreign keys are enforced on every connection: `migrateDatabase` turns them on for the
// shared connection below, and the transaction wrapper in `expo-sqlite-database.ts` turns
// them on for each transaction connection before `BEGIN IMMEDIATE`. Every RESTRICT and
// CASCADE declared here therefore fires for migrations and for application writes.
//
// Red lines for future migrations:
// - A table rebuild must copy the v8/v13 recipe: `PRAGMA defer_foreign_keys = ON` before the
//   copy, a `foreign_key_check` scoped to the rebuilt table, and `PRAGMA defer_foreign_keys =
//   OFF` after that check when the rebuilt table is a parent. `DROP TABLE` of a parent runs
//   an implicit DELETE that, under enforcement, bumps the deferred violation counter; the
//   rename that follows makes the rows consistent again but the counter stays, so COMMIT
//   fails unless the OFF pragma resets it. The pragma documentation cautions that this reset
//   also lets a real violation commit, which is why the scoped check comes first
//   (https://www.sqlite.org/pragma.html#pragma_defer_foreign_keys). Without the ON pragma a
//   copied orphan fails at its INSERT and a dropped parent fails at DROP, and a released
//   migration cannot be edited.
// - Never add `INSERT OR REPLACE`, a DELETE on `local_profiles`, or a new DELETE on
//   `weather_snapshots` without re-reading the FK graph: under enforcement REPLACE deletes the
//   conflicting row first, which RESTRICT refuses for a profile with child rows and which
//   cascades the hourly rows away for a snapshot. The weather data source's existing snapshot
//   deletes are safe because they remove the hourly rows first.

const migrationV1: Migration = {
  version: 1,
  async migrate(database) {
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
    `);
  },
};

const migrationV2: Migration = {
  version: 2,
  async migrate(database) {
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
    `);

    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_wardrobe_items_profile_deleted_updated
      ON wardrobe_items (local_profile_id, deleted_at, updated_at DESC);
    `);
  },
};

const migrationV3: Migration = {
  version: 3,
  async migrate(database) {
    await database.execAsync(`
      ALTER TABLE wardrobe_items ADD COLUMN garment_type_id TEXT;
      ALTER TABLE wardrobe_items ADD COLUMN color_family TEXT CHECK (
        color_family IS NULL OR color_family IN (
          'black', 'white', 'gray', 'brown', 'beige', 'red', 'orange',
          'yellow', 'green', 'blue', 'purple', 'pink', 'multicolor'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN thermal_level_override TEXT CHECK (
        thermal_level_override IS NULL OR thermal_level_override IN (
          'none', 'light', 'moderate', 'high'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN water_protection_override TEXT CHECK (
        water_protection_override IS NULL OR water_protection_override IN (
          'none', 'water_resistant', 'waterproof'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN wind_protection_override TEXT CHECK (
        wind_protection_override IS NULL OR wind_protection_override IN (
          'none', 'wind_resistant'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN breathability_override TEXT CHECK (
        breathability_override IS NULL OR breathability_override IN (
          'low', 'moderate', 'high'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN arm_coverage_override TEXT CHECK (
        arm_coverage_override IS NULL OR arm_coverage_override IN (
          'none', 'partial', 'full'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN leg_coverage_override TEXT CHECK (
        leg_coverage_override IS NULL OR leg_coverage_override IN (
          'none', 'partial', 'full'
        )
      );
      ALTER TABLE wardrobe_items ADD COLUMN traction_suitability_override TEXT CHECK (
        traction_suitability_override IS NULL OR traction_suitability_override IN (
          'everyday', 'enhanced'
        )
      );
    `);
  },
};

const migrationV4: Migration = {
  version: 4,
  async migrate(database) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS active_locations (
        local_profile_id TEXT PRIMARY KEY NOT NULL,
        location_key TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('manual', 'device')),
        manual_catalog_id TEXT,
        latitude_e2 INTEGER NOT NULL CHECK (latitude_e2 BETWEEN -9000 AND 9000),
        longitude_e2 INTEGER NOT NULL CHECK (longitude_e2 BETWEEN -18000 AND 18000),
        time_zone TEXT NOT NULL,
        device_accuracy TEXT CHECK (
          device_accuracy IS NULL OR device_accuracy IN ('approximate', 'full')
        ),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (source = 'manual' AND manual_catalog_id IS NOT NULL AND device_accuracy IS NULL)
          OR
          (source = 'device' AND manual_catalog_id IS NULL AND device_accuracy IS NOT NULL)
        ),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );
    `);

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS weather_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        origin_kind TEXT NOT NULL CHECK (origin_kind IN ('sample', 'live')),
        source_id TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        apparent_temperature_c REAL NOT NULL,
        minimum_temperature_c REAL NOT NULL,
        maximum_temperature_c REAL NOT NULL,
        condition_code TEXT NOT NULL CHECK (condition_code IN (
          'clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle',
          'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm'
        )),
        precipitation_probability REAL NOT NULL CHECK (
          precipitation_probability BETWEEN 0 AND 1
        ),
        wind_speed_mps REAL NOT NULL CHECK (wind_speed_mps >= 0),
        humidity REAL NOT NULL CHECK (humidity BETWEEN 0 AND 1),
        uv_index REAL NOT NULL CHECK (uv_index >= 0),
        UNIQUE (local_profile_id, location_key),
        CHECK (minimum_temperature_c <= maximum_temperature_c),
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );
    `);

    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS weather_hourly_entries (
        snapshot_id TEXT NOT NULL,
        forecast_at TEXT NOT NULL,
        temperature_c REAL NOT NULL,
        apparent_temperature_c REAL NOT NULL,
        condition_code TEXT NOT NULL CHECK (condition_code IN (
          'clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle',
          'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm'
        )),
        precipitation_probability REAL NOT NULL CHECK (
          precipitation_probability BETWEEN 0 AND 1
        ),
        wind_speed_mps REAL NOT NULL CHECK (wind_speed_mps >= 0),
        humidity REAL NOT NULL CHECK (humidity BETWEEN 0 AND 1),
        uv_index REAL NOT NULL CHECK (uv_index >= 0),
        PRIMARY KEY (snapshot_id, forecast_at),
        FOREIGN KEY (snapshot_id) REFERENCES weather_snapshots(id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE
      );
    `);

    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_weather_snapshots_profile_fetched
      ON weather_snapshots (local_profile_id, fetched_at DESC);
    `);
  },
};

const migrationV5: Migration = {
  version: 5,
  async migrate(database) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS recommendation_snapshots (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL UNIQUE,
        weather_snapshot_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        generation_mode TEXT NOT NULL CHECK (
          generation_mode IN ('ai-assisted', 'deterministic-fallback')
        ),
        context_json TEXT NOT NULL,
        outfits_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );
    `);
  },
};

const migrationV6: Migration = {
  version: 6,
  async migrate(database) {
    await database.execAsync(`
      ALTER TABLE local_profiles
        ADD COLUMN notifications_opt_in INTEGER NOT NULL DEFAULT 0
          CHECK (notifications_opt_in IN (0, 1));
    `);
  },
};

const migrationV7: Migration = {
  version: 7,
  async migrate(database) {
    await database.execAsync(`
      ALTER TABLE wardrobe_items
        ADD COLUMN entry_state TEXT NOT NULL DEFAULT 'owned'
          CHECK (entry_state IN ('owned', 'wanted'));
    `);
  },
};

const migrationV8: Migration = {
  version: 8,
  async migrate(database) {
    // Defer: `DROP TABLE local_profiles` below runs an implicit DELETE that RESTRICT would
    // refuse at once while child rows exist; deferred, it only bumps the violation counter.
    await database.execAsync('PRAGMA defer_foreign_keys = ON;');
    await database.execAsync(`
      CREATE TABLE local_profiles_v8 (
        singleton_key INTEGER PRIMARY KEY NOT NULL CHECK (singleton_key = 1),
        id TEXT NOT NULL UNIQUE,
        gender TEXT CHECK (gender IS NULL OR gender IN ('woman', 'man')),
        language_preference TEXT NOT NULL CHECK (language_preference IN ('system', 'tr', 'en')),
        theme_preference TEXT NOT NULL CHECK (theme_preference IN ('system', 'light', 'dark')),
        onboarding_completed INTEGER NOT NULL CHECK (onboarding_completed IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        notifications_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (notifications_opt_in IN (0, 1)),
        birth_date TEXT CHECK (
          birth_date IS NULL OR (
            birth_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND CAST(substr(birth_date, 1, 4) AS INTEGER) BETWEEN 1900 AND 2100
          )
        )
      );
      INSERT INTO local_profiles_v8 (
        singleton_key, id, gender, language_preference, theme_preference,
        onboarding_completed, created_at, updated_at, deleted_at, notifications_opt_in
      ) SELECT singleton_key, id,
        CASE clothing_preference WHEN 'womens' THEN 'woman' WHEN 'mens' THEN 'man' END,
        language_preference, theme_preference, onboarding_completed,
        created_at, updated_at, deleted_at, notifications_opt_in
      FROM local_profiles;
      DROP TABLE local_profiles;
      ALTER TABLE local_profiles_v8 RENAME TO local_profiles;
    `);
    // Only references to the rebuilt table are this migration's concern. Orphans under other
    // parents (hourly rows whose snapshot was deleted while the cascade was off, builds 2 and 3)
    // must not block it.
    const violations = await database.getAllAsync<{ parent: string }>('PRAGMA foreign_key_check');
    if (violations.some((violation) => violation.parent === 'local_profiles')) {
      throw new Error('The profile migration violated foreign keys.');
    }
    // The rebuilt table has been checked; reset the counter the dropped table's implicit DELETE
    // bumped, or COMMIT fails. This reset must follow the check (see the note above).
    await database.execAsync('PRAGMA defer_foreign_keys = OFF;');
  },
};

const migrationV9: Migration = {
  version: 9,
  async migrate(database) {
    await database.execAsync(`
      ALTER TABLE active_locations ADD COLUMN display_name TEXT CHECK (
        display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 200
      );
      UPDATE active_locations SET display_name = CASE manual_catalog_id
        WHEN 'sample.istanbul' THEN 'Istanbul'
        WHEN 'sample.ankara' THEN 'Ankara'
        WHEN 'sample.london' THEN 'London'
      END WHERE source = 'manual';
    `);
  },
};

const migrationV10: Migration = {
  version: 10,
  async migrate(database) {
    await database.execAsync(`
      ALTER TABLE local_profiles
        ADD COLUMN dress_style TEXT CHECK (
          dress_style IS NULL OR dress_style IN ('casual', 'smart', 'formal')
        );
      UPDATE local_profiles
      SET onboarding_completed = 0;
    `);
  },
};

const migrationV11: Migration = {
  version: 11,
  async migrate(database) {
    await database.execAsync(`
      CREATE TABLE weather_alert_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL,
        fire_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );
      CREATE INDEX idx_weather_alert_deliveries_profile_fire_at
      ON weather_alert_deliveries (local_profile_id, fire_at);
    `);
  },
};

const migrationV12: Migration = {
  version: 12,
  async migrate(database) {
    // ADR 0033 section 3: the consent answer is durable profile state, and every existing
    // install starts unanswered so the sheet is shown once before the first event.
    await database.execAsync(`
      ALTER TABLE local_profiles
        ADD COLUMN analytics_consent TEXT NOT NULL DEFAULT 'undecided' CHECK (
          analytics_consent IN ('undecided', 'granted', 'withdrawn')
        );
    `);
  },
};

const migrationV13: Migration = {
  version: 13,
  async migrate(database) {
    // ADR 0034 section 3: the third coarse generation mode. A CHECK constraint cannot be
    // altered, so the table is rebuilt and every existing row is copied; no released
    // migration is edited and there is no destructive fallback.
    // Deferred for the copy, and nothing is inspected afterwards: the rows go verbatim into
    // an identical constraint, so the only thing a check could find is an orphan that
    // already existed on the device, and throwing on it would leave the app unable to start
    // (TestFlight build 3). An orphan survives the rebuild exactly as it survived the
    // original table: copying it bumps the deferred counter, the implicit DELETE of the old
    // table lowers it again, and COMMIT sees zero. No parent is dropped here, so no reset is
    // needed; SQLite clears the deferral at the end of the transaction.
    await database.execAsync('PRAGMA defer_foreign_keys = ON;');
    await database.execAsync(`
      CREATE TABLE recommendation_snapshots_v13 (
        id TEXT PRIMARY KEY NOT NULL,
        local_profile_id TEXT NOT NULL UNIQUE,
        weather_snapshot_id TEXT NOT NULL,
        location_key TEXT NOT NULL,
        generation_mode TEXT NOT NULL CHECK (
          generation_mode IN ('on-device-ai', 'ai-assisted', 'deterministic-fallback')
        ),
        context_json TEXT NOT NULL,
        outfits_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (local_profile_id) REFERENCES local_profiles(id)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
      );
      INSERT INTO recommendation_snapshots_v13 (
        id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
        context_json, outfits_json, created_at, updated_at
      ) SELECT id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
        context_json, outfits_json, created_at, updated_at
      FROM recommendation_snapshots;
      DROP TABLE recommendation_snapshots;
      ALTER TABLE recommendation_snapshots_v13 RENAME TO recommendation_snapshots;
    `);
  },
};

const migrations = [
  migrationV1,
  migrationV2,
  migrationV3,
  migrationV4,
  migrationV5,
  migrationV6,
  migrationV7,
  migrationV8,
  migrationV9,
  migrationV10,
  migrationV11,
  migrationV12,
  migrationV13,
] as const satisfies readonly Migration[];

async function readUserVersion(database: SqliteExecutor): Promise<number> {
  const row = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version');

  if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
    throw new Error('The SQLite schema version is invalid.');
  }

  return row.user_version;
}

const migrationRuns = new WeakMap<SqliteDatabase, Promise<void>>();

/**
 * One migration run per database handle. Six composition roots call this on the one
 * connection `openKuyaraDatabase` memoizes; without the memo they all read
 * `user_version = 0` on a clean install and race the same migration, each on its own
 * transaction connection. On the device that was a deferred `BEGIN` with `busy_timeout` 0
 * (`BEGIN EXCLUSIVE` was only the test double), so the loser failed on its first write with
 * SQLITE_BUSY and surfaced it as a bootstrap error; the in-transaction version re-check kept
 * the result correct, not the error. This memo is the fix. The wrapper now also issues
 * `BEGIN IMMEDIATE` behind a busy timeout, so any remaining contention waits instead.
 *
 * A failed run is not cached: the entry is dropped so the next caller retries.
 */
export function migrateDatabase(database: SqliteDatabase): Promise<void> {
  const started = migrationRuns.get(database);

  if (started) {
    return started;
  }

  const run = runMigrations(database).catch((error: unknown) => {
    migrationRuns.delete(database);
    throw error;
  });
  migrationRuns.set(database, run);

  return run;
}

async function runMigrations(database: SqliteDatabase): Promise<void> {
  await database.execAsync('PRAGMA journal_mode = WAL;');
  await database.execAsync('PRAGMA foreign_keys = ON;');

  const initialVersion = await readUserVersion(database);

  if (initialVersion > latestDatabaseVersion) {
    throw new Error('The SQLite schema is newer than this application supports.');
  }

  for (const migration of migrations) {
    if (migration.version <= initialVersion) {
      continue;
    }

    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const currentVersion = await readUserVersion(transaction);

        if (currentVersion >= migration.version) {
          return;
        }

        if (currentVersion !== migration.version - 1) {
          throw new Error('SQLite migrations must run in order.');
        }

        await migration.migrate(transaction);
        await transaction.execAsync(`PRAGMA user_version = ${migration.version};`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Migration to version ${migration.version} failed: ${message}`,
        { cause: error },
      );
    }
  }
}
