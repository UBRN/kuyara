import type { WeatherProvider } from './weather-provider.ts';
import {
  isFallbackEligible,
  WeatherProviderError,
} from './weather-provider-error.ts';

// Three providers, and the mobile client aborts the whole request at 10s
// (requestTimeoutMilliseconds in worker-weather-provider.ts), so 3 x 3000 leaves
// 1000ms of Worker overhead. See ADR 0014.
export const weatherMaxAttempts = 3;
export const weatherAttemptTimeoutMs = 3000;

export function createWeatherProviderChain(dependencies: Readonly<{
  providers: readonly WeatherProvider[];
  maxAttempts?: number;
  attemptTimeoutMs?: number;
}>): WeatherProvider {
  return {
    async fetchWeather(location, signal) {
      if (signal?.aborted) throw new WeatherProviderError('timeout');

      let lastEligibleError: unknown;
      for (const provider of dependencies.providers.slice(
        0,
        dependencies.maxAttempts ?? weatherMaxAttempts,
      )) {
        if (signal?.aborted) throw new WeatherProviderError('timeout');

        const controller = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new WeatherProviderError('timeout'));
          }, dependencies.attemptTimeoutMs ?? weatherAttemptTimeoutMs);
        });

        try {
          return await Promise.race([
            provider.fetchWeather(location, controller.signal),
            timeout,
          ]);
        } catch (error) {
          if (!isFallbackEligible(error)) throw error;
          lastEligibleError = error;
        } finally {
          clearTimeout(timeoutId!);
        }
      }

      if (lastEligibleError !== undefined) throw lastEligibleError;
      throw new WeatherProviderError('availability');
    },
  };
}
