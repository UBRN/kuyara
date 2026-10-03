import {
  isValidWeatherHourlyForecastWindow,
  locationDisplayNameSchema,
  weatherLocalDateKey,
} from '@kuyara/contracts';

import { isValidTimeZone } from '@/domain/intl-format';
import type { WeatherLocalDataSource } from '@/features/weather/data/weather-local-data-source';
import type {
  ActiveLocationRecord,
  HourlyWeatherRecord,
  WeatherSnapshotRecord,
} from '@/features/weather/data/weather-records';
import type { ProvidedWeatherSnapshot } from '@/features/weather/data/weather-provider';
import {
  deviceLocationDisplayName,
  deviceLocationKey,
  isManualLocationId,
  isNormalizedCoordinates,
  isWeatherConditionCode,
  manualLocationKey,
  type ActiveLocation,
  type DailyWeather,
  type HourlyWeather,
  type WeatherMeasurements,
  type WeatherSnapshot,
  WeatherValidationError,
} from '@/features/weather/domain/weather';
import { isUtcIsoTimestamp, isUuidV4 } from '@/domain/record-identity';

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

/** Measurements as a row or a provider hands them over: the condition is not yet known to be a code. */
type RawMeasurements = Omit<WeatherMeasurements, 'condition'> & Readonly<{ condition: string }>;

function requireMeasurements(value: RawMeasurements): WeatherMeasurements {
  const { condition } = value;
  if (
    !Number.isFinite(value.temperatureCelsius) ||
    !Number.isFinite(value.apparentTemperatureCelsius) ||
    !isWeatherConditionCode(condition) ||
    !Number.isFinite(value.precipitationProbability) ||
    value.precipitationProbability < 0 || value.precipitationProbability > 1 ||
    !Number.isFinite(value.windSpeedMetersPerSecond) || value.windSpeedMetersPerSecond < 0 ||
    !Number.isFinite(value.humidity) || value.humidity < 0 || value.humidity > 1 ||
    !Number.isFinite(value.uvIndex) || value.uvIndex < 0
  ) throw new WeatherValidationError();
  return { ...value, condition };
}

const localDateKeyPattern = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * One outlook day, checked field by field. It guards both directions, because the same
 * shape crosses the boundary both times: an entry arriving from the Worker and an entry
 * read back out of the column are equally untrusted.
 */
function requireDailyEntry(value: unknown): DailyWeather {
  if (typeof value !== 'object' || value === null) throw new WeatherValidationError();
  const entry = value as Partial<Record<keyof DailyWeather, unknown>>;
  const { dateKey, condition, precipitationMillimetres: millimetres } = entry;
  const minimum = entry.minimumTemperatureCelsius;
  const maximum = entry.maximumTemperatureCelsius;
  const probability = entry.precipitationProbability;
  if (
    typeof dateKey !== 'string' || !localDateKeyPattern.test(dateKey) ||
    typeof condition !== 'string' || !isWeatherConditionCode(condition) ||
    typeof minimum !== 'number' || !Number.isFinite(minimum) ||
    typeof maximum !== 'number' || !Number.isFinite(maximum) || minimum > maximum ||
    typeof probability !== 'number' || !Number.isFinite(probability) ||
    probability < 0 || probability > 1 ||
    (millimetres !== null && (
      typeof millimetres !== 'number' || !Number.isFinite(millimetres) || millimetres < 0
    ))
  ) throw new WeatherValidationError();
  return {
    dateKey,
    condition,
    minimumTemperatureCelsius: minimum,
    maximumTemperatureCelsius: maximum,
    precipitationProbability: probability,
    precipitationMillimetres: millimetres,
  };
}

/**
 * The outlook is an additive display block, so a column this build cannot read costs the
 * section and nothing else: the snapshot the screen needs to render at all still comes
 * back. That is also what makes a row written before the column existed, which holds null,
 * read as no outlook rather than as a corrupt snapshot.
 */
function mapDaily(dailyJson: string | null): readonly DailyWeather[] | undefined {
  if (dailyJson === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(dailyJson);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    // One bad entry drops the whole outlook: a week missing its Thursday is a claim about
    // the week that nothing on the row would tell the reader is short.
    return parsed.map(requireDailyEntry);
  } catch {
    return undefined;
  }
}

function mapLocation(record: ActiveLocationRecord): ActiveLocation {
  if (
    !record.localProfileId || !record.locationKey ||
    !isNormalizedCoordinates(record.latitudeE2, record.longitudeE2) ||
    !isValidTimeZone(record.timeZone) || !isUtcIsoTimestamp(record.createdAt) || !isUtcIsoTimestamp(record.updatedAt)
  ) throw new WeatherMappingError();

  const common = {
    locationKey: record.locationKey,
    coordinates: { latitudeE2: record.latitudeE2, longitudeE2: record.longitudeE2 },
    timeZone: record.timeZone,
  };
  if (record.source === 'manual' && record.manualCatalogId && record.deviceAccuracy === null) {
    if (!isManualLocationId(record.manualCatalogId) || !locationDisplayNameSchema.safeParse(record.displayName).success) {
      throw new WeatherMappingError();
    }
    const catalogId = record.manualCatalogId;
    if (record.locationKey !== manualLocationKey(catalogId)) throw new WeatherMappingError();
    return { ...common, source: 'manual', catalogId, displayName: locationDisplayNameSchema.parse(record.displayName) };
  }
  if (
    record.source === 'device' && record.manualCatalogId === null &&
    (record.deviceAccuracy === 'approximate' || record.deviceAccuracy === 'full')
  ) {
    if (record.locationKey !== deviceLocationKey(common.coordinates)) throw new WeatherMappingError();
    return {
      ...common,
      source: 'device',
      accuracy: record.deviceAccuracy,
      // A stored name is normalized exactly as it was resolved; the column's own check keeps a
      // blank or oversized one out of the row in the first place.
      displayName: deviceLocationDisplayName(record.displayName, null),
    };
  }
  throw new WeatherMappingError();
}

function mapHourly(record: HourlyWeatherRecord): HourlyWeather {
  const value = requireMeasurements(record);
  if (!isUtcIsoTimestamp(record.forecastAt)) throw new WeatherMappingError();
  return {
    temperatureCelsius: value.temperatureCelsius,
    apparentTemperatureCelsius: value.apparentTemperatureCelsius,
    condition: value.condition,
    precipitationProbability: value.precipitationProbability,
    windSpeedMetersPerSecond: value.windSpeedMetersPerSecond,
    humidity: value.humidity,
    uvIndex: value.uvIndex,
    forecastAt: record.forecastAt,
  };
}

/** The origin of a snapshot, or null when its kind is unknown or its source is blank. */
function parseOrigin(kind: string, sourceId: string): WeatherSnapshot['origin'] | null {
  return (kind === 'sample' || kind === 'live') && sourceId.trim() ? { kind, sourceId } : null;
}

/**
 * The rules a snapshot's own fields obey in both directions, a row read back and a snapshot
 * about to be written: its identity, zone, clock stamps and temperature range.
 */
function hasValidSnapshotFields(fields: Readonly<{
  id: string;
  localProfileId: string;
  locationKey: string;
  timeZone: string;
  fetchedAt: string;
  observedAt: string;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  currentTemperatureCelsius: number;
  hourlyCount: number;
}>): boolean {
  return isUuidV4(fields.id) && Boolean(fields.localProfileId) && Boolean(fields.locationKey) &&
    isValidTimeZone(fields.timeZone) && isUtcIsoTimestamp(fields.fetchedAt) &&
    isUtcIsoTimestamp(fields.observedAt) &&
    Number.isFinite(fields.minimumTemperatureCelsius) &&
    Number.isFinite(fields.maximumTemperatureCelsius) &&
    fields.minimumTemperatureCelsius <= fields.maximumTemperatureCelsius &&
    fields.currentTemperatureCelsius >= fields.minimumTemperatureCelsius &&
    fields.currentTemperatureCelsius <= fields.maximumTemperatureCelsius &&
    fields.hourlyCount > 0;
}

function mapSnapshot(record: WeatherSnapshotRecord): WeatherSnapshot {
  try {
    const current = requireMeasurements(record);
    const origin = parseOrigin(record.originKind, record.sourceId);
    if (origin === null || !hasValidSnapshotFields({
      ...record, currentTemperatureCelsius: current.temperatureCelsius, hourlyCount: record.hourly.length,
    })) throw new WeatherMappingError();
    const hourly = record.hourly.map(mapHourly);
    const daily = mapDaily(record.dailyJson);
    const currentLocalDate = weatherLocalDateKey(record.observedAt, record.timeZone);
    const isLegacySameDaySnapshot = currentLocalDate !== null && hourly.length <= 25 &&
      hourly.every(({ forecastAt }, index) => (
        weatherLocalDateKey(forecastAt, record.timeZone) === currentLocalDate &&
        (index === 0 || hourly[index - 1].forecastAt < forecastAt)
      ));
    if (
      !isValidWeatherHourlyForecastWindow(hourly, record.observedAt) &&
      !isLegacySameDaySnapshot
    ) {
      throw new WeatherMappingError();
    }
    return {
      id: record.id,
      localProfileId: record.localProfileId,
      locationKey: record.locationKey,
      timeZone: record.timeZone,
      fetchedAt: record.fetchedAt,
      origin,
      current: {
        temperatureCelsius: current.temperatureCelsius,
        apparentTemperatureCelsius: current.apparentTemperatureCelsius,
        condition: current.condition,
        precipitationProbability: current.precipitationProbability,
        windSpeedMetersPerSecond: current.windSpeedMetersPerSecond,
        humidity: current.humidity,
        uvIndex: current.uvIndex,
        observedAt: record.observedAt,
      },
      minimumTemperatureCelsius: record.minimumTemperatureCelsius,
      maximumTemperatureCelsius: record.maximumTemperatureCelsius,
      hourly,
      ...(daily === undefined ? {} : { daily }),
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
  if (parseOrigin(snapshot.origin.kind, snapshot.origin.sourceId) === null || !hasValidSnapshotFields({
    id,
    localProfileId,
    locationKey: snapshot.locationKey,
    timeZone: snapshot.timeZone,
    fetchedAt: snapshot.fetchedAt,
    observedAt: snapshot.current.observedAt,
    minimumTemperatureCelsius: snapshot.minimumTemperatureCelsius,
    maximumTemperatureCelsius: snapshot.maximumTemperatureCelsius,
    currentTemperatureCelsius: snapshot.current.temperatureCelsius,
    hourlyCount: snapshot.hourly.length,
  })) throw new WeatherValidationError();
  for (const hour of snapshot.hourly) {
    requireMeasurements(hour);
    if (!isUtcIsoTimestamp(hour.forecastAt)) throw new WeatherValidationError();
  }
  if (!isValidWeatherHourlyForecastWindow(
    snapshot.hourly,
    snapshot.current.observedAt,
  )) {
    throw new WeatherValidationError();
  }
  const daily = snapshot.daily === undefined || snapshot.daily.length === 0
    ? undefined
    : snapshot.daily.map(requireDailyEntry);
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
    // A source that served no outlook writes null rather than an empty document, so the
    // column says "no outlook" in exactly one way whatever wrote the row.
    dailyJson: daily === undefined ? null : JSON.stringify(daily),
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
      if (location.source === 'manual' && (
        !isManualLocationId(location.catalogId) || !locationDisplayNameSchema.safeParse(location.displayName).success
      )) throw new WeatherValidationError();
      if (
        location.source === 'device' && location.displayName != null &&
        !locationDisplayNameSchema.safeParse(location.displayName).success
      ) throw new WeatherValidationError();
      if (!isNormalizedCoordinates(location.coordinates.latitudeE2, location.coordinates.longitudeE2)) {
        throw new WeatherValidationError();
      }
      const expectedLocationKey = location.source === 'manual'
        ? manualLocationKey(location.catalogId)
        : deviceLocationKey(location.coordinates);
      if (location.locationKey !== expectedLocationKey) throw new WeatherValidationError();
      const existing = await this.dataSource.getActiveLocation(localProfileId);
      const now = this.dependencies.now();
      if (!isUtcIsoTimestamp(now)) throw new WeatherValidationError();
      const record = await this.dataSource.setActiveLocation({
        localProfileId,
        locationKey: location.locationKey,
        source: location.source,
        manualCatalogId: location.source === 'manual' ? location.catalogId : null,
        displayName: location.displayName == null ? null : locationDisplayNameSchema.parse(location.displayName),
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
