import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DailyCounter, type DailyCounterNamespace } from '../daily-counter.ts';
import { createWeatherProviders } from '../index.ts';
import { openWeatherDailyCallLimit, weatherKitDailyCallLimit } from './daily-capped-weather-provider.ts';
import { DeterministicMockWeatherProvider } from './__tests__/mock-weather-provider.ts';
import { OpenMeteoWeatherProvider } from './open-meteo-weather-provider.ts';
import { OpenWeatherWeatherProvider } from './openweather-weather-provider.ts';
import type { ProviderWeatherSnapshot } from './weather-provider.ts';
import {
  createWeatherProviderChain,
  weatherAttemptTimeoutMs,
  weatherMaxAttempts,
} from './weather-provider-chain.ts';
import { WeatherProviderError } from './weather-provider-error.ts';
import { WeatherKitWeatherProvider } from './weatherkit-weather-provider.ts';

// Keep expected failed-attempt reports out of the test output while checking them below.
const warning = mock.method(console, 'warn', () => {});

const location = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const snapshot: ProviderWeatherSnapshot = {
  timeZone: 'Europe/Istanbul',
  fetchedAt: '2026-08-29T09:30:00.000Z',
  provenance: 'live',
  sourceId: 'open-meteo',
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
  daily: [],
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
  const warningsBefore = warning.mock.calls.length;
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => { throw new WeatherProviderError('upstream'); } },
    { fetchWeather: async () => { secondCalls += 1; return snapshot; } },
  ] });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
  assert.equal(secondCalls, 1);
  assert.deepEqual(warning.mock.calls.slice(warningsBefore).map(({ arguments: args }) => args), [[{
    event: 'weather_provider_attempt_failed',
    attempt: 1,
    kind: 'upstream',
  }]]);
});

test('rethrows invalid requests without calling another provider', async () => {
  const warningsBefore = warning.mock.calls.length;
  const failure = new WeatherProviderError('invalid_request');
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    { fetchWeather: async () => { throw failure; } },
    { fetchWeather: async () => { secondCalls += 1; return snapshot; } },
  ] });

  await assert.rejects(chain.fetchWeather(location), (error) => error === failure);
  assert.equal(secondCalls, 0);
  assert.deepEqual(warning.mock.calls.slice(warningsBefore).map(({ arguments: args }) => args), [[{
    event: 'weather_provider_attempt_failed',
    attempt: 1,
    kind: 'invalid_request',
  }]]);
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
        fetchWeather: async (_location, signal) => new Promise<ProviderWeatherSnapshot>(() => {
          signal?.addEventListener('abort', () => { aborted = true; });
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

// The capped providers are composed only with the DAILY_COUNTERS binding; a stub namespace
// whose object always answers is enough to see them composed.
const dailyCounters: DailyCounterNamespace = {
  idFromName: (name: string) => name,
  get: () => ({ fetch: async () => Response.json({ count: 1 }) }),
};

test('production weather composition never includes the deterministic mock', () => {
  const withoutKey = createWeatherProviders({ DAILY_COUNTERS: dailyCounters });
  const withKey = createWeatherProviders({ DAILY_COUNTERS: dailyCounters, OPENWEATHER_API_KEY: 'key' });

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

  const full = createWeatherProviders({
    ...credentials,
    DAILY_COUNTERS: dailyCounters,
    OPENWEATHER_API_KEY: 'key',
  });
  assert.equal(full.length, 3);
  // The cap wrapper hides the instance, so the head is identified by what it displaced.
  assert.equal(full[1] instanceof OpenMeteoWeatherProvider, true);

  for (const missing of Object.keys(credentials)) {
    const remaining = Object.fromEntries(
      Object.entries(credentials).filter(([name]) => name !== missing),
    );
    const providers = createWeatherProviders({ ...remaining, DAILY_COUNTERS: dailyCounters });
    assert.equal(providers.length, 1);
    assert.equal(providers[0] instanceof OpenMeteoWeatherProvider, true);
  }
});

test('without DAILY_COUNTERS only the uncapped Open-Meteo is composed', (t) => {
  t.mock.method(console, 'warn', () => {});
  const providers = createWeatherProviders({
    WEATHERKIT_TEAM_ID: 'TEAM123456',
    WEATHERKIT_SERVICE_ID: 'com.example.weatherkit-client',
    WEATHERKIT_KEY_ID: 'KEY1234567',
    WEATHERKIT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
    OPENWEATHER_API_KEY: 'key',
  });
  assert.equal(providers.length, 1);
  assert.equal(providers[0] instanceof OpenMeteoWeatherProvider, true);
});

test('advances past a WeatherKit 404 and returns the next provider result', async () => {
  const weatherKit = new WeatherKitWeatherProvider({
    token: async () => 'token',
    fetch: async () => new Response('no data for this location', { status: 404 }),
  });
  let nextCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    weatherKit,
    { fetchWeather: async () => { nextCalls += 1; return snapshot; } },
    { fetchWeather: async () => { throw new Error('third provider must not run'); } },
  ] });

  assert.strictEqual(await chain.fetchWeather(location), snapshot);
  assert.equal(nextCalls, 1);
});

test('a WeatherKit 404 is answered by one call per provider, never a retry loop', async () => {
  let weatherKitCalls = 0;
  const weatherKit = new WeatherKitWeatherProvider({
    token: async () => 'token',
    fetch: async () => {
      weatherKitCalls += 1;
      return new Response('no data for this location', { status: 404 });
    },
  });
  let secondCalls = 0;
  const chain = createWeatherProviderChain({ providers: [
    weatherKit,
    { fetchWeather: async () => {
      secondCalls += 1;
      throw new WeatherProviderError('upstream');
    } },
  ] });

  await assert.rejects(
    chain.fetchWeather(location),
    (error) => error instanceof WeatherProviderError && error.kind === 'upstream',
  );
  assert.equal(weatherKitCalls, 1);
  assert.equal(secondCalls, 1);
});

// One Durable Object per counter name running the real `DailyCounter` class over a Map, so
// the composed providers meet the same atomic increment they get in production.
function realDailyCounters(): DailyCounterNamespace<string> {
  const objects = new Map<string, DailyCounter>();
  return {
    idFromName: (name: string) => name,
    get(name: string) {
      let object = objects.get(name);
      if (!object) {
        const map = new Map<string, unknown>();
        object = new DailyCounter({ storage: {
          async get<T>(key: string) { return map.get(key) as T | undefined; },
          async put<T>(key: string, value: T) { map.set(key, value); },
          async delete(key: string) { return map.delete(key); },
          async list<T>() { return new Map(map) as Map<string, T>; },
          async setAlarm() {},
        } }, {});
        objects.set(name, object);
      }
      const counter = object;
      return {
        fetch: (input: Request | string, init?: RequestInit) => counter.fetch(new Request(input, init)),
      };
    },
  };
}

async function seedCounter(
  counters: DailyCounterNamespace<string>,
  name: string,
  key: string,
  times: number,
) {
  const stub = counters.get(counters.idFromName(name));
  for (let index = 0; index < times; index += 1) {
    await stub.fetch(`https://daily-counter/increment?key=${encodeURIComponent(key)}`, { method: 'POST' });
  }
}

async function throwawayWeatherKitPrivateKey() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  return (pkcs8.toString('base64').match(/.{1,64}/gu) ?? []).join('\n');
}

// The wrapper is unit tested with an injected counter; this pins what production composes:
// each capped provider's own counter name, source slug and limit. A swapped constant, a
// shared counter or a dropped wrapper would let a quota-limited provider run past its cap.
test('the composed WeatherKit and OpenWeather providers stop calling upstream at their own daily limits', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-15T10:00:00.000Z') });
  const counters = realDailyCounters();
  const providers = createWeatherProviders({
    DAILY_COUNTERS: counters,
    OPENWEATHER_API_KEY: 'key',
    WEATHERKIT_TEAM_ID: 'TEAM123456',
    WEATHERKIT_SERVICE_ID: 'com.example.weatherkit-client',
    WEATHERKIT_KEY_ID: 'KEY1234567',
    WEATHERKIT_PRIVATE_KEY: await throwawayWeatherKitPrivateKey(),
  });
  const [weatherKit, , openWeather] = providers;
  assert.equal(providers.length, 3);

  const realFetch = globalThis.fetch;
  const hosts: string[] = [];
  globalThis.fetch = async (input) => {
    hosts.push(new URL(input instanceof Request ? input.url : input).host);
    throw new Error('network disabled in tests');
  };
  const signal = new AbortController().signal;
  const isQuota = (error: unknown) => error instanceof WeatherProviderError && error.kind === 'quota';
  try {
    // Exhaust OpenWeather only: its own counter, its own limit.
    await seedCounter(counters, 'weather:openweather', 'weather:openweather:2026-09-15', openWeatherDailyCallLimit - 1);
    await assert.rejects(openWeather.fetchWeather(location, signal), (error) => !isQuota(error));
    assert.deepEqual(hosts, ['api.openweathermap.org'], 'the attempt that lands on the limit still runs');
    hosts.length = 0;
    await assert.rejects(openWeather.fetchWeather(location, signal), isQuota);
    assert.deepEqual(hosts, [], 'past openWeatherDailyCallLimit no upstream call is made');

    // WeatherKit is a separate counter: OpenWeather's exhaustion leaves it callable.
    await assert.rejects(weatherKit.fetchWeather(location, signal), (error) => !isQuota(error));
    assert.deepEqual(hosts, ['weatherkit.apple.com']);
    hosts.length = 0;

    // Its own limit is the WeatherKit one: seed to one below it, one more call runs, the next does not.
    await seedCounter(counters, 'weather:weatherkit', 'weather:weatherkit:2026-09-15', weatherKitDailyCallLimit - 2);
    await assert.rejects(weatherKit.fetchWeather(location, signal), (error) => !isQuota(error));
    assert.deepEqual(hosts, ['weatherkit.apple.com']);
    hosts.length = 0;
    await assert.rejects(weatherKit.fetchWeather(location, signal), isQuota);
    assert.deepEqual(hosts, [], 'past weatherKitDailyCallLimit no upstream call is made');
  } finally {
    globalThis.fetch = realFetch;
  }
});
