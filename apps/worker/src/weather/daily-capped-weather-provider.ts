import { dailyCounterKey, type DailyCounterPort } from '../daily-counter.ts';
import type { WeatherProvider } from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

export const openWeatherDailyCallLimit = 500;

// Apple includes 500,000 calls per month with the Developer Program membership,
// roughly 16,129 per 31-day month; this is half of that. See ADR 0014.
export const weatherKitDailyCallLimit = 8000;

export function createDailyCappedWeatherProvider(dependencies: Readonly<{
  provider: WeatherProvider;
  counter: DailyCounterPort;
  dailyLimit: number;
  sourceSlug: string;
  now?: () => Date;
}>): WeatherProvider {
  return {
    id: dependencies.provider.id,
    async fetchWeather(location, signal) {
      const key = dailyCounterKey(
        `weather:${dependencies.sourceSlug}`,
        dependencies.now?.() ?? new Date(),
      );
      // The increment is the gate, and it happens before the attempt: the count it
      // returns decides whether the wrapped provider is called at all. A provider call that
      // then fails has still spent one counted attempt, which is intended, because attempts
      // are what the upstream provider counts against its allowance.
      let count: number;
      try {
        count = await dependencies.counter.increment(key);
      } catch {
        // No counted attempt, no call: the chain advances to the next provider instead of
        // reaching the capped one uncounted.
        throw new WeatherProviderError('availability');
      }
      if (count > dependencies.dailyLimit) {
        throw new WeatherProviderError('quota');
      }
      return dependencies.provider.fetchWeather(location, signal);
    },
  };
}
