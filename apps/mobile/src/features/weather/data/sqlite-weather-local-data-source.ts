import {
  WeatherDataSourceError,
  type WeatherLocalDataSource,
} from '@/features/weather/data/weather-local-data-source';
import type {
  ActiveLocationRecord,
  HourlyWeatherRecord,
  WeatherSnapshotRecord,
} from '@/features/weather/data/weather-records';
import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type ActiveLocationRow = Readonly<{
  local_profile_id: string;
  location_key: string;
  source: string;
  manual_catalog_id: string | null;
  latitude_e2: number;
  longitude_e2: number;
  time_zone: string;
  device_accuracy: string | null;
  created_at: string;
  updated_at: string;
}>;

type SnapshotRow = Readonly<{
  id: string;
  local_profile_id: string;
  location_key: string;
  time_zone: string;
  fetched_at: string;
  observed_at: string;
  origin_kind: string;
  source_id: string;
  temperature_c: number;
  apparent_temperature_c: number;
  minimum_temperature_c: number;
  maximum_temperature_c: number;
  condition_code: string;
  precipitation_probability: number;
  wind_speed_mps: number;
  humidity: number;
  uv_index: number;
}>;

type HourlyRow = Readonly<{
  forecast_at: string;
  temperature_c: number;
  apparent_temperature_c: number;
  condition_code: string;
  precipitation_probability: number;
  wind_speed_mps: number;
  humidity: number;
  uv_index: number;
}>;

function mapLocation(row: ActiveLocationRow): ActiveLocationRecord {
  return {
    localProfileId: row.local_profile_id,
    locationKey: row.location_key,
    source: row.source,
    manualCatalogId: row.manual_catalog_id,
    latitudeE2: row.latitude_e2,
    longitudeE2: row.longitude_e2,
    timeZone: row.time_zone,
    deviceAccuracy: row.device_accuracy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHourly(row: HourlyRow): HourlyWeatherRecord {
  return {
    forecastAt: row.forecast_at,
    temperatureCelsius: row.temperature_c,
    apparentTemperatureCelsius: row.apparent_temperature_c,
    condition: row.condition_code,
    precipitationProbability: row.precipitation_probability,
    windSpeedMetersPerSecond: row.wind_speed_mps,
    humidity: row.humidity,
    uvIndex: row.uv_index,
  };
}

async function readLocation(
  database: SqliteExecutor,
  localProfileId: string,
): Promise<ActiveLocationRecord | null> {
  const row = await database.getFirstAsync<ActiveLocationRow>(
    `SELECT * FROM active_locations WHERE local_profile_id = ?`,
    [localProfileId],
  );
  return row ? mapLocation(row) : null;
}

async function readSnapshot(
  database: SqliteExecutor,
  localProfileId: string,
  locationKey: string,
): Promise<WeatherSnapshotRecord | null> {
  const row = await database.getFirstAsync<SnapshotRow>(
    `SELECT * FROM weather_snapshots WHERE local_profile_id = ? AND location_key = ?`,
    [localProfileId, locationKey],
  );
  if (!row) {
    return null;
  }
  const hourly = await database.getAllAsync<HourlyRow>(
    `SELECT forecast_at, temperature_c, apparent_temperature_c, condition_code,
      precipitation_probability, wind_speed_mps, humidity, uv_index
     FROM weather_hourly_entries WHERE snapshot_id = ? ORDER BY forecast_at ASC`,
    [row.id],
  );
  return {
    id: row.id,
    localProfileId: row.local_profile_id,
    locationKey: row.location_key,
    timeZone: row.time_zone,
    fetchedAt: row.fetched_at,
    observedAt: row.observed_at,
    originKind: row.origin_kind,
    sourceId: row.source_id,
    temperatureCelsius: row.temperature_c,
    apparentTemperatureCelsius: row.apparent_temperature_c,
    minimumTemperatureCelsius: row.minimum_temperature_c,
    maximumTemperatureCelsius: row.maximum_temperature_c,
    condition: row.condition_code,
    precipitationProbability: row.precipitation_probability,
    windSpeedMetersPerSecond: row.wind_speed_mps,
    humidity: row.humidity,
    uvIndex: row.uv_index,
    hourly: hourly.map(mapHourly),
  };
}

export class SqliteWeatherLocalDataSource implements WeatherLocalDataSource {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  getActiveLocation(localProfileId: string): Promise<ActiveLocationRecord | null> {
    return readLocation(this.database, localProfileId);
  }

  async setActiveLocation(record: ActiveLocationRecord): Promise<ActiveLocationRecord> {
    let result: ActiveLocationRecord | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO active_locations (
          local_profile_id, location_key, source, manual_catalog_id, latitude_e2,
          longitude_e2, time_zone, device_accuracy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(local_profile_id) DO UPDATE SET
          location_key = excluded.location_key,
          source = excluded.source,
          manual_catalog_id = excluded.manual_catalog_id,
          latitude_e2 = excluded.latitude_e2,
          longitude_e2 = excluded.longitude_e2,
          time_zone = excluded.time_zone,
          device_accuracy = excluded.device_accuracy,
          updated_at = excluded.updated_at`,
        [
          record.localProfileId, record.locationKey, record.source,
          record.manualCatalogId, record.latitudeE2, record.longitudeE2,
          record.timeZone, record.deviceAccuracy, record.createdAt, record.updatedAt,
        ],
      );
      result = await readLocation(transaction, record.localProfileId);
    });
    if (!result) throw new WeatherDataSourceError();
    return result;
  }

  getSnapshot(localProfileId: string, locationKey: string): Promise<WeatherSnapshotRecord | null> {
    return readSnapshot(this.database, localProfileId, locationKey);
  }

  async replaceSnapshot(record: WeatherSnapshotRecord): Promise<WeatherSnapshotRecord> {
    let result: WeatherSnapshotRecord | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `DELETE FROM weather_snapshots WHERE local_profile_id = ? AND location_key = ?`,
        [record.localProfileId, record.locationKey],
      );
      await transaction.runAsync(
        `INSERT INTO weather_snapshots (
          id, local_profile_id, location_key, time_zone, fetched_at, observed_at,
          origin_kind, source_id, temperature_c, apparent_temperature_c,
          minimum_temperature_c, maximum_temperature_c, condition_code,
          precipitation_probability, wind_speed_mps, humidity, uv_index
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.id, record.localProfileId, record.locationKey, record.timeZone,
          record.fetchedAt, record.observedAt, record.originKind, record.sourceId,
          record.temperatureCelsius, record.apparentTemperatureCelsius,
          record.minimumTemperatureCelsius, record.maximumTemperatureCelsius,
          record.condition, record.precipitationProbability,
          record.windSpeedMetersPerSecond, record.humidity, record.uvIndex,
        ],
      );
      for (const hourly of record.hourly) {
        await transaction.runAsync(
          `INSERT INTO weather_hourly_entries (
            snapshot_id, forecast_at, temperature_c, apparent_temperature_c,
            condition_code, precipitation_probability, wind_speed_mps, humidity, uv_index
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id, hourly.forecastAt, hourly.temperatureCelsius,
            hourly.apparentTemperatureCelsius, hourly.condition,
            hourly.precipitationProbability, hourly.windSpeedMetersPerSecond,
            hourly.humidity, hourly.uvIndex,
          ],
        );
      }
      await transaction.runAsync(
        `DELETE FROM weather_snapshots
         WHERE local_profile_id = ? AND id NOT IN (
           SELECT snapshot.id FROM weather_snapshots AS snapshot
           LEFT JOIN active_locations AS active
             ON active.local_profile_id = snapshot.local_profile_id
           WHERE snapshot.local_profile_id = ?
           ORDER BY CASE WHEN snapshot.location_key = active.location_key THEN 0 ELSE 1 END,
             snapshot.fetched_at DESC, snapshot.id ASC
           LIMIT 2
         )`,
        [record.localProfileId, record.localProfileId],
      );
      result = await readSnapshot(transaction, record.localProfileId, record.locationKey);
    });
    if (!result) throw new WeatherDataSourceError();
    return result;
  }
}
