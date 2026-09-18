import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiProbeV1SuccessSchema,
  weatherV1SuccessSchema,
  weatherV2SuccessSchema,
} from '@kuyara/contracts';

import { createAiHandler } from './ai/ai-handler.ts';
import { createProbeHandler } from './ai/probe-handler.ts';
import { createRouter } from './router.ts';
import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';

const fixedNow = '2026-08-01T09:30:00.000Z';
const weatherBody = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};

// A fake `ExecutionContext`; the router only forwards it to the handlers.
function fakeContext() {
  const pending = [];
  return { pending, waitUntil(promise) { pending.push(promise); } };
}

function router({ aiReady = true, providers = [] } = {}) {
  const route = createRouter({
    placeSearchHandler: async () => Response.json({ data: { places: [], attribution: ['open-meteo', 'geonames'] } }),
    weatherHandler: createWeatherHandler({
      provider: new DeterministicMockWeatherProvider({ now: () => fixedNow }),
    }),
    aiHandler: createAiHandler({ providers }),
    probeHandler: createProbeHandler({
      providers,
      rateLimiter: { limit: async () => ({ success: true }) },
      dailyCounter: { get: async () => 0, increment: async () => {} },
      now: () => new Date(fixedNow),
    }),
    aiReady,
  });
  return (request, ctx = fakeContext()) => route(request, ctx);
}

function validAiOutput() {
  return { data: { picks: [
    { optionId: 'probe-casual', archetypeId: 'weekend_relaxed' },
    { optionId: 'probe-smart', archetypeId: 'smart_casual' },
    { optionId: 'probe-formal', archetypeId: 'office_ready' },
  ] } };
}

async function assertJson(response, status, body) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), body);
}

test('GET health returns ok and other methods return Allow GET', async () => {
  const handle = router();
  await assertJson(
    await handle(new Request('http://localhost/v1/health')),
    200,
    { data: { status: 'ok' } },
  );
  const response = await handle(new Request('http://localhost/v1/health', { method: 'POST' }));
  assert.equal(response.headers.get('allow'), 'GET');
  await assertJson(response, 405, { error: { code: 'method_not_allowed' } });
});

test('AI readiness reports plain configuration state without calling a provider', async () => {
  let providerCalls = 0;
  const spyProvider = {
    async generateOutfits() {
      providerCalls += 1;
      throw new Error('readiness must not call providers');
    },
  };
  await assertJson(
    await router({ aiReady: true, providers: [spyProvider] })(
      new Request('http://localhost/v1/ai/ready'),
    ),
    200,
    { data: { status: 'ready' } },
  );
  await assertJson(
    await router({ aiReady: false, providers: [] })(
      new Request('http://localhost/v1/ai/ready'),
    ),
    200,
    { data: { status: 'not_configured' } },
  );
  assert.equal(providerCalls, 0);
});

test('non-GET readiness returns method_not_allowed with Allow GET', async () => {
  const response = await router()(
    new Request('http://localhost/v1/ai/ready', { method: 'POST' }),
  );
  assert.equal(response.headers.get('allow'), 'GET');
  await assertJson(response, 405, { error: { code: 'method_not_allowed' } });
});

test('POST AI probe routes to the probe handler', async () => {
  const response = await router({ providers: [{
    id: 'workers-ai',
    model: '@cf/example/model',
    generateOutfits: async () => validAiOutput(),
  }] })(new Request('http://localhost/v1/ai/probe', { method: 'POST' }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(aiProbeV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.status, 'ok');
});

test('GET AI probe returns method_not_allowed with Allow POST', async () => {
  const response = await router()(new Request('http://localhost/v1/ai/probe'));
  assert.equal(response.headers.get('allow'), 'POST');
  await assertJson(response, 405, { error: { code: 'method_not_allowed' } });
});

test('unknown paths return not_found for GET and POST', async () => {
  const handle = router();
  for (const method of ['GET', 'POST']) {
    await assertJson(
      await handle(new Request('http://localhost/v1/unknown', { method })),
      404,
      { error: { code: 'not_found' } },
    );
  }
});

test('weather POST still succeeds and weather GET still owns its 405 response', async () => {
  const handle = router();
  const successResponse = await handle(new Request('http://localhost/v1/weather', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(weatherBody),
  }));
  const body = await successResponse.json();
  assert.equal(successResponse.status, 200);
  assert.equal(successResponse.headers.get('cache-control'), 'no-store');
  assert.equal(weatherV1SuccessSchema.safeParse(body).success, true);

  const methodResponse = await handle(new Request('http://localhost/v1/weather'));
  assert.equal(methodResponse.headers.get('allow'), 'POST');
  await assertJson(methodResponse, 405, { error: { code: 'method_not_allowed' } });
});

test('the weather route is served at both versions by the same handler', async () => {
  const handle = router();
  const response = await handle(new Request('http://localhost/v2/weather', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(weatherBody),
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(weatherV2SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.daily.length, 7);

  const methodResponse = await handle(new Request('http://localhost/v2/weather'));
  assert.equal(methodResponse.headers.get('allow'), 'POST');
  await assertJson(methodResponse, 405, { error: { code: 'method_not_allowed' } });
});

test('the router forwards the execution context to every route handler', async () => {
  const seen = [];
  const handler = (name) => async (_request, ctx) => {
    seen.push([name, ctx]);
    return new Response(null, { status: 204 });
  };
  const route = createRouter({
    placeSearchHandler: handler('places'),
    weatherHandler: handler('weather'),
    aiHandler: handler('ai'),
    probeHandler: handler('probe'),
    aiReady: true,
  });
  const ctx = fakeContext();
  const paths = ['/v1/places/search', '/v1/weather', '/v2/weather', '/v1/ai/recommend', '/v1/ai/probe'];
  for (const path of paths) {
    await route(new Request(`http://localhost${path}`, { method: 'POST' }), ctx);
  }
  assert.deepEqual(seen, [
    ['places', ctx], ['weather', ctx], ['weather', ctx], ['ai', ctx], ['probe', ctx],
  ]);
});
