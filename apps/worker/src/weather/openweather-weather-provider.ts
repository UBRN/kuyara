import { mapOpenWeatherResponse, openWeatherResponseSchema } from './openweather-raw.ts';
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

const baseUrl = 'https://api.openweathermap.org/data/3.0/onecall';

function httpErrorKind(status: number): WeatherProviderErrorKind {
  if (status === 429) return 'quota';
  if (status === 401) return 'auth';
  if (status === 400 || status === 404) return 'invalid_request';
  return 'upstream';
}

export class OpenWeatherWeatherProvider implements WeatherProvider {
  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch | undefined;

  constructor(dependencies: Readonly<{
    apiKey: string;
    fetch?: typeof globalThis.fetch;
  }>) {
    this.#apiKey = dependencies.apiKey;
    this.#fetch = dependencies.fetch;
  }

  async fetchWeather(
    location: ProviderLocation,
    signal?: AbortSignal,
  ): Promise<ProviderWeatherSnapshot> {
    const url = new URL(baseUrl);
    url.searchParams.set('lat', String(location.latitudeE2 / 100));
    url.searchParams.set('lon', String(location.longitudeE2 / 100));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('exclude', 'minutely,alerts');
    url.searchParams.set('appid', this.#apiKey);

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
    const parsed = openWeatherResponseSchema.safeParse(body);
    if (!parsed.success) throw new WeatherProviderError('invalid_response');

    try {
      const snapshot = mapOpenWeatherResponse(
        parsed.data,
        location,
        new Date().toISOString(),
      );
      mapProviderWeatherToApi(snapshot);
      return snapshot;
    } catch {
      throw new WeatherProviderError('invalid_response');
    }
  }
}
