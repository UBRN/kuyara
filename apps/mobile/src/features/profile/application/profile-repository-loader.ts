import * as Crypto from 'expo-crypto';

import { ProfileBootstrapError } from '@/features/profile/application/profile-application-controller';
import { LocalProfileRepository } from '@/features/profile/data/profile-repository';
import { SqliteProfileLocalDataSource } from '@/features/profile/data/sqlite-profile-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

/**
 * The one place the profile repository is opened and migrated. It is a plain function so the
 * foreground provider and the headless background task share it without React.
 */
export async function loadProfileRepository() {
  let database;
  try {
    database = await openKuyaraDatabase();
  } catch (error) {
    throw new ProfileBootstrapError('database-open', error);
  }

  try {
    await migrateDatabase(database);
  } catch (error) {
    throw new ProfileBootstrapError('migration', error);
  }

  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => Crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });

  return new LocalProfileRepository(dataSource);
}
