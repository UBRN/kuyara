import { fetchProviderWeather } from './provider-fetch.ts';
import type {
  ProviderLocation,
  ProviderWeatherSnapshot,
  WeatherProvider,
} from './weather-provider.ts';
import { mapWeatherKitResponse, weatherKitResponseSchema } from './weatherkit-raw.ts';
import type { WeatherKitTokenProvider } from './weatherkit-token.ts';

const baseUrl = 'https://weatherkit.apple.com/api/v1/weather';

export class WeatherKitWeatherProvider implements WeatherProvider {
  readonly #token: WeatherKitTokenProvider;
  readonly #fetch: typeof globalThis.fetch | undefined;
  readonly #now: () => Date;

  constructor(dependencies: Readonly<{
    token: WeatherKitTokenProvider;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
  }>) {
    this.#token = dependencies.token;
    this.#fetch = dependencies.fetch;
    this.#now = dependencies.now ?? (() => new Date());
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

    return fetchProviderWeather({
      fetch: this.#fetch,
      url,
      init: { headers: { Authorization: `Bearer ${token}` } },
      signal,
      schema: weatherKitResponseSchema,
      map: (raw) => mapWeatherKitResponse(raw, location, this.#now().toISOString()),
    });
  }
}
