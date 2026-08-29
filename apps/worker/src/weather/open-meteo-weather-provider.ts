import { mapOpenMeteoResponse, openMeteoResponseSchema } from './open-meteo-raw.ts';
import { mapProviderWeatherToApi } from './provider-weather-mapper.ts';
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
    url.searchParams.set('daily', 'temperature_2m_min,temperature_2m_max');
    url.searchParams.set('wind_speed_unit', 'ms');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('forecast_days', '2');

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
      mapProviderWeatherToApi(snapshot);
      return snapshot;
    } catch {
      throw new WeatherProviderError('invalid_response');
    }
  }
}
