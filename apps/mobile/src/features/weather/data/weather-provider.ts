import type {
  ActiveLocation,
  CurrentWeather,
  HourlyWeather,
} from '@/features/weather/domain/weather';

export type ProvidedWeatherSnapshot = Readonly<{
  locationKey: string;
  timeZone: string;
  fetchedAt: string;
  origin: Readonly<{ kind: 'sample' | 'live'; sourceId: string }>;
  current: CurrentWeather;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  hourly: readonly HourlyWeather[];
}>;

export interface WeatherProvider {
  fetchSnapshot(location: ActiveLocation): Promise<ProvidedWeatherSnapshot>;
}
