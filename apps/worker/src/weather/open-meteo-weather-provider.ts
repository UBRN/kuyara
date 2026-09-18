import { weatherDailyForecastMaximumEntries } from '@kuyara/contracts';

import { mapOpenMeteoResponse, openMeteoResponseSchema } from './open-meteo-raw.ts';
import { mapProviderWeatherToApiV2 } from './provider-weather-mapper.ts';
import type {
  ProviderLocation,
  ProviderWeatherSnapshot,
  WeatherProvider,
} from './weather-provider.ts';
import {
  WeatherProviderError,
  type WeatherProviderErrorKind,
} from './weather-provider-error.ts';

const baseUrl = 'https://api.open-meteo.com/v1/forecast';

function httpErrorKind(status: number): WeatherProviderErrorKind {
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400) return 'invalid_request';
  return 'upstream';
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly #fetch: typeof globalThis.fetch | undefined;

  constructor(dependencies?: Readonly<{ fetch?: typeof globalThis.fetch }>) {
    this.#fetch = dependencies?.fetch;
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

    let response: Response;
    try {
      response = await (this.#fetch ?? globalThis.fetch)(url, { signal });
    } catch {
      throw new WeatherProviderError(signal?.aborted ? 'timeout' : 'availability');
    }
    if (!response.ok) throw new WeatherProviderError(httpErrorKind(response.status));

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new WeatherProviderError(signal?.aborted ? 'timeout' : 'invalid_response');
    }
    const parsed = openMeteoResponseSchema.safeParse(body);
    if (!parsed.success) throw new WeatherProviderError('invalid_response');

    try {
      const snapshot = mapOpenMeteoResponse(parsed.data, location, new Date().toISOString());
      // The self-check runs the richer v2 shape: a daily block this adapter cannot fill
      // fails the attempt here, so the chain moves on instead of serving a hollow /v2.
      mapProviderWeatherToApiV2(snapshot);
      return snapshot;
    } catch {
      throw new WeatherProviderError('invalid_response');
    }
  }
}
