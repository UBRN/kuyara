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

test('increments the UTC daily counter before calling a provider under the limit', async () => {
  const keys = [];
  let increments = 0;
  let providerCalls = 0;
  const provider = cappedProvider({
    counter: {
      get: async (key) => { keys.push(key); return 0; },
      increment: async (key) => { keys.push(key); increments += 1; },
    },
    provider: {
      fetchWeather: async () => {
        providerCalls += 1;
        assert.equal(increments, 1);
        return snapshot;
      },
    },
  });

  assert.strictEqual(await provider.fetchWeather(location), snapshot);
  assert.equal(providerCalls, 1);
  assert.deepEqual(keys, [
    'weather:openweather:2026-08-29',
    'weather:openweather:2026-08-29',
  ]);
});

test('rejects quota without incrementing or calling the provider at the limit', async () => {
  let increments = 0;
  let providerCalls = 0;
  const provider = cappedProvider({
    dailyLimit: 1,
    counter: {
      get: async () => 1,
      increment: async () => { increments += 1; },
    },
    provider: { fetchWeather: async () => { providerCalls += 1; return snapshot; } },
  });

  await assert.rejects(
    provider.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'quota',
  );
  assert.equal(increments, 0);
  assert.equal(providerCalls, 0);
});

test('increments the counter even when the provider fails', async () => {
  const failure = new WeatherProviderError('upstream');
  let increments = 0;
  const provider = cappedProvider({
    counter: {
      get: async () => 0,
      increment: async () => { increments += 1; },
    },
    provider: { fetchWeather: async () => { throw failure; } },
  });

  await assert.rejects(provider.fetchWeather(location), (error) => error === failure);
  assert.equal(increments, 1);
});

test('allows the provider call when the counter read fails', async () => {
  let providerCalls = 0;
  const provider = cappedProvider({
    counter: {
      get: async () => { throw new Error('KV unavailable'); },
      increment: async () => {},
    },
    provider: {
      fetchWeather: async () => { providerCalls += 1; return snapshot; },
    },
  });

  assert.strictEqual(await provider.fetchWeather(location), snapshot);
  assert.equal(providerCalls, 1);
});
