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
export type ManualLocationId = 'sample.istanbul' | 'sample.ankara' | 'sample.london';

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
}>;

export type DeviceActiveLocation = LocationBase & Readonly<{
  source: 'device';
  accuracy: LocationAccuracy;
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
}>;

export type WeatherFreshness = 'fresh' | 'stale';
export const weatherFreshnessWindowMilliseconds = 30 * 60 * 1000;

export class WeatherValidationError extends Error {
  constructor() {
    super('The weather value is invalid.');
    this.name = 'WeatherValidationError';
  }
}

export function normalizeCoordinates(
  latitude: number,
  longitude: number,
): NormalizedCoordinates {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new WeatherValidationError();
  }

  const normalizeZero = (value: number) => (Object.is(value, -0) ? 0 : value);
  return {
    latitudeE2: normalizeZero(Math.round(latitude * 100)),
    longitudeE2: normalizeZero(Math.round(longitude * 100)),
  };
}

export function deviceLocationKey(coordinates: NormalizedCoordinates): string {
  return `device:${coordinates.latitudeE2}:${coordinates.longitudeE2}`;
}

export function manualLocationKey(catalogId: ManualLocationId): string {
  return `manual:${catalogId}`;
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return value.length > 0;
  } catch {
    return false;
  }
}

export function weatherFreshness(
  fetchedAt: string,
  now: string,
): WeatherFreshness | 'invalid' {
  const fetched = Date.parse(fetchedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(fetched) || !Number.isFinite(current) || fetched > current) {
    return 'invalid';
  }

  return current - fetched <= weatherFreshnessWindowMilliseconds ? 'fresh' : 'stale';
}

export function isWeatherConditionCode(value: string): value is WeatherConditionCode {
  return (weatherConditionCodes as readonly string[]).includes(value);
}
