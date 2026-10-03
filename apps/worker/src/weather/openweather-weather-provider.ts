import { mapOpenWeatherResponse, openWeatherResponseSchema } from './openweather-raw.ts';
import { fetchProviderWeather } from './provider-fetch.ts';
import type {
  ProviderLocation,
  ProviderWeatherSnapshot,
  WeatherProvider,
} from './weather-provider.ts';

const baseUrl = 'https://api.openweathermap.org/data/3.0/onecall';

export class OpenWeatherWeatherProvider implements WeatherProvider {
  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch | undefined;
  readonly #now: () => Date;

  constructor(dependencies: Readonly<{
    apiKey: string;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
  }>) {
    this.#apiKey = dependencies.apiKey;
    this.#fetch = dependencies.fetch;
    this.#now = dependencies.now ?? (() => new Date());
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

    return fetchProviderWeather({
      fetch: this.#fetch,
      url,
      signal,
      schema: openWeatherResponseSchema,
      map: (raw) => mapOpenWeatherResponse(raw, location, this.#now().toISOString()),
    });
  }
}
