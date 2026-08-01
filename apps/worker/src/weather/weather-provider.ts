import type { WeatherConditionCode } from '@kuyara/contracts';

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

export type ProviderWeatherSnapshot = Readonly<{
  timeZone: string;
  fetchedAt: string;
  provenance: 'sample' | 'live';
  current: ProviderWeatherMeasurements & Readonly<{ observedAt: string }>;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  hourly: readonly (ProviderWeatherMeasurements & Readonly<{ forecastAt: string }>)[];
}>;

export interface WeatherProvider {
  fetchWeather(location: ProviderLocation): Promise<ProviderWeatherSnapshot>;
}
