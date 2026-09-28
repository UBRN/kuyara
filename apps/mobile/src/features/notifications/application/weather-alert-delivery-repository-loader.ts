import { SqliteWeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/sqlite-weather-alert-delivery-local-data-source';
import { LocalWeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

/**
 * The one place the weather alert delivery repository is opened and migrated. It is a plain
 * function so the foreground provider and the headless background task share it without React.
 */
export async function loadWeatherAlertDeliveryRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherAlertDeliveryRepository(
    new SqliteWeatherAlertDeliveryLocalDataSource(database),
  );
}
