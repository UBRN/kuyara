import type { WeatherLocalDataSource } from '@/features/weather/data/weather-local-data-source';
import type {
  ActiveLocationRecord,
  HourlyWeatherRecord,
  WeatherSnapshotRecord,
} from '@/features/weather/data/weather-records';
import type { ProvidedWeatherSnapshot } from '@/features/weather/data/weather-provider';
import {
  deviceLocationKey,
  isValidTimeZone,
  isWeatherConditionCode,
  manualLocationKey,
  type ActiveLocation,
  type HourlyWeather,
  type ManualLocationId,
  type WeatherMeasurements,
  type WeatherSnapshot,
  WeatherValidationError,
} from '@/features/weather/domain/weather';

type RepositoryDependencies = Readonly<{ createId: () => string; now: () => string }>;

export interface WeatherRepository {
  getActiveLocation(localProfileId: string): Promise<ActiveLocation | null>;
  setActiveLocation(localProfileId: string, location: ActiveLocation): Promise<ActiveLocation>;
  getSnapshot(localProfileId: string, locationKey: string): Promise<WeatherSnapshot | null>;
  saveSnapshot(localProfileId: string, snapshot: ProvidedWeatherSnapshot): Promise<WeatherSnapshot>;
}

export class WeatherRepositoryError extends Error {
  readonly code: 'invalid-input' | 'invalid-data' | 'unavailable';
  constructor(code: 'invalid-input' | 'invalid-data' | 'unavailable') {
    super('The local weather operation could not be completed.');
    this.name = 'WeatherRepositoryError';
    this.code = code;
  }
}

class WeatherMappingError extends Error {}

function isUtcIso(value: string): boolean {
  const parsed = Date.parse(value);
  return typeof value === 'string' && Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function localDateKey(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function requireMeasurements(value: WeatherMeasurements): WeatherMeasurements {
  if (
    !Number.isFinite(value.temperatureCelsius) ||
    !Number.isFinite(value.apparentTemperatureCelsius) ||
    !isWeatherConditionCode(value.condition) ||
    !Number.isFinite(value.precipitationProbability) ||
    value.precipitationProbability < 0 || value.precipitationProbability > 1 ||
    !Number.isFinite(value.windSpeedMetersPerSecond) || value.windSpeedMetersPerSecond < 0 ||
    !Number.isFinite(value.humidity) || value.humidity < 0 || value.humidity > 1 ||
    !Number.isFinite(value.uvIndex) || value.uvIndex < 0
  ) throw new WeatherValidationError();
  return value;
}

function mapLocation(record: ActiveLocationRecord): ActiveLocation {
  if (
    !record.localProfileId || !record.locationKey ||
    !Number.isInteger(record.latitudeE2) || record.latitudeE2 < -9000 || record.latitudeE2 > 9000 ||
    !Number.isInteger(record.longitudeE2) || record.longitudeE2 < -18000 || record.longitudeE2 > 18000 ||
    !isValidTimeZone(record.timeZone) || !isUtcIso(record.createdAt) || !isUtcIso(record.updatedAt)
  ) throw new WeatherMappingError();

  const common = {
    locationKey: record.locationKey,
    coordinates: { latitudeE2: record.latitudeE2, longitudeE2: record.longitudeE2 },
    timeZone: record.timeZone,
  };
  if (record.source === 'manual' && record.manualCatalogId && record.deviceAccuracy === null) {
    if (!['sample.istanbul', 'sample.ankara', 'sample.london'].includes(record.manualCatalogId)) {
      throw new WeatherMappingError();
    }
    const catalogId = record.manualCatalogId as ManualLocationId;
    if (record.locationKey !== manualLocationKey(catalogId)) throw new WeatherMappingError();
    return { ...common, source: 'manual', catalogId };
  }
  if (
    record.source === 'device' && record.manualCatalogId === null &&
    (record.deviceAccuracy === 'approximate' || record.deviceAccuracy === 'full')
  ) {
    if (record.locationKey !== deviceLocationKey(common.coordinates)) throw new WeatherMappingError();
    return { ...common, source: 'device', accuracy: record.deviceAccuracy };
  }
  throw new WeatherMappingError();
}

function mapHourly(record: HourlyWeatherRecord): HourlyWeather {
  const value = requireMeasurements({ ...record, condition: record.condition as HourlyWeather['condition'] });
  if (!isUtcIso(record.forecastAt)) throw new WeatherMappingError();
  return { ...value, forecastAt: record.forecastAt };
}

function mapSnapshot(record: WeatherSnapshotRecord): WeatherSnapshot {
  try {
    const current = requireMeasurements({ ...record, condition: record.condition as WeatherSnapshot['current']['condition'] });
    if (
      !isUuidV4(record.id) || !record.localProfileId || !record.locationKey ||
      !isValidTimeZone(record.timeZone) || !isUtcIso(record.fetchedAt) || !isUtcIso(record.observedAt) ||
      (record.originKind !== 'sample' && record.originKind !== 'live') || !record.sourceId.trim() ||
      !Number.isFinite(record.minimumTemperatureCelsius) ||
      !Number.isFinite(record.maximumTemperatureCelsius) ||
      record.minimumTemperatureCelsius > record.maximumTemperatureCelsius ||
      current.temperatureCelsius < record.minimumTemperatureCelsius ||
      current.temperatureCelsius > record.maximumTemperatureCelsius ||
      record.hourly.length === 0
    ) throw new WeatherMappingError();
    const hourly = record.hourly.map(mapHourly);
    const currentLocalDate = localDateKey(record.observedAt, record.timeZone);
    for (let index = 1; index < hourly.length; index += 1) {
      if (hourly[index - 1].forecastAt >= hourly[index].forecastAt) throw new WeatherMappingError();
    }
    if (hourly.some((hour) => localDateKey(hour.forecastAt, record.timeZone) !== currentLocalDate)) {
      throw new WeatherMappingError();
    }
    return {
      id: record.id,
      localProfileId: record.localProfileId,
      locationKey: record.locationKey,
      timeZone: record.timeZone,
      fetchedAt: record.fetchedAt,
      origin: { kind: record.originKind, sourceId: record.sourceId },
      current: { ...current, observedAt: record.observedAt },
      minimumTemperatureCelsius: record.minimumTemperatureCelsius,
      maximumTemperatureCelsius: record.maximumTemperatureCelsius,
      hourly,
    };
  } catch (error) {
    if (error instanceof WeatherMappingError) throw error;
    throw new WeatherMappingError();
  }
}

function toRecord(
  id: string,
  localProfileId: string,
  snapshot: ProvidedWeatherSnapshot,
): WeatherSnapshotRecord {
  requireMeasurements(snapshot.current);
  if (
    !isUuidV4(id) || !localProfileId || !snapshot.locationKey ||
    !isValidTimeZone(snapshot.timeZone) || !isUtcIso(snapshot.fetchedAt) ||
    !isUtcIso(snapshot.current.observedAt) ||
    (snapshot.origin.kind !== 'sample' && snapshot.origin.kind !== 'live') ||
    !snapshot.origin.sourceId.trim() ||
    !Number.isFinite(snapshot.minimumTemperatureCelsius) ||
    !Number.isFinite(snapshot.maximumTemperatureCelsius) ||
    snapshot.minimumTemperatureCelsius > snapshot.maximumTemperatureCelsius ||
    snapshot.current.temperatureCelsius < snapshot.minimumTemperatureCelsius ||
    snapshot.current.temperatureCelsius > snapshot.maximumTemperatureCelsius ||
    snapshot.hourly.length === 0
  ) throw new WeatherValidationError();
  const currentLocalDate = localDateKey(snapshot.current.observedAt, snapshot.timeZone);
  let previousForecastAt: string | null = null;
  for (const hour of snapshot.hourly) {
    requireMeasurements(hour);
    if (
      !isUtcIso(hour.forecastAt) ||
      localDateKey(hour.forecastAt, snapshot.timeZone) !== currentLocalDate ||
      (previousForecastAt !== null && previousForecastAt >= hour.forecastAt)
    ) throw new WeatherValidationError();
    previousForecastAt = hour.forecastAt;
  }
  return {
    id, localProfileId, locationKey: snapshot.locationKey, timeZone: snapshot.timeZone,
    fetchedAt: snapshot.fetchedAt, observedAt: snapshot.current.observedAt,
    originKind: snapshot.origin.kind, sourceId: snapshot.origin.sourceId,
    temperatureCelsius: snapshot.current.temperatureCelsius,
    apparentTemperatureCelsius: snapshot.current.apparentTemperatureCelsius,
    minimumTemperatureCelsius: snapshot.minimumTemperatureCelsius,
    maximumTemperatureCelsius: snapshot.maximumTemperatureCelsius,
    condition: snapshot.current.condition,
    precipitationProbability: snapshot.current.precipitationProbability,
    windSpeedMetersPerSecond: snapshot.current.windSpeedMetersPerSecond,
    humidity: snapshot.current.humidity, uvIndex: snapshot.current.uvIndex,
    hourly: snapshot.hourly.map((hour) => ({ ...hour })),
  };
}

export class LocalWeatherRepository implements WeatherRepository {
  private readonly dataSource: WeatherLocalDataSource;
  private readonly dependencies: RepositoryDependencies;

  constructor(
    dataSource: WeatherLocalDataSource,
    dependencies: RepositoryDependencies,
  ) {
    this.dataSource = dataSource;
    this.dependencies = dependencies;
  }

  getActiveLocation(localProfileId: string): Promise<ActiveLocation | null> {
    return this.execute(async () => {
      const record = await this.dataSource.getActiveLocation(localProfileId);
      if (record && record.localProfileId !== localProfileId) throw new WeatherMappingError();
      return record ? mapLocation(record) : null;
    });
  }

  setActiveLocation(localProfileId: string, location: ActiveLocation): Promise<ActiveLocation> {
    return this.execute(async () => {
      if (!localProfileId || !location.locationKey || !isValidTimeZone(location.timeZone)) {
        throw new WeatherValidationError();
      }
      const expectedLocationKey = location.source === 'manual'
        ? manualLocationKey(location.catalogId)
        : deviceLocationKey(location.coordinates);
      if (location.locationKey !== expectedLocationKey) throw new WeatherValidationError();
      const existing = await this.dataSource.getActiveLocation(localProfileId);
      const now = this.dependencies.now();
      if (!isUtcIso(now)) throw new WeatherValidationError();
      const record = await this.dataSource.setActiveLocation({
        localProfileId,
        locationKey: location.locationKey,
        source: location.source,
        manualCatalogId: location.source === 'manual' ? location.catalogId : null,
        latitudeE2: location.coordinates.latitudeE2,
        longitudeE2: location.coordinates.longitudeE2,
        timeZone: location.timeZone,
        deviceAccuracy: location.source === 'device' ? location.accuracy : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      if (record.localProfileId !== localProfileId) throw new WeatherMappingError();
      return mapLocation(record);
    });
  }

  getSnapshot(localProfileId: string, locationKey: string): Promise<WeatherSnapshot | null> {
    return this.execute(async () => {
      const record = await this.dataSource.getSnapshot(localProfileId, locationKey);
      if (
        record &&
        (record.localProfileId !== localProfileId || record.locationKey !== locationKey)
      ) throw new WeatherMappingError();
      return record ? mapSnapshot(record) : null;
    });
  }

  saveSnapshot(localProfileId: string, snapshot: ProvidedWeatherSnapshot): Promise<WeatherSnapshot> {
    return this.execute(async () => mapSnapshot(await this.dataSource.replaceSnapshot(
      toRecord(this.dependencies.createId(), localProfileId, snapshot),
    )));
  }

  private async execute<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof WeatherRepositoryError) throw error;
      if (error instanceof WeatherValidationError) throw new WeatherRepositoryError('invalid-input');
      if (error instanceof WeatherMappingError) throw new WeatherRepositoryError('invalid-data');
      throw new WeatherRepositoryError('unavailable');
    }
  }
}
