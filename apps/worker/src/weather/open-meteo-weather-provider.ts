import { weatherDailyForecastMaximumEntries } from '@kuyara/contracts';

import type { FetchLike } from '../default-fetch.ts';
import { mapOpenMeteoResponse, openMeteoResponseSchema } from './open-meteo-raw.ts';
import { fetchProviderWeather } from './provider-fetch.ts';
import type {
  ProviderLocation,
  ProviderWeatherSnapshot,
  WeatherProvider,
} from './weather-provider.ts';

const baseUrl = 'https://api.open-meteo.com/v1/forecast';

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly #fetch: FetchLike | undefined;
  readonly #now: () => Date;

  constructor(
    dependencies?: Readonly<{ fetch?: FetchLike; now?: () => Date }>,
  ) {
    this.#fetch = dependencies?.fetch;
    this.#now = dependencies?.now ?? (() => new Date());
  }

  async fetchWeather(
    location: ProviderLocation,
    signal?: AbortSignal,
  ): Promise<ProviderWeatherSnapshot> {
    const url = new URL(baseUrl);
    url.searchParams.set('latitude', String(location.latitudeE2 / 100));
    url.searchParams.set('longitude', String(location.longitudeE2 / 100));
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    );
    url.searchParams.set(
      'hourly',
      'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,uv_index',
    );
    url.searchParams.set(
      'daily',
      'temperature_2m_min,temperature_2m_max,weather_code,precipitation_probability_max,precipitation_sum',
    );
    url.searchParams.set('wind_speed_unit', 'ms');
    // Pinned like the wind unit: the contract says millimetres, so an upstream default change
    // must not turn the daily amount into inches.
    url.searchParams.set('precipitation_unit', 'mm');
    // The location's own zone, so `daily` is keyed by its local days rather than UTC ones:
    // a UTC day boundary put the wrong low/high on the card for every zone off UTC.
    url.searchParams.set('timezone', location.timeZone);
    // Today plus six, the contract's ceiling for the daily block. Still one call.
    url.searchParams.set('forecast_days', String(weatherDailyForecastMaximumEntries));

    return fetchProviderWeather({
      fetch: this.#fetch,
      url,
      signal,
      schema: openMeteoResponseSchema,
      map: (raw) => mapOpenMeteoResponse(raw, location, this.#now().toISOString()),
    });
  }
}
