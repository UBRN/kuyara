import { locationDisplayNameSchema, manualLocationIdSchema } from '@kuyara/contracts';

import { isValidTimeZone } from '@/domain/intl-format';

export const weatherConditionCodes = [
  'clear',
  'mostly_clear',
  'partly_cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'heavy_rain',
  'sleet',
  'snow',
  'thunderstorm',
] as const;

export type WeatherConditionCode = (typeof weatherConditionCodes)[number];
export type LocationAccuracy = 'approximate' | 'full';
export type ManualLocationId = `sample.${string}` | `place.${number}`;

export function isManualLocationId(value: unknown): value is ManualLocationId {
  return manualLocationIdSchema.safeParse(value).success;
}

export type NormalizedCoordinates = Readonly<{
  latitudeE2: number;
  longitudeE2: number;
}>;

type LocationBase = Readonly<{
  locationKey: string;
  coordinates: NormalizedCoordinates;
  timeZone: string;
}>;

export type ManualActiveLocation = LocationBase & Readonly<{
  source: 'manual';
  catalogId: ManualLocationId;
  displayName: string;
}>;

export type DeviceActiveLocation = LocationBase & Readonly<{
  source: 'device';
  accuracy: LocationAccuracy;
  /**
   * The locality the reverse geocode resolved for these coordinates, or null when it resolved
   * none. It is a place name only: never a street, never coordinates rendered as text. Optional
   * so a row stored before the name existed stays valid, and so both members of the union can be
   * read through `location.displayName`.
   */
  displayName?: string | null;
}>;

export type ActiveLocation = ManualActiveLocation | DeviceActiveLocation;

export type WeatherMeasurements = Readonly<{
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  condition: WeatherConditionCode;
  precipitationProbability: number;
  windSpeedMetersPerSecond: number;
  humidity: number;
  uvIndex: number;
}>;

export type CurrentWeather = WeatherMeasurements & Readonly<{ observedAt: string }>;
export type HourlyWeather = WeatherMeasurements & Readonly<{ forecastAt: string }>;

/**
 * One day of the outlook, keyed by its own local calendar date rather than by an instant:
 * a day is what the place's calendar calls a day, and rendering it means formatting that
 * date, never an hour inside it. `precipitationMillimetres` is null when the provider
 * reported no amount, which is not the same as reporting none: the row then shows the
 * chance alone rather than a fabricated zero.
 */
export type DailyWeather = Readonly<{
  dateKey: string;
  condition: WeatherConditionCode;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  precipitationProbability: number;
  precipitationMillimetres: number | null;
}>;

export type WeatherSnapshot = Readonly<{
  id: string;
  localProfileId: string;
  locationKey: string;
  timeZone: string;
  fetchedAt: string;
  origin: Readonly<{ kind: 'sample' | 'live'; sourceId: string }>;
  current: CurrentWeather;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  hourly: readonly HourlyWeather[];
  /**
   * Absent, not empty, when this snapshot carries no outlook: a row persisted before the
   * daily forecast existed, or a source that supplied none. The section simply does not
   * appear, and the rest of the snapshot is untouched.
   */
  daily?: readonly DailyWeather[];
}>;

export type WeatherFreshness = 'fresh' | 'stale';
export const weatherFreshnessWindowMilliseconds = 30 * 60 * 1000;
/**
 * The Worker and the device read different clocks, so a `fetchedAt` slightly in the
 * device's future is skew rather than corrupt data; anything further ahead is invalid.
 * Tolerated skew does extend how long a snapshot reads fresh, by up to the tolerance:
 * nothing records when the device received the snapshot, so the window can only be
 * measured from the stamp itself, and one stamped five minutes ahead stays fresh for
 * thirty-five minutes after it arrived. The budget is therefore its own small value
 * rather than the freshness window, which would have doubled that bound to an hour.
 */
export const weatherClockSkewToleranceMilliseconds = 5 * 60 * 1000;

export class WeatherValidationError extends Error {
  constructor() {
    super('The weather value is invalid.');
    this.name = 'WeatherValidationError';
  }
}

const maximumLatitudeE2 = 9000;
const maximumLongitudeE2 = 18000;

/** Whether the two values are whole hundredths of a degree inside the globe: a stored or sent pair. */
export function isNormalizedCoordinates(latitudeE2: number, longitudeE2: number): boolean {
  return Number.isInteger(latitudeE2) && Math.abs(latitudeE2) <= maximumLatitudeE2 &&
    Number.isInteger(longitudeE2) && Math.abs(longitudeE2) <= maximumLongitudeE2;
}

export function normalizeCoordinates(
  latitude: number,
  longitude: number,
): NormalizedCoordinates {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > maximumLatitudeE2 / 100 ||
    Math.abs(longitude) > maximumLongitudeE2 / 100
  ) {
    throw new WeatherValidationError();
  }

  const normalizeZero = (value: number) => (Object.is(value, -0) ? 0 : value);
  return {
    latitudeE2: normalizeZero(Math.round(latitude * 100)),
    longitudeE2: normalizeZero(Math.round(longitude * 100)),
  };
}

/**
 * The name a reverse geocode resolved for the device's coordinates: the town it falls in, or
 * the subregion around it when the town is unknown. A street or an empty value resolves to no
 * name at all, which reads as "current location" rather than as a wrong place.
 */
export function deviceLocationDisplayName(
  city: string | null | undefined,
  subregion: string | null | undefined,
): string | null {
  const parsed = locationDisplayNameSchema.safeParse(city ?? subregion);
  return parsed.success ? parsed.data : null;
}

export function deviceLocationKey(coordinates: NormalizedCoordinates): string {
  return `device:${coordinates.latitudeE2}:${coordinates.longitudeE2}`;
}

export function manualLocationKey(catalogId: ManualLocationId): string {
  return `manual:${catalogId}`;
}

export function resolveDeviceLocationTimeZone(
  geocodedTimeZone: string | null | undefined,
  deviceTimeZone: string,
): string | null {
  if (geocodedTimeZone && isValidTimeZone(geocodedTimeZone)) {
    return geocodedTimeZone;
  }

  return isValidTimeZone(deviceTimeZone) ? deviceTimeZone : null;
}

export function weatherFreshness(
  fetchedAt: string,
  now: string,
): WeatherFreshness | 'invalid' {
  const fetched = Date.parse(fetchedAt);
  const current = Date.parse(now);
  if (
    !Number.isFinite(fetched) || !Number.isFinite(current)
    || fetched - current > weatherClockSkewToleranceMilliseconds
  ) {
    return 'invalid';
  }

  return current - fetched <= weatherFreshnessWindowMilliseconds ? 'fresh' : 'stale';
}

/**
 * A snapshot a provider returned for `location`, or an error when it is for another place,
 * another zone or carries a fetch time the device cannot trust. The one rule the foreground
 * refresh and the background task both apply before a provided snapshot is stored.
 */
export function acceptProvidedSnapshot<T extends Pick<WeatherSnapshot, 'locationKey' | 'timeZone' | 'fetchedAt'>>(
  location: Pick<ActiveLocation, 'locationKey' | 'timeZone'>,
  provided: T,
  now: string,
): T {
  if (provided.locationKey !== location.locationKey || provided.timeZone !== location.timeZone) {
    throw new Error('Mismatched weather location.');
  }
  if (weatherFreshness(provided.fetchedAt, now) === 'invalid') {
    throw new Error('Invalid weather fetch time.');
  }
  return provided;
}

export function isWeatherConditionCode(value: string): value is WeatherConditionCode {
  return (weatherConditionCodes as readonly string[]).includes(value);
}

/**
 * The snapshot only when it belongs to the active place. After a place switch the previous
 * place's snapshot stays the last valid result until the new one loads, and it carries no
 * name of its own, so nothing place-dependent may render it under the new place's label.
 */
export function activeLocationSnapshot(
  snapshot: WeatherSnapshot | null,
  activeLocation: ActiveLocation | null,
): WeatherSnapshot | null {
  return snapshot !== null && snapshot.locationKey === activeLocation?.locationKey ? snapshot : null;
}
