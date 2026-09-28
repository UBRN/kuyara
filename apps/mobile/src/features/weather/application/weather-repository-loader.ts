import * as Crypto from 'expo-crypto';

import { SqliteWeatherLocalDataSource } from '@/features/weather/data/sqlite-weather-local-data-source';
import { LocalWeatherRepository } from '@/features/weather/data/weather-repository';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

/**
 * The one place the weather repository is opened and migrated. It is a plain function so the
 * foreground provider and the headless background task share it without React.
 */
export async function loadWeatherRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherRepository(new SqliteWeatherLocalDataSource(database), {
    createId: () => Crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
}
