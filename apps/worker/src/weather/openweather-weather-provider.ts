import { mapOpenWeatherResponse, openWeatherResponseSchema } from './openweather-raw.ts';
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

const baseUrl = 'https://api.openweathermap.org/data/3.0/onecall';

function httpErrorKind(status: number): WeatherProviderErrorKind {
  if (status === 429) return 'quota';
  if (status === 401) return 'auth';
  if (status === 400) return 'invalid_request';
  // One Call answers 404 for an unknown path or a location it does not serve,
  // not because the request is malformed. OpenWeather is last in the chain, so
  // advancing costs nothing, but every adapter must classify this the same way.
  if (status === 404) return 'availability';
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
      // The self-check runs the richer v2 shape: a daily block this adapter cannot fill
      // fails the attempt here, so the chain moves on instead of serving a hollow /v2.
      mapProviderWeatherToApiV2(snapshot);
      return snapshot;
    } catch {
      throw new WeatherProviderError('invalid_response');
    }
  }
}
