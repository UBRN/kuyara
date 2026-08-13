import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherV1SuccessSchema } from '@kuyara/contracts';

import { createAiHandler } from './ai/ai-handler.ts';
import { createRouter } from './router.ts';
import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';

const fixedNow = '2026-08-01T09:30:00.000Z';
const weatherBody = {
  latitudeE2: 4101,
  longitudeE2: 2898,
  timeZone: 'Europe/Istanbul',
};

function router({ aiReady = true, providers = [] } = {}) {
  return createRouter({
    weatherHandler: createWeatherHandler({
      provider: new DeterministicMockWeatherProvider({ now: () => fixedNow }),
    }),
    aiHandler: createAiHandler({ providers }),
    aiReady,
  });
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
