import assert from 'node:assert/strict';
import test from 'node:test';

import { createWeatherProviders } from '../index.ts';
import { DeterministicMockWeatherProvider } from './mock-weather-provider.ts';
import { OpenMeteoWeatherProvider } from './open-meteo-weather-provider.ts';
import { OpenWeatherWeatherProvider } from './openweather-weather-provider.ts';
import {
  createWeatherProviderChain,
  weatherAttemptTimeoutMs,
  weatherMaxAttempts,
} from './weather-provider-chain.ts';
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
  sourceId: 'open_meteo',
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

test('returns the first successful provider without calling the second', async () => {
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => snapshot },
    { fetchWeather: async () => { secondCalls += 1; return snapshot; } },
  ] });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
  assert.equal(secondCalls, 0);
});

test('falls back after an eligible provider failure', async () => {
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => { throw new WeatherProviderError('upstream'); } },
    { fetchWeather: async () => { secondCalls += 1; return snapshot; } },
  ] });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
  assert.equal(secondCalls, 1);
});

test('rethrows invalid requests without calling another provider', async () => {
  const failure = new WeatherProviderError('invalid_request');
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => { throw failure; } },
    { fetchWeather: async () => { secondCalls += 1; return snapshot; } },
  ] });

  await assert.rejects(chain.fetchWeather(location), (error) => error === failure);
  assert.equal(secondCalls, 0);
});

test('attempts at most three providers by default', async () => {
  const calls = [0, 0, 0, 0];
  const providers = calls.map((_value, index) => ({
    fetchWeather: async () => {
      calls[index] += 1;
      throw new WeatherProviderError('availability');
    },
  }));

  await assert.rejects(createWeatherProviderChain({ providers }).fetchWeather(location));
  assert.deepEqual(calls, [1, 1, 1, 0]);
});

test('three default attempts still fit inside the mobile request budget', () => {
  // worker-weather-provider.ts aborts the whole request at 10000ms.
  assert.equal(weatherMaxAttempts * weatherAttemptTimeoutMs < 10000, true);
});

test('aborts a timed-out attempt and advances to the next provider', async () => {
  let aborted = false;
  const chain = createWeatherProviderChain({
    attemptTimeoutMs: 5,
    providers: [
      {
        fetchWeather: async (_location, signal) => new Promise(() => {
          signal.addEventListener('abort', () => { aborted = true; });
        }),
      },
      { fetchWeather: async () => snapshot },
    ],
  });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
  assert.equal(aborted, true);
});

test('throws a WeatherProviderError when every provider fails', async () => {
  const lastFailure = new WeatherProviderError('quota');
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => { throw new WeatherProviderError('upstream'); } },
    { fetchWeather: async () => { throw lastFailure; } },
  ] });

  await assert.rejects(
    chain.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error === lastFailure,
  );
});

test('throws availability when no providers are configured', async () => {
  await assert.rejects(
    createWeatherProviderChain({ providers: [] }).fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'availability',
  );
});

test('returns a successful snapshot without rewriting it', async () => {
  const chain = createWeatherProviderChain({
    providers: [{ fetchWeather: async () => snapshot }],
  });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
});

test('rejects an already-aborted outer signal without calling a provider', async () => {
  let providerCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const chain = createWeatherProviderChain({
    providers: [{
      fetchWeather: async () => { providerCalls += 1; return snapshot; },
    }],
  });

  await assert.rejects(
    chain.fetchWeather(location, controller.signal),
    (error) => error instanceof WeatherProviderError && error.kind === 'timeout',
  );
  assert.equal(providerCalls, 0);
});

test('production weather composition never includes the deterministic mock', () => {
  const withoutKey = createWeatherProviders({});
  const withKey = createWeatherProviders({ OPENWEATHER_API_KEY: 'key' });

  assert.equal(withoutKey.length, 1);
  assert.equal(withoutKey[0] instanceof OpenMeteoWeatherProvider, true);
  assert.equal(withoutKey.some((provider) => provider instanceof OpenWeatherWeatherProvider), false);
  assert.equal(withKey.length, 2);
  assert.equal(withoutKey.some((provider) => provider instanceof DeterministicMockWeatherProvider), false);
  assert.equal(withKey.some((provider) => provider instanceof DeterministicMockWeatherProvider), false);
});

test('WeatherKit heads the chain only when all four credentials are set', () => {
  const credentials = {
    WEATHERKIT_TEAM_ID: 'TEAM123456',
    WEATHERKIT_SERVICE_ID: 'com.example.weatherkit-client',
    WEATHERKIT_KEY_ID: 'KEY1234567',
    WEATHERKIT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
  };

  const full = createWeatherProviders({ ...credentials, OPENWEATHER_API_KEY: 'key' });
  assert.equal(full.length, 3);
  // The cap wrapper hides the instance, so the head is identified by what it displaced.
  assert.equal(full[1] instanceof OpenMeteoWeatherProvider, true);

  for (const missing of Object.keys(credentials)) {
    const partial = { ...credentials };
    delete partial[missing];
    const providers = createWeatherProviders(partial);
    assert.equal(providers.length, 1);
    assert.equal(providers[0] instanceof OpenMeteoWeatherProvider, true);
  }
});
