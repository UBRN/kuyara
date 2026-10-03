import { SqliteWeatherLocalDataSource } from '@/features/weather/data/sqlite-weather-local-data-source';
import { LocalWeatherRepository } from '@/features/weather/data/weather-repository';
import { openMigratedDatabase } from '@/infrastructure/sqlite/open-migrated-database';
import { newUuid } from '@/infrastructure/new-uuid';
import { systemNow } from '@/infrastructure/system-clock';

/**
 * The one place the weather repository is opened and migrated. It is a plain function so the
 * foreground provider and the headless background task share it without React.
 */
export async function loadWeatherRepository() {
  const database = await openMigratedDatabase();
  return new LocalWeatherRepository(new SqliteWeatherLocalDataSource(database), {
    createId: newUuid,
    now: systemNow,
  });
}
