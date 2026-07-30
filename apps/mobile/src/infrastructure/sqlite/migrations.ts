import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type UserVersionRow = Readonly<{ user_version: number }>;

type Migration = Readonly<{
  version: number;
  migrate: (database: SqliteExecutor) => Promise<void>;
}>;

export const latestDatabaseVersion = 3;

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

const migrations = [
  migrationV1,
  migrationV2,
  migrationV3,
] as const satisfies readonly Migration[];

async function readUserVersion(database: SqliteExecutor): Promise<number> {
  const row = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version');

  if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
    throw new Error('The SQLite schema version is invalid.');
  }

  return row.user_version;
}

export async function migrateDatabase(database: SqliteDatabase): Promise<void> {
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
  }
}
