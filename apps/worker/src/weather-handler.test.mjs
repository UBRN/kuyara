import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherV1ErrorSchema, weatherV1SuccessSchema } from '@kuyara/contracts';

import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';
import { WeatherProviderError } from './weather/weather-provider-error.ts';

const fixedNow = '2026-08-01T09:30:00.000Z';
const validBody = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};
const permissiveRateLimiter = { limit: async () => ({ success: true }) };

function request(path = '/v1/weather', options = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validBody),
    ...options,
  });
}

function mockHandler() {
  return createWeatherHandler({
    provider: new DeterministicMockWeatherProvider({ now: () => fixedNow }),
    rateLimiter: permissiveRateLimiter,
  });
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body, { error: { code } });
  assert.equal(weatherV1ErrorSchema.safeParse(body).success, true);
}

test('returns deterministic, contract-valid sample weather without echoing location data', async () => {
  const handler = mockHandler();
  const firstResponse = await handler(request());
  const secondResponse = await handler(request());
  const first = await firstResponse.json();
  const second = await secondResponse.json();

  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get('cache-control'), 'no-store');
  assert.equal(weatherV1SuccessSchema.safeParse(first).success, true);
  assert.equal(first.data.origin.kind, 'sample');
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes('latitudeE2'), false);
  assert.equal(JSON.stringify(first).includes('longitudeE2'), false);
});

test('maps malformed JSON, schema failures, and missing JSON content type to invalid_request', async () => {
  const handler = mockHandler();
  assert.equal((await handler(request('/v1/weather', {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }))).status, 200);
  await assertError(await handler(request('/v1/weather', { body: '{' })), 400, 'invalid_request');
  await assertError(await handler(request('/v1/weather', {
    body: JSON.stringify({ ...validBody, latitudeE2: 4100.5 }),
  })), 400, 'invalid_request');
  await assertError(await handler(request('/v1/weather', {
    headers: { 'content-type': 'application/jsonp' },
  })), 400, 'invalid_request');
  await assertError(await handler(request('/v1/weather', {
    headers: { 'content-type': 'text/plain' },
  })), 400, 'invalid_request');
});

test('maps wrong methods and routes to stable errors', async () => {
  const handler = mockHandler();
  const methodResponse = await handler(new Request('http://localhost/v1/weather', { method: 'GET' }));
  assert.equal(methodResponse.headers.get('allow'), 'POST');
  await assertError(methodResponse, 405, 'method_not_allowed');
  await assertError(await handler(request('/v1/unknown')), 404, 'not_found');
});

test('maps provider failures to weather_unavailable without leaking failure detail', async () => {
  const handler = createWeatherHandler({
    provider: { fetchWeather: async () => { throw new Error('secret provider detail'); } },
    rateLimiter: permissiveRateLimiter,
  });
  const response = await handler(request());
  await assertError(response, 503, 'weather_unavailable');
});

test('validates provider output before returning it', async () => {
  const handler = createWeatherHandler({
    rateLimiter: permissiveRateLimiter,
    provider: {
      fetchWeather: async () => ({
        timeZone: 'Europe/Istanbul',
        fetchedAt: fixedNow,
        provenance: 'sample',
        sourceId: 'sample',
        current: {
          observedAt: fixedNow,
          temperatureCelsius: 16,
          apparentTemperatureCelsius: 15,
          condition: 'rain',
          precipitationProbability: 2,
          windSpeedMetersPerSecond: 4,
          humidity: 0.7,
          uvIndex: 3,
        },
        minimumTemperatureCelsius: 12,
        maximumTemperatureCelsius: 19,
        hourly: [],
      }),
    },
  });
  await assertError(await handler(request()), 503, 'weather_unavailable');

  const malformedHandler = createWeatherHandler({
    provider: { fetchWeather: async () => null },
    rateLimiter: permissiveRateLimiter,
  });
  await assertError(await malformedHandler(request()), 503, 'weather_unavailable');
});

test('returns rate_limited with Retry-After when the limiter denies the request', async () => {
  let providerCalls = 0;
  const handler = createWeatherHandler({
    provider: { fetchWeather: async () => { providerCalls += 1; return null; } },
    rateLimiter: { limit: async ({ key }) => {
      assert.equal(key, 'weather:203.0.113.7');
      return { success: false };
    } },
  });
  const response = await handler(request('/v1/weather', {
    headers: {
      'cf-connecting-ip': '203.0.113.7',
      'content-type': 'application/json',
    },
  }));

  assert.equal(response.headers.get('retry-after'), '60');
  await assertError(response, 429, 'rate_limited');
  assert.equal(providerCalls, 0);
});

test('checks the rate limit before parsing a malformed body', async () => {
  const handler = createWeatherHandler({
    provider: { fetchWeather: async () => null },
    rateLimiter: { limit: async () => ({ success: false }) },
  });

  await assertError(
    await handler(request('/v1/weather', { body: '{' })),
    429,
    'rate_limited',
  );
});

test('maps WeatherProviderError to sanitized weather_unavailable', async () => {
  const handler = createWeatherHandler({
    provider: { fetchWeather: async () => { throw new WeatherProviderError('auth'); } },
    rateLimiter: permissiveRateLimiter,
  });
  const response = await handler(request());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, { error: { code: 'weather_unavailable' } });
  assert.equal(JSON.stringify(body).includes('auth'), false);
});
