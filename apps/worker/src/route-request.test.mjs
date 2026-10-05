import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountDeleteHandler } from './account/account-delete-handler.ts';
import { createAiHandler } from './ai/ai-handler.ts';
import { createFeedbackHandler } from './feedback-handler.ts';
import { createPlaceSearchHandler } from './places/place-search-handler.ts';
import { createWeatherHandler } from './weather-handler.ts';

// Every route that reads a client body shares one preamble: method, per-IP rate limit,
// content type and a bounded read. This table holds the observable answers of all five
// routes to it, each in its own closed error code.
const unusedDependencies = {
  provider: {
    fetchWeather: async () => { throw new Error('not reached'); },
    search: async () => { throw new Error('not reached'); },
  },
  providers: [],
  database: { prepare() { throw new Error('not reached'); } },
  verifier: async () => { throw new Error('not reached'); },
  admin: {},
  revoker: async () => {},
};

const routes = [
  {
    name: 'weather v1',
    path: '/v1/weather',
    limiter: 'weather_burst',
    unavailable: 'weather_unavailable',
    create: (rateLimiter) => createWeatherHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'weather v2',
    path: '/v2/weather',
    limiter: 'weather_burst',
    unavailable: 'weather_unavailable',
    create: (rateLimiter) => createWeatherHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'ai recommend v1',
    path: '/v1/ai/recommend',
    limiter: 'ai_recommend_burst',
    unavailable: 'ai_unavailable',
    create: (rateLimiter) => createAiHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'ai recommend v2',
    path: '/v2/ai/recommend',
    limiter: 'ai_recommend_burst',
    unavailable: 'ai_unavailable',
    create: (rateLimiter) => createAiHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'place search',
    path: '/v1/places/search',
    limiter: 'places_burst',
    unavailable: 'places_unavailable',
    create: (rateLimiter) => createPlaceSearchHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'feedback',
    path: '/v1/feedback',
    limiter: 'feedback_burst',
    unavailable: 'unavailable',
    create: (rateLimiter) => createFeedbackHandler({ ...unusedDependencies, rateLimiter }),
  },
  {
    name: 'account delete',
    path: '/v1/account/delete',
    limiter: 'account_delete_burst',
    unavailable: 'unavailable',
    create: (rateLimiter) => createAccountDeleteHandler({ ...unusedDependencies, rateLimiter }),
  },
];

const allowed = { limit: async () => ({ success: true }) };
const jsonHeaders = {
  'content-type': 'application/json',
  // Account deletion checks the bearer token before it looks at the content type.
  authorization: 'Bearer sentinel.token',
};

function call(route, { method = 'POST', headers = jsonHeaders, body = '{}' } = {}) {
  return new Request(`https://worker.test${route.path}`, {
    method,
    headers,
    ...(method === 'POST' ? { body } : {}),
  });
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code } });
}

for (const route of routes) {
  test(`${route.name}: a method other than POST is 405 with Allow`, async () => {
    const response = await route.create(allowed)(call(route, { method: 'GET' }));
    await assertError(response, 405, 'method_not_allowed');
    assert.equal(response.headers.get('allow'), 'POST');
  });

  test(`${route.name}: a denied limiter is 429 with Retry-After and one rate_limited log`, async (t) => {
    const warnings = [];
    t.mock.method(console, 'warn', (entry) => warnings.push(entry));
    const response = await route.create({ limit: async () => ({ success: false }) })(call(route));
    await assertError(response, 429, 'rate_limited');
    assert.equal(response.headers.get('retry-after'), '60');
    assert.deepEqual(warnings, [{ event: 'rate_limited', route: route.path, limiter: route.limiter }]);
  });

  test(`${route.name}: a failing limiter answers the route's own unavailable code`, async (t) => {
    const warnings = [];
    t.mock.method(console, 'warn', (entry) => warnings.push(entry));
    const response = await route.create({
      limit: async () => { throw new Error('binding down: secret'); },
    })(call(route));
    await assertError(response, 503, route.unavailable);
    assert.deepEqual(warnings, [{
      event: 'rate_limiter_error', route: route.path, limiter: route.limiter,
    }]);
  });

  test(`${route.name}: a body that is not JSON is invalid_request`, async () => {
    const handle = route.create(allowed);
    await assertError(await handle(call(route, {
      headers: { ...jsonHeaders, 'content-type': 'text/plain' },
    })), 400, 'invalid_request');
    await assertError(await handle(call(route, { body: 'not json' })), 400, 'invalid_request');
  });

  test(`${route.name}: an oversized body is invalid_request`, async () => {
    const body = JSON.stringify({ padding: 'a'.repeat(100_000) });
    await assertError(
      await route.create(allowed)(call(route, { body })),
      400,
      'invalid_request',
    );
  });
}

test('account delete refuses a missing token before it looks at the content type', async () => {
  const route = routes.at(-1);
  await assertError(await route.create(allowed)(call(route, {
    headers: { 'content-type': 'text/plain' },
  })), 401, 'unauthorized');
});
