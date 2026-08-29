import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveWorkerBaseUrl, WorkerBaseUrlConfigurationError } from '../../config/worker-base-url.ts';
import { getManualLocation } from './data/manual-location-catalog.ts';
import {
  WorkerWeatherProvider,
  WorkerWeatherProviderError,
} from './data/worker-weather-provider.ts';

const location = getManualLocation('sample.istanbul');
const fetchedAt = '2026-08-01T09:30:00.000Z';
const measurements = {
  temperatureCelsius: 16,
  apparentTemperatureCelsius: 15,
  condition: 'rain',
  precipitationProbability: 0.55,
  windSpeedMetersPerSecond: 4.2,
  humidity: 0.72,
  uvIndex: 3,
};
const successBody = {
  data: {
    timeZone: location.timeZone,
    fetchedAt,
    origin: { kind: 'sample', sourceId: 'sample' },
    current: { observedAt: fetchedAt, ...measurements },
    minimumTemperatureCelsius: 12,
    maximumTemperatureCelsius: 19,
    hourly: [{ forecastAt: fetchedAt, ...measurements }],
  },
};

function jsonResponse(body, init = {}) {
  return Response.json(body, init);
}

test('posts only the shared location request and restores local identity while mapping success', async () => {
  let request;
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://127.0.0.1:8788/',
    fetch: async (input, init) => {
      request = { input, init };
      return jsonResponse(successBody);
    },
  });

  const snapshot = await provider.fetchSnapshot(location);

  assert.equal(request.input, 'http://127.0.0.1:8788/v1/weather');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(request.init.body), {
    latitudeE2: location.coordinates.latitudeE2,
    longitudeE2: location.coordinates.longitudeE2,
    timeZone: location.timeZone,
  });
  assert.equal(request.init.body.includes('locationKey'), false);
  assert.equal(request.init.body.includes('catalogId'), false);
  assert.equal(snapshot.locationKey, location.locationKey);
  assert.equal(snapshot.timeZone, location.timeZone);
  assert.deepEqual(snapshot.origin, {
    kind: 'sample',
    sourceId: 'sample',
  });
  assert.deepEqual(snapshot.current, successBody.data.current);
  assert.deepEqual(snapshot.hourly, successBody.data.hourly);
});

test('carries through a live provider sourceId instead of hard-coding it', async () => {
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://127.0.0.1:8788',
    fetch: async () => jsonResponse({
      data: { ...successBody.data, origin: { kind: 'live', sourceId: 'open-meteo' } },
    }),
  });

  const snapshot = await provider.fetchSnapshot(location);

  assert.deepEqual(snapshot.origin, { kind: 'live', sourceId: 'open-meteo' });
});

test('classifies stable API errors as service failures before exposing their code', async () => {
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://127.0.0.1:8788',
    fetch: async () => jsonResponse({ error: { code: 'weather_unavailable' } }, { status: 503 }),
  });

  await assert.rejects(
    () => provider.fetchSnapshot(location),
    (error) => error instanceof WorkerWeatherProviderError
      && error.kind === 'service'
      && error.code === 'weather_unavailable',
  );
});

test('classifies a rate_limited response as a distinct rate-limited failure kind', async () => {
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://127.0.0.1:8788',
    fetch: async () => jsonResponse({ error: { code: 'rate_limited' } }, { status: 429 }),
  });

  await assert.rejects(
    () => provider.fetchSnapshot(location),
    (error) => error instanceof WorkerWeatherProviderError
      && error.kind === 'rate-limited'
      && error.code === 'rate_limited',
  );
});

test('classifies malformed success, malformed error, and mismatched time zone responses', async () => {
  const cases = [
    async () => jsonResponse({ data: { ...successBody.data, hourly: [] } }),
    async () => jsonResponse({ error: { code: 'provider_secret' } }, { status: 503 }),
    async () => jsonResponse({
      data: { ...successBody.data, timeZone: 'Europe/London' },
    }),
  ];

  for (const fetch of cases) {
    const provider = new WorkerWeatherProvider({ baseUrl: 'http://worker.test', fetch });
    await assert.rejects(
      () => provider.fetchSnapshot(location),
      (error) => error instanceof WorkerWeatherProviderError
        && error.kind === 'invalid-response'
        && error.code === null,
    );
  }

});

test('classifies a rejected fetch as a network failure without leaking its details', async () => {
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://worker.test',
    fetch: async () => { throw new Error('offline details'); },
  });
  await assert.rejects(
    () => provider.fetchSnapshot(location),
    (error) => error instanceof WorkerWeatherProviderError
      && error.kind === 'network'
      && error.code === null
      && !error.message.includes('offline details'),
  );
});

test('aborts a stuck request as a network failure and allows a subsequent retry', { timeout: 250 }, async () => {
  let attempts = 0;
  let firstSignal;
  const provider = new WorkerWeatherProvider({
    baseUrl: 'http://worker.test',
    requestTimeoutMilliseconds: 10,
    fetch: async (_input, init) => {
      attempts += 1;
      if (attempts > 1) return jsonResponse(successBody);
      firstSignal = init.signal;
      return new Promise((_resolve, reject) => {
        firstSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  });

  await assert.rejects(
    () => provider.fetchSnapshot(location),
    (error) => error instanceof WorkerWeatherProviderError
      && error.kind === 'network'
      && error.code === null,
  );
  assert.equal(firstSignal instanceof AbortSignal, true);
  assert.equal(firstSignal.aborted, true);
  assert.equal((await provider.fetchSnapshot(location)).fetchedAt, fetchedAt);
  assert.equal(attempts, 2);
});

test('uses platform-aware local development URLs and requires an explicit production URL', () => {
  assert.equal(resolveWorkerBaseUrl({ isDevelopment: true, platform: 'ios' }), 'http://127.0.0.1:8788');
  assert.equal(resolveWorkerBaseUrl({ isDevelopment: true, platform: 'android' }), 'http://10.0.2.2:8788');
  assert.equal(resolveWorkerBaseUrl({
    configuredUrl: 'https://weather.example.com/',
    isDevelopment: false,
    platform: 'ios',
  }), 'https://weather.example.com');
  assert.throws(
    () => resolveWorkerBaseUrl({ isDevelopment: false, platform: 'ios' }),
    WorkerBaseUrlConfigurationError,
  );
  assert.throws(
    () => resolveWorkerBaseUrl({
      configuredUrl: 'https://user:secret@weather.example.com/path',
      isDevelopment: false,
      platform: 'ios',
    }),
    WorkerBaseUrlConfigurationError,
  );
  assert.throws(
    () => resolveWorkerBaseUrl({
      configuredUrl: 'http://weather.example.com',
      isDevelopment: false,
      platform: 'ios',
    }),
    WorkerBaseUrlConfigurationError,
  );
});
