import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDailyCappedWeatherProvider,
  openWeatherDailyCallLimit,
} from './daily-capped-weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const snapshot = {
  timeZone: 'Europe/Istanbul',
  fetchedAt: '2026-08-29T09:30:00.000Z',
  provenance: 'live',
  sourceId: 'openweather',
  current: {
    observedAt: '2026-08-29T09:30:00.000Z',
    temperatureCelsius: 24,
    apparentTemperatureCelsius: 25,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 2,
    humidity: 0.5,
    uvIndex: 4,
  },
  minimumTemperatureCelsius: 18,
  maximumTemperatureCelsius: 27,
  hourly: [],
};

function cappedProvider({ provider, counter, dailyLimit = openWeatherDailyCallLimit }) {
  return createDailyCappedWeatherProvider({
    provider,
    counter,
    dailyLimit,
    sourceSlug: 'openweather',
    now: () => new Date('2026-08-29T23:59:00.000Z'),
  });
}

// The counter increments before the wrapped provider is called, and the increment is the
// gate: the new count decides whether the attempt goes ahead.
test('increments the UTC daily counter before calling a provider under the limit', async () => {
  const keys = [];
  let providerCalls = 0;
  const provider = cappedProvider({
    dailyLimit: 2,
    counter: {
      increment: async (key) => { keys.push(key); return 2; },
    },
    provider: {
      fetchWeather: async () => {
        providerCalls += 1;
        assert.deepEqual(keys, ['weather:openweather:2026-08-29']);
        return snapshot;
      },
    },
  });

  assert.strictEqual(await provider.fetchWeather(location), snapshot);
  assert.equal(providerCalls, 1);
  assert.deepEqual(keys, ['weather:openweather:2026-08-29']);
});

test('the attempt whose increment lands exactly on the limit still goes ahead', async () => {
  let providerCalls = 0;
  const provider = cappedProvider({
    dailyLimit: openWeatherDailyCallLimit,
    counter: { increment: async () => openWeatherDailyCallLimit },
    provider: { fetchWeather: async () => { providerCalls += 1; return snapshot; } },
  });

  assert.strictEqual(await provider.fetchWeather(location), snapshot);
  assert.equal(providerCalls, 1);
});

test('rejects quota without calling the provider once the increment passes the limit', async () => {
  let increments = 0;
  let providerCalls = 0;
  const provider = cappedProvider({
    dailyLimit: openWeatherDailyCallLimit,
    counter: {
      increment: async () => { increments += 1; return openWeatherDailyCallLimit + 1; },
    },
    provider: { fetchWeather: async () => { providerCalls += 1; return snapshot; } },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'quota',
  );
  assert.equal(increments, 1);
  assert.equal(providerCalls, 0);
});

test('a failed provider call still counts one attempt against the cap', async () => {
  const failure = new WeatherProviderError('upstream');
  let increments = 0;
  const provider = cappedProvider({
    counter: { increment: async () => { increments += 1; return 1; } },
    provider: { fetchWeather: async () => { throw failure; } },
  });

  await assert.rejects(provider.fetchWeather(location), (error) => error === failure);
  assert.equal(increments, 1);
});

// The counter is the gate. When it cannot answer, the capped provider is never reached
// uncounted: the failure is an availability error the chain advances past.
test('a counter failure advances the chain without calling the provider', async () => {
  let providerCalls = 0;
  const provider = cappedProvider({
    counter: {
      increment: async () => { throw new Error('Durable Object unavailable'); },
    },
    provider: {
      fetchWeather: async () => { providerCalls += 1; return snapshot; },
    },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'availability',
  );
  assert.equal(providerCalls, 0);
});
