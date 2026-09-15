import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { DailyCounter } from './daily-counter.ts';
import worker, { buildRouter } from './index.ts';

// The composition logs missing bindings and the chain logs failed attempts; keep that out
// of the test output.
mock.method(console, 'warn', () => {});

// The memo the worker keeps is per isolate and keyed on the first `env` it sees, so the
// default-export tests use exactly one `env`: a second, different `env` would be ignored
// and the assertion would be measuring the wrong isolate. The composition tests further
// down call `buildRouter` directly, once per `env`.

async function weatherKitPrivateKeyPem() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  // The token provider treats the PEM markers as optional, so the bare base64 body of a
  // throwaway key generated at test time is valid key material.
  return pkcs8.toString('base64').match(/.{1,64}/gu).join('\n');
}

const probeAnswer = {
  data: {
    picks: [
      { optionId: 'probe-casual', archetypeId: 'weekend_relaxed' },
      { optionId: 'probe-smart', archetypeId: 'smart_casual' },
      { optionId: 'probe-formal', archetypeId: 'office_ready' },
    ],
  },
};

let aiRunCalls = 0;

const openLimiter = { limit: async () => ({ success: true }) };

// An in-memory Durable Object namespace running the real `DailyCounter` class, one object
// per counter name, with a Map for storage.
function fakeDailyCounters() {
  const objects = new Map();
  return {
    idFromName(name) { return { name }; },
    get(id) {
      let object = objects.get(id.name);
      if (!object) {
        const map = new Map();
        object = new DailyCounter({ storage: {
          async get(key) { return map.get(key); },
          async put(key, value) { map.set(key, value); },
          async delete(key) { return map.delete(key); },
          async list() { return new Map(map); },
        } }, {});
        objects.set(id.name, object);
      }
      return { fetch: (input, init) => object.fetch(new Request(input, init)) };
    },
  };
}

function fakeContext() {
  return { waitUntil() {} };
}

const boundEnv = {
  DAILY_COUNTERS: fakeDailyCounters(),
  AI_PROBE_RATE_LIMIT: openLimiter,
  AI_RECOMMEND_RATE_LIMIT: openLimiter,
  WEATHER_RATE_LIMIT: openLimiter,
};

const env = {
  ...boundEnv,
  WORKERS_AI_MODELS: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  AI: {
    async run() {
      aiRunCalls += 1;
      return { response: probeAnswer };
    },
  },
  WEATHERKIT_TEAM_ID: 'TEAM123456',
  WEATHERKIT_SERVICE_ID: 'com.example.weather',
  WEATHERKIT_KEY_ID: 'KEY1234567',
  WEATHERKIT_PRIVATE_KEY: await weatherKitPrivateKeyPem(),
};

function probeRequest() {
  return new Request('https://worker.test/v1/ai/probe', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.10' },
  });
}

function weatherRequest() {
  return new Request('https://worker.test/v1/weather', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      latitudeE2: 4101,
      longitudeE2: 2897,
      timeZone: 'Europe/Istanbul',
    }),
  });
}

test('the probe result cache survives across requests', async () => {
  const first = await worker.fetch(probeRequest(), env, fakeContext());
  const second = await worker.fetch(probeRequest(), env, fakeContext());

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).data.status, 'ok');
  assert.equal((await second.json()).data.status, 'ok');
  assert.equal(
    aiRunCalls,
    1,
    'the second probe request must be served from the 60 s cache, so the AI provider is '
    + 'reached once; composing the probe handler inside fetch throws that cache away.',
  );
});

test('the WeatherKit key is imported and the JWT signed once per isolate', async () => {
  const realFetch = globalThis.fetch;
  const realImportKey = globalThis.crypto.subtle.importKey;
  const realSign = globalThis.crypto.subtle.sign;
  let importKeyCalls = 0;
  let signCalls = 0;
  let upstreamCalls = 0;

  // No network: every upstream call fails, which is an eligible failure, so the chain
  // simply exhausts itself and the route answers 503. The token work still happened.
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('network disabled in tests');
  };
  globalThis.crypto.subtle.importKey = function importKey(...args) {
    importKeyCalls += 1;
    return realImportKey.apply(this, args);
  };
  globalThis.crypto.subtle.sign = function sign(...args) {
    signCalls += 1;
    return realSign.apply(this, args);
  };

  try {
    const first = await worker.fetch(weatherRequest(), env, fakeContext());
    const second = await worker.fetch(weatherRequest(), env, fakeContext());
    assert.equal(first.status, 503);
    assert.equal(second.status, 503);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.crypto.subtle.importKey = realImportKey;
    globalThis.crypto.subtle.sign = realSign;
  }

  assert.ok(upstreamCalls > 0, 'the chain must have reached at least one upstream provider');
  assert.equal(
    importKeyCalls,
    1,
    'the PKCS8 WeatherKit key must be imported once per isolate; composing the token '
    + 'provider inside fetch re-imports it on every request.',
  );
  assert.equal(
    signCalls,
    1,
    'the ES256 JWT is valid for an hour, so a second request inside that hour must reuse '
    + 'the cached token instead of signing again.',
  );
});

function placeSearchRequest() {
  return new Request('https://worker.test/v1/places/search', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: 'Istanbul', language: 'en', limit: 5 }),
  });
}

function recommendRequest() {
  return new Request('https://worker.test/v1/ai/recommend', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    body: '{}',
  });
}

async function assertOffline(response, code) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code } });
}

// Every route that spends provider quota goes offline, with its own code, when a binding it
// needs is missing; the binding-free routes are unaffected.
test('a missing WEATHER_RATE_LIMIT takes weather and place search offline', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const { WEATHER_RATE_LIMIT: _omitted, ...withoutLimiter } = boundEnv;
  const route = buildRouter(withoutLimiter);
  await assertOffline(await route(weatherRequest(), fakeContext()), 'weather_unavailable');
  await assertOffline(await route(placeSearchRequest(), fakeContext()), 'places_unavailable');
  assert.equal((await route(new Request('https://worker.test/v1/health'), fakeContext())).status, 200);
  assert.deepEqual(warnings, [
    { event: 'route_binding_missing', route: '/v1/weather', binding: 'WEATHER_RATE_LIMIT' },
    { event: 'route_binding_missing', route: '/v1/places/search', binding: 'WEATHER_RATE_LIMIT' },
  ]);
});

test('a missing AI rate limiter takes its AI route offline', async () => {
  const { AI_RECOMMEND_RATE_LIMIT: _recommend, ...withoutRecommend } = boundEnv;
  await assertOffline(
    await buildRouter(withoutRecommend)(recommendRequest(), fakeContext()),
    'ai_unavailable',
  );
  const { AI_PROBE_RATE_LIMIT: _probe, ...withoutProbe } = boundEnv;
  await assertOffline(
    await buildRouter(withoutProbe)(probeRequest(), fakeContext()),
    'ai_unavailable',
  );
});

test('a missing DAILY_COUNTERS takes both AI routes offline and drops the capped weather providers', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const { DAILY_COUNTERS: _omitted, ...withoutCounters } = { ...env };
  const route = buildRouter(withoutCounters);
  await assertOffline(await route(recommendRequest(), fakeContext()), 'ai_unavailable');
  await assertOffline(await route(probeRequest(), fakeContext()), 'ai_unavailable');

  // Weather still serves through the uncapped Open-Meteo alone: WeatherKit is configured
  // but never composed, so no upstream call reaches it and no key is ever imported.
  const realFetch = globalThis.fetch;
  const upstreamHosts = [];
  globalThis.fetch = async (input) => {
    upstreamHosts.push(new URL(input instanceof Request ? input.url : input).host);
    throw new Error('network disabled in tests');
  };
  try {
    assert.equal((await route(weatherRequest(), fakeContext())).status, 503);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(upstreamHosts, ['api.open-meteo.com']);
  assert.deepEqual(warnings.filter(({ event }) => event === 'route_binding_missing'), [
    { event: 'route_binding_missing', route: '/v1/weather', binding: 'DAILY_COUNTERS' },
    { event: 'route_binding_missing', route: '/v1/ai/recommend', binding: 'DAILY_COUNTERS' },
    { event: 'route_binding_missing', route: '/v1/ai/probe', binding: 'DAILY_COUNTERS' },
  ]);
});

test('a fully bound environment reaches every handler', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const route = buildRouter({ ...env, DAILY_COUNTERS: fakeDailyCounters() });
  // The handlers answer for themselves: an empty body is the AI handler's invalid_request,
  // and the probe reaches the stubbed Workers AI binding.
  assert.equal((await route(recommendRequest(), fakeContext())).status, 400);
  assert.equal((await route(probeRequest(), fakeContext())).status, 200);
  assert.equal((await route(new Request('https://worker.test/v1/ai/ready'), fakeContext())).status, 200);
  assert.deepEqual(warnings.filter(({ event }) => event === 'route_binding_missing'), []);
});
