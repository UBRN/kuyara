import type {
  ActiveLocation,
  CurrentWeather,
  DailyWeather,
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
  /** Absent when the source served no outlook, never an empty array standing in for one. */
  daily?: readonly DailyWeather[];
}>;

export type WeatherProviderFailureKind =
  | 'network'
  | 'service'
  | 'rate-limited'
  | 'invalid-response';

export class WeatherProviderError extends Error {
  readonly kind: WeatherProviderFailureKind;

  constructor(kind: WeatherProviderFailureKind) {
    super('Weather could not be loaded from the provider.');
    this.name = 'WeatherProviderError';
    this.kind = kind;
  }
}

export interface WeatherProvider {
  fetchSnapshot(location: ActiveLocation): Promise<ProvidedWeatherSnapshot>;
}
