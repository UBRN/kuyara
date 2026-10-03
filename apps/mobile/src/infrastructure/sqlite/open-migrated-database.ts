import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';

export type DatabaseOpenStage = 'database-open' | 'migration';

/**
 * The one gate to the device database: the shared connection, migrated to the latest version.
 * Every repository loader and the background task open it here, so none can read a database
 * the migrations have not reached. A caller that must tell the two failures apart maps them
 * with `onFailure`; without it the original error passes through.
 */
export async function openMigratedDatabase(
  onFailure: (stage: DatabaseOpenStage, cause: unknown) => unknown = (_stage, cause) => cause,
): Promise<SqliteDatabase> {
  let database: SqliteDatabase;
  try {
    database = await openKuyaraDatabase();
  } catch (error) {
    throw onFailure('database-open', error);
  }

  try {
    await migrateDatabase(database);
  } catch (error) {
    throw onFailure('migration', error);
  }

  return database;
}
