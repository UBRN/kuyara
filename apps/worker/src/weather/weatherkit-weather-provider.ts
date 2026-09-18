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
import { mapWeatherKitResponse, weatherKitResponseSchema } from './weatherkit-raw.ts';
import type { WeatherKitTokenProvider } from './weatherkit-token.ts';

const baseUrl = 'https://weatherkit.apple.com/api/v1/weather';

function httpErrorKind(status: number): WeatherProviderErrorKind {
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400) return 'invalid_request';
  // WeatherKit answers 404 when it holds no data for the coordinate or for a
  // requested dataset, not because the request is malformed. That is an
  // availability failure of this provider for this location, so the chain must
  // advance to a provider that does cover it. Only 400 stays ineligible.
  if (status === 404) return 'availability';
  return 'upstream';
}

export class WeatherKitWeatherProvider implements WeatherProvider {
  readonly #token: WeatherKitTokenProvider;
  readonly #fetch: typeof globalThis.fetch | undefined;

  constructor(dependencies: Readonly<{
    token: WeatherKitTokenProvider;
    fetch?: typeof globalThis.fetch;
  }>) {
    this.#token = dependencies.token;
    this.#fetch = dependencies.fetch;
  }

  async fetchWeather(
    location: ProviderLocation,
    signal?: AbortSignal,
  ): Promise<ProviderWeatherSnapshot> {
    const token = await this.#token();
    const url = new URL(
      `${baseUrl}/en/${location.latitudeE2 / 100}/${location.longitudeE2 / 100}`,
    );
    url.searchParams.set('timezone', location.timeZone);
    url.searchParams.set('dataSets', 'currentWeather,forecastHourly,forecastDaily');

    let response: Response;
    try {
      response = await (this.#fetch ?? globalThis.fetch)(url, {
        signal,
        headers: { Authorization: `Bearer ${token}` },
      });
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
    const parsed = weatherKitResponseSchema.safeParse(body);
    if (!parsed.success) throw new WeatherProviderError('invalid_response');

    try {
      const snapshot = mapWeatherKitResponse(parsed.data, location, new Date().toISOString());
      // The self-check runs the richer v2 shape: a daily block this adapter cannot fill
      // fails the attempt here, so the chain moves on instead of serving a hollow /v2.
      mapProviderWeatherToApiV2(snapshot);
      return snapshot;
    } catch {
      throw new WeatherProviderError('invalid_response');
    }
  }
}
