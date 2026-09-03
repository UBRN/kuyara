import type { WeatherProvider } from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

export const openWeatherDailyCallLimit = 500;

// Apple includes 500,000 calls per month with the Developer Program membership,
// roughly 16,129 per 31-day month; this is half of that. See ADR 0014.
export const weatherKitDailyCallLimit = 8000;

export type WeatherDailyCounter = Readonly<{
  get(key: string): Promise<number>;
  increment(key: string): Promise<void>;
}>;

export function createDailyCappedWeatherProvider(dependencies: Readonly<{
  provider: WeatherProvider;
  counter: WeatherDailyCounter;
  dailyLimit: number;
  sourceSlug: string;
  now?: () => Date;
}>): WeatherProvider {
  return {
    async fetchWeather(location, signal) {
      const key = `weather:${dependencies.sourceSlug}:${(
        dependencies.now?.() ?? new Date()
      ).toISOString().slice(0, 10)}`;
      let count: number | undefined;
      try {
        count = await dependencies.counter.get(key);
      } catch {
        // Counter failures fail open so weather remains available.
      }
      if (count !== undefined && count >= dependencies.dailyLimit) {
        throw new WeatherProviderError('quota');
      }
      try {
        await dependencies.counter.increment(key);
      } catch {
        // Counter failures fail open so weather remains available.
      }
      return dependencies.provider.fetchWeather(location, signal);
    },
  };
}
