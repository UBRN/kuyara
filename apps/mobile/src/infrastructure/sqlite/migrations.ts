import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type UserVersionRow = Readonly<{ user_version: number }>;

type Migration = Readonly<{
  version: number;
  migrate: (database: SqliteExecutor) => Promise<void>;
}>;

export const latestDatabaseVersion = 1;

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

const migrations = [migrationV1] as const satisfies readonly Migration[];

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
