import type { WeatherConditionCode, WeatherSourceId } from '@kuyara/contracts';

export type ProviderLocation = Readonly<{
  latitudeE2: number;
  longitudeE2: number;
  timeZone: string;
}>;

export type ProviderWeatherMeasurements = Readonly<{
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  condition: WeatherConditionCode;
  precipitationProbability: number;
  windSpeedMetersPerSecond: number;
  humidity: number;
  uvIndex: number;
}>;

export type ProviderDailyForecast = Readonly<{
  dateKey: string;
  condition: WeatherConditionCode;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  precipitationProbability: number;
  // null when the upstream response carries no amount for that day. An adapter never
  // substitutes a number it was not given.
  precipitationMillimetres: number | null;
}>;

export type ProviderWeatherSnapshot = Readonly<{
  timeZone: string;
  fetchedAt: string;
  provenance: 'sample' | 'live';
  sourceId: WeatherSourceId;
  current: ProviderWeatherMeasurements & Readonly<{ observedAt: string }>;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  hourly: readonly (ProviderWeatherMeasurements & Readonly<{ forecastAt: string }>)[];
  // Ordered, starting on the observation's local day. /v1 never carries it; /v2 does.
  daily: readonly ProviderDailyForecast[];
}>;

export interface WeatherProvider {
  fetchWeather(location: ProviderLocation, signal?: AbortSignal): Promise<ProviderWeatherSnapshot>;
}
