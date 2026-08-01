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

export type WeatherProviderFailureKind =
  | 'network'
  | 'service'
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
