import type { WeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/weather-alert-delivery-local-data-source';
import type { WeatherAlertDeliveryRecord } from '@/features/notifications/data/weather-alert-delivery-record';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';

type WeatherAlertDeliveryRow = Readonly<{
  id: string;
  local_profile_id: string;
  fire_at: string;
  created_at: string;
}>;

function mapRow(row: WeatherAlertDeliveryRow): WeatherAlertDeliveryRecord {
  return {
    id: row.id,
    localProfileId: row.local_profile_id,
    fireAt: row.fire_at,
    createdAt: row.created_at,
  };
}

export class SqliteWeatherAlertDeliveryLocalDataSource
implements WeatherAlertDeliveryLocalDataSource {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async upsertScheduled(records: readonly WeatherAlertDeliveryRecord[]): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      for (const record of records) {
        await transaction.runAsync(
          `INSERT INTO weather_alert_deliveries (id, local_profile_id, fire_at, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             local_profile_id = excluded.local_profile_id,
             fire_at = excluded.fire_at`,
          [record.id, record.localProfileId, record.fireAt, record.createdAt],
        );
      }
    });
  }

  async listFired(
    localProfileId: string,
    now: string,
  ): Promise<readonly WeatherAlertDeliveryRecord[]> {
    const rows = await this.database.getAllAsync<WeatherAlertDeliveryRow>(
      `SELECT id, local_profile_id, fire_at, created_at
       FROM weather_alert_deliveries
       WHERE local_profile_id = ? AND fire_at <= ?
       ORDER BY id ASC`,
      [localProfileId, now],
    );
    return rows.map(mapRow);
  }

  async deletePending(localProfileId: string, now: string): Promise<void> {
    await this.database.runAsync(
      `DELETE FROM weather_alert_deliveries
       WHERE local_profile_id = ? AND fire_at > ?`,
      [localProfileId, now],
    );
  }

  async pruneBefore(localProfileId: string, isoDate: string): Promise<void> {
    await this.database.runAsync(
      `DELETE FROM weather_alert_deliveries
       WHERE local_profile_id = ? AND fire_at < ?`,
      [localProfileId, isoDate],
    );
  }
}
