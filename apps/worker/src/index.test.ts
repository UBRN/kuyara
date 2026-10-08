import assert from 'node:assert/strict';
import test, { mock, type TestContext } from 'node:test';

import type { AiOption, AiRecommendV1Request } from '@kuyara/contracts';

import { generateEs256Key } from './__tests__/es256-test-key.ts';
import { DailyCounter, type DailyCounterNamespace } from './daily-counter.ts';
import { createEs256Signer, base64UrlEncode } from './es256-jwt.ts';
import { accountUpstreamTimeoutMs } from './account/upstream-timeout.ts';
import * as entryModule from './index.ts';
import worker, { buildRouter, type Env } from './index.ts';

type LogEntry = { event?: string; route?: string; binding?: string };
type FakeCounters = DailyCounterNamespace<{ name: string }>;
// The composed upstream adapters always send a plain header record; RequestInit types it wider.
type UpstreamInit = RequestInit & { headers: Record<string, string> };
type UpstreamInput = string | URL | Request;

// The composition logs missing bindings and the chain logs failed attempts; keep that out
// of the test output.
mock.method(console, 'warn', () => {});

// The memo the worker keeps is per isolate and keyed on the configuration it reads, so
// the default-export tests below share one `env`: a second `env` with the same values is
// served by the same composition, and one with different values recomposes (the last test
// proves both). The composition tests further down call `buildRouter` directly.

async function weatherKitPrivateKeyPem() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  // The token provider treats the PEM markers as optional, so the bare base64 body of a
  // throwaway key generated at test time is valid key material.
  return (pkcs8.toString('base64').match(/.{1,64}/gu) ?? []).join('\n');
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
function fakeDailyCounters(): FakeCounters {
  const objects = new Map<string, DailyCounter>();
  return {
    idFromName(name: string) { return { name }; },
    get(id) {
      let object = objects.get(id.name);
      if (!object) {
        const map = new Map<string, unknown>();
        object = new DailyCounter({ storage: {
          async get<T>(key: string) { return map.get(key) as T | undefined; },
          async put<T>(key: string, value: T) { map.set(key, value); },
          async delete(key: string) { return map.delete(key); },
          async list<T>() { return new Map(map) as Map<string, T>; },
          async setAlarm() {},
        } }, {});
        objects.set(id.name, object);
      }
      return { fetch: (input: Request | string, init?: RequestInit) => object.fetch(new Request(input, init)) };
    },
  };
}

function fakeContext() {
  return { waitUntil() {} };
}

const boundEnv: Env = {
  DAILY_COUNTERS: fakeDailyCounters(),
  AI_PROBE_RATE_LIMIT: openLimiter,
  AI_RECOMMEND_RATE_LIMIT: openLimiter,
  WEATHER_RATE_LIMIT: openLimiter,
  PLACE_SEARCH_RATE_LIMIT: openLimiter,
  // Account deletion is composed from configuration alone; the key is never imported unless
  // an account request reaches Apple, so a placeholder body is enough here.
  ACCOUNT_DELETE_RATE_LIMIT: openLimiter,
  SUPABASE_URL: 'https://project.supabase.co',
  APPLE_TEAM_ID: 'TEAM123456',
  SUPABASE_SECRET_KEY: 'sb_secret_placeholder',
  APPLE_SIGN_IN_PRIVATE_KEY: 'placeholder',
  APPLE_SIGN_IN_KEY_ID: 'KEY1234567',
  FEEDBACK_DB: { prepare: () => ({ bind: () => ({ run: async () => ({}) }) }) },
  FEEDBACK_RATE_LIMIT: openLimiter,
};

const env: Env = {
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

function weatherRequest(path = '/v1/weather') {
  return new Request(`https://worker.test${path}`, {
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
  // The wrapper forwards the last overload only; the cast restores the overloaded type.
  globalThis.crypto.subtle.importKey = function importKey(
    this: SubtleCrypto,
    ...args: Parameters<SubtleCrypto['importKey']>
  ) {
    importKeyCalls += 1;
    return realImportKey.apply(this, args);
  } as SubtleCrypto['importKey'];
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

async function assertOffline(response: Response, code: string) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { error: { code } });
}

// Every route that spends provider quota goes offline, with its own code, when a binding it
// needs is missing; the binding-free routes are unaffected.
test('each route rate limiter takes only its own route offline', async (t) => {
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  const { WEATHER_RATE_LIMIT: _omitted, ...withoutWeather } = boundEnv;
  const route = buildRouter(withoutWeather);
  await assertOffline(await route(weatherRequest(), fakeContext()), 'weather_unavailable');
  // One handler serves both weather routes, so the binding gate covers /v2 as well.
  await assertOffline(await route(weatherRequest('/v2/weather'), fakeContext()), 'weather_unavailable');
  assert.equal((await route(new Request('https://worker.test/v1/health'), fakeContext())).status, 200);
  const { PLACE_SEARCH_RATE_LIMIT: _places, ...withoutPlaces } = boundEnv;
  await assertOffline(
    await buildRouter(withoutPlaces)(placeSearchRequest(), fakeContext()),
    'places_unavailable',
  );
  assert.deepEqual(warnings, [
    { event: 'route_binding_missing', route: '/v1/weather', binding: 'WEATHER_RATE_LIMIT' },
    { event: 'route_binding_missing', route: '/v1/places/search', binding: 'PLACE_SEARCH_RATE_LIMIT' },
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
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  const { DAILY_COUNTERS: _omitted, ...withoutCounters } = { ...env };
  const route = buildRouter(withoutCounters);
  await assertOffline(await route(recommendRequest(), fakeContext()), 'ai_unavailable');
  await assertOffline(await route(probeRequest(), fakeContext()), 'ai_unavailable');

  // Weather still serves through the uncapped Open-Meteo alone: WeatherKit is configured
  // but never composed, so no upstream call reaches it and no key is ever imported.
  const realFetch = globalThis.fetch;
  const upstreamHosts: string[] = [];
  globalThis.fetch = async (input: UpstreamInput) => {
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
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  const route = buildRouter({ ...env, DAILY_COUNTERS: fakeDailyCounters() });
  // The handlers answer for themselves: an empty body is the AI handler's invalid_request,
  // and the probe reaches the stubbed Workers AI binding.
  assert.equal((await route(recommendRequest(), fakeContext())).status, 400);
  assert.equal((await route(probeRequest(), fakeContext())).status, 200);
  assert.equal((await route(new Request('https://worker.test/v1/ai/ready'), fakeContext())).status, 200);
  assert.deepEqual(warnings.filter(({ event }) => event === 'route_binding_missing'), []);
});

// Cloudflare documents that a deploy changing only bindings (a rotated secret, an edited
// var) may reuse running isolates, so the memo must follow the configuration, not the
// first `env` object. The same run also locks the production chain order offline:
// WeatherKit at the head, then Open-Meteo, then OpenWeather, so a provider silently
// dropped from the composition shows up here rather than only in a live tail.
test('a changed configuration recomposes and the weather chain runs WeatherKit, Open-Meteo, OpenWeather', async () => {
  const realFetch = globalThis.fetch;
  const realImportKey = globalThis.crypto.subtle.importKey;
  const upstreamHosts: string[] = [];
  let importKeyCalls = 0;
  globalThis.fetch = async (input: UpstreamInput) => {
    upstreamHosts.push(new URL(input instanceof Request ? input.url : input).host);
    throw new Error('network disabled in tests');
  };
  // The wrapper forwards the last overload only; the cast restores the overloaded type.
  globalThis.crypto.subtle.importKey = function importKey(
    this: SubtleCrypto,
    ...args: Parameters<SubtleCrypto['importKey']>
  ) {
    importKeyCalls += 1;
    return realImportKey.apply(this, args);
  } as SubtleCrypto['importKey'];
  try {
    // Compose with `env` (a no-op if an earlier test already did), then the same values in
    // a new object: the composition, and its imported key, is reused.
    assert.equal((await worker.fetch(weatherRequest(), env, fakeContext())).status, 503);
    const importsAfterBaseline = importKeyCalls;
    upstreamHosts.length = 0;
    assert.equal((await worker.fetch(weatherRequest(), { ...env }, fakeContext())).status, 503);
    assert.equal(importKeyCalls, importsAfterBaseline, 'an env with unchanged values must not recompose');
    assert.deepEqual(upstreamHosts, ['weatherkit.apple.com', 'api.open-meteo.com']);

    // An OpenWeather key added to the configuration: recomposed once, the chain now ends
    // with OpenWeather, and a further request with the same values reuses that second
    // composition.
    upstreamHosts.length = 0;
    const rotated = { ...env, OPENWEATHER_API_KEY: 'rotated-key' };
    assert.equal((await worker.fetch(weatherRequest(), rotated, fakeContext())).status, 503);
    assert.equal((await worker.fetch(weatherRequest(), { ...rotated }, fakeContext())).status, 503);
    assert.equal(importKeyCalls, importsAfterBaseline + 1, 'a changed configuration must recompose exactly once');
    assert.deepEqual(upstreamHosts, [
      'weatherkit.apple.com', 'api.open-meteo.com', 'api.openweathermap.org',
      'weatherkit.apple.com', 'api.open-meteo.com', 'api.openweathermap.org',
    ]);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.crypto.subtle.importKey = realImportKey;
  }
});

// The composed recommend route must hand its daily Workers AI attempt budget to the AI
// handler. The handler treats a missing counter or limit as no gate at all, so a dropped or
// renamed argument in `buildRouter` would fail open and spend the shared Neuron pool
// uncounted while every handler-level test (which injects its own counter) stays green.
const recommendDate = '2026-09-15';

type Garment = AiOption['garments'][number];

function recommendRequestBody(): AiRecommendV1Request {
  const traits: AiOption['traits'] = {
    hasMidLayer: false, hasOuterLayer: false, outerThermalHigh: false, outerWaterProtective: false,
    windResistant: false, tractionEnhanced: false, breathabilityHigh: false,
  };
  const separates = (
    optionId: string,
    formality: AiOption['formality'],
    top: Garment['garmentTypeId'],
    bottom: Garment['garmentTypeId'],
    footwear: Garment['garmentTypeId'],
    extra: Partial<AiOption['traits']> = {},
  ): AiOption => ({
    optionId,
    formality,
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: top },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: bottom },
      { slot: 'footwear', layerRole: null, garmentTypeId: footwear },
    ],
    traits: { ...traits, ...extra },
  });
  return {
    clothingPreference: 'womens',
    catalogVersion: 3,
    dayVariant: 0,
    requirements: [{
      kind: 'thermal', minimum: 'light', priority: 'mandatory', reasonCodes: ['temperature_low'],
    }],
    options: [
      separates('option-casual', 'casual', 't_shirt', 'trousers', 'sneakers', { breathabilityHigh: true }),
      separates('option-smart', 'smart', 'shirt', 'jeans', 'closed_shoes'),
      {
        optionId: 'option-formal',
        formality: 'formal',
        garments: [
          { slot: 'one_piece', layerRole: 'standalone', garmentTypeId: 'dress' },
          { slot: 'footwear', layerRole: null, garmentTypeId: 'ankle_boots' },
        ],
        traits,
      },
    ],
  };
}

const recommendAnswer = {
  data: {
    picks: [
      { optionId: 'option-casual', archetypeId: 'weekend_relaxed' },
      { optionId: 'option-smart', archetypeId: 'smart_casual' },
      { optionId: 'option-formal', archetypeId: 'office_ready' },
    ],
  },
};

function validRecommendRequest() {
  return new Request('https://worker.test/v1/ai/recommend', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.10', 'content-type': 'application/json' },
    body: JSON.stringify(recommendRequestBody()),
  });
}

async function incrementCounter(counters: FakeCounters, name: string, key: string, times: number) {
  const stub = counters.get(counters.idFromName(name));
  for (let index = 0; index < times; index += 1) {
    await stub.fetch(`https://daily-counter/increment?key=${encodeURIComponent(key)}`, { method: 'POST' });
  }
}

test('the composed recommend route stops calling Workers AI once ai:workers-ai reaches the daily attempt limit', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(`${recommendDate}T10:00:00.000Z`) });
  t.mock.method(console, 'info', () => {});
  const { WORKERS_AI_DAILY_ATTEMPT_LIMIT } = await import('./ai/ai-handler.ts');
  const counters = fakeDailyCounters();
  let runs = 0;
  const route = buildRouter({
    ...boundEnv,
    DAILY_COUNTERS: counters,
    WORKERS_AI_MODELS: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    AI: { async run() { runs += 1; return { response: recommendAnswer }; } },
  });

  // The probe has its own counter: exhausting it leaves the recommend budget untouched.
  await incrementCounter(counters, 'probe', `probe:${recommendDate}`, WORKERS_AI_DAILY_ATTEMPT_LIMIT + 1);
  // One attempt below the limit: this request's own increment lands exactly on it and runs.
  await incrementCounter(
    counters,
    'ai:workers-ai',
    `ai:workers-ai:${recommendDate}`,
    WORKERS_AI_DAILY_ATTEMPT_LIMIT - 1,
  );
  const atLimit = await route(validRecommendRequest(), fakeContext());
  assert.equal(atLimit.status, 200);
  assert.equal(runs, 1, 'the increment that lands exactly on the limit still runs');

  const overLimit = await route(validRecommendRequest(), fakeContext());
  await assertOffline(overLimit, 'ai_unavailable');
  assert.equal(runs, 1, 'past the daily limit Workers AI must not be called again');
});

// Account deletion is composed from six settings. Missing any one takes only its route
// offline with the route's own code, and the log line names the missing piece.
test('a missing account setting takes only the account route offline', async (t) => {
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls += 1; throw new Error('network disabled in tests'); });
  for (const name of [
    'ACCOUNT_DELETE_RATE_LIMIT', 'SUPABASE_URL', 'APPLE_TEAM_ID',
    'SUPABASE_SECRET_KEY', 'APPLE_SIGN_IN_PRIVATE_KEY', 'APPLE_SIGN_IN_KEY_ID',
  ]) {
    const route = buildRouter({ ...boundEnv, [name]: undefined });
    await assertOffline(await route(accountDeleteRequest(), fakeContext()), 'unavailable');
    assert.equal((await route(new Request('https://worker.test/v1/health'), fakeContext())).status, 200);
  }
  await assertOffline(
    await buildRouter({ ...boundEnv, SUPABASE_URL: 'http://project.supabase.co' })(accountDeleteRequest(), fakeContext()),
    'unavailable',
  );
  await assertOffline(
    await buildRouter({ ...boundEnv, SUPABASE_URL: 'not a url' })(accountDeleteRequest(), fakeContext()),
    'unavailable',
  );
  assert.equal(calls, 0);
  assert.deepEqual(warnings.map(({ binding }) => binding), [
    'ACCOUNT_DELETE_RATE_LIMIT', 'SUPABASE_URL', 'APPLE_TEAM_ID',
    'SUPABASE_SECRET_KEY', 'APPLE_SIGN_IN_PRIVATE_KEY', 'APPLE_SIGN_IN_KEY_ID', 'SUPABASE_URL', 'SUPABASE_URL',
  ]);
  for (const warning of warnings) {
    assert.deepEqual(Object.keys(warning).sort(), ['binding', 'event', 'route']);
    assert.equal(warning.route, '/v1/account/delete');
  }
});

function accountDeleteRequest(token = 'placeholder.token.value', body = {}) {
  return new Request('https://worker.test/v1/account/delete', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'cf-connecting-ip': '203.0.113.20',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// The whole route over a fake network: a Supabase token, the JWKS, the admin API and Apple.
// It proves the composition wires the modules in the safe order and that no secret leaves.
test('the composed account route revokes with Apple before it deletes, over a fake network', async (t) => {
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
  const appleKey = await generateEs256Key();
  const supabaseKey = await generateEs256Key();
  const sign = createEs256Signer(supabaseKey.bare);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: userId, exp: nowSeconds + 600 };
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims);
  const idToken = `x.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    iss: 'https://appleid.apple.com', aud: 'com.ubrn.kuyara', sub: 'apple-subject',
  })))}.y`;
  const seen: [string, string][] = [];
  t.mock.method(globalThis, 'fetch', async (input: UpstreamInput, init?: UpstreamInit) => {
    const url = String(input);
    seen.push([init?.method ?? 'GET', url]);
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ ...supabaseKey.publicJwk, kid: 'k1' }] });
    if (url.endsWith(`/admin/users/${userId}`) && init?.method === 'GET') {
      assert.equal(init?.headers.apikey, 'sb_secret_placeholder');
      return Response.json({ id: userId, identities: [{ provider: 'apple', provider_id: 'apple-subject' }] });
    }
    if (url.endsWith('/auth/v1/user')) {
      assert.equal(init?.headers.apikey, 'sb_secret_placeholder');
      assert.equal(init?.headers.Authorization, `Bearer ${token}`);
      return Response.json({ id: userId });
    }
    if (url.endsWith('/admin/users/' + userId)) return new Response('{}', { status: 200 });
    if (url.endsWith('/auth/token')) return Response.json({ refresh_token: 'refresh-sentinel', id_token: idToken });
    if (url.endsWith('/auth/revoke')) return new Response('', { status: 200 });
    throw new Error('unexpected upstream call');
  });
  const route = buildRouter({
    ...boundEnv,
    APPLE_SIGN_IN_PRIVATE_KEY: appleKey.pem,
  });

  const response = await route(accountDeleteRequest(token, { appleAuthorizationCode: 'code-sentinel' }), fakeContext());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { data: { status: 'deleted' } });
  assert.deepEqual(seen, [
    ['GET', 'https://project.supabase.co/auth/v1/.well-known/jwks.json'],
    ['GET', `https://project.supabase.co/auth/v1/admin/users/${userId}`],
    ['GET', 'https://project.supabase.co/auth/v1/user'],
    ['POST', 'https://appleid.apple.com/auth/token'],
    ['POST', 'https://appleid.apple.com/auth/revoke'],
    ['DELETE', `https://project.supabase.co/auth/v1/admin/users/${userId}`],
  ]);
  assert.deepEqual(warnings, []);

  // A token that is not valid reaches neither the admin API nor Apple.
  seen.length = 0;
  const expired = await sign({ alg: 'ES256', kid: 'k1' }, { ...claims, exp: nowSeconds - 5 });
  const denied = await route(accountDeleteRequest(expired, {}), fakeContext());
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: { code: 'unauthorized' } });
  assert.deepEqual(seen, []);
});

// A signed-out session's token still verifies until it expires; Supabase Auth says the session
// is gone, so the composed route deletes nothing, and an Auth outage fails closed the same way.
test('the composed account route refuses a token whose session has ended, and fails closed when Auth is down', async (t) => {
  const warnings: LogEntry[] = [];
  t.mock.method(console, 'warn', (entry: LogEntry) => warnings.push(entry));
  const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
  const appleKey = await generateEs256Key();
  const supabaseKey = await generateEs256Key();
  const sign = createEs256Signer(supabaseKey.bare);
  const token = await sign({ alg: 'ES256', kid: 'k1' }, {
    iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: userId,
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  let session: 'ended' | 'down' = 'ended';
  const seen: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: UpstreamInput, init?: UpstreamInit) => {
    const url = String(input);
    seen.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ ...supabaseKey.publicJwk, kid: 'k1' }] });
    if (url.endsWith(`/admin/users/${userId}`) && init?.method === 'GET') {
      return Response.json({ id: userId, identities: [{ provider: 'apple', provider_id: 'apple-subject' }] });
    }
    if (url.endsWith('/auth/v1/user')) {
      if (session === 'down') throw new Error(`private ${token}`);
      return Response.json({ code: 403, error_code: 'session_not_found', msg: 'private detail' }, { status: 403 });
    }
    throw new Error('unexpected upstream call');
  });
  const route = buildRouter({ ...boundEnv, APPLE_SIGN_IN_PRIVATE_KEY: appleKey.pem });

  const ended = await route(accountDeleteRequest(token, { appleAuthorizationCode: 'code-sentinel' }), fakeContext());
  assert.equal(ended.status, 401);
  assert.deepEqual(await ended.json(), { error: { code: 'unauthorized' } });
  session = 'down';
  const down = await route(accountDeleteRequest(token, { appleAuthorizationCode: 'code-sentinel' }), fakeContext());
  assert.equal(down.status, 503);
  assert.deepEqual(await down.json(), { error: { code: 'unavailable' } });
  // Neither reached Apple or the delete.
  assert.deepEqual(seen, [
    'GET /auth/v1/.well-known/jwks.json', `GET /auth/v1/admin/users/${userId}`, 'GET /auth/v1/user',
    `GET /auth/v1/admin/users/${userId}`, 'GET /auth/v1/user',
  ]);
  assert.deepEqual(warnings, [
    { event: 'account_delete_failed', stage: 'session', code: 'unauthorized' },
    { event: 'account_delete_failed', stage: 'session', code: 'unavailable' },
  ]);
});

test('adding a missing account secret recomposes the memoised worker', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const noAuthorization = () => new Request('https://worker.test/v1/account/delete', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.21', 'content-type': 'application/json' },
    body: '{}',
  });
  const { SUPABASE_SECRET_KEY: _omitted, ...without } = boundEnv;
  assert.equal((await worker.fetch(noAuthorization(), without, fakeContext())).status, 503);
  // The same isolate serves the route once the secret exists, without waiting to recycle.
  assert.equal((await worker.fetch(noAuthorization(), boundEnv, fakeContext())).status, 401);
});

test('removing the Haiku key or emptying its model list recomposes the memoised worker', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const ready = async (configuration: Env) => (await (await worker.fetch(
    new Request('https://worker.test/v1/ai/ready'), configuration, fakeContext(),
  )).json()).data.status;
  // Haiku is the only configured provider here, so readiness follows it alone.
  const withHaiku: Env = { ...boundEnv, HAIKU_API_KEY: 'key', HAIKU_MODELS: ['claude-haiku-5-5'] };
  const { HAIKU_API_KEY: _omitted, ...withoutKey } = withHaiku;
  assert.equal(await ready(withHaiku), 'ready');
  assert.equal(await ready(withoutKey), 'not_configured');
  assert.equal(await ready(withHaiku), 'ready');
  assert.equal(await ready({ ...withHaiku, HAIKU_MODELS: [] }), 'not_configured');
});

// The composed route over a fake network, for an Apple account whose code cannot revoke
// anything: it is deleted without a revoke call and answers deleted_apple_unrevoked.
test('the composed account route deletes an Apple account unrevoked when no code or a refused code arrives', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
  const userId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
  const appleKey = await generateEs256Key();
  const supabaseKey = await generateEs256Key();
  const sign = createEs256Signer(supabaseKey.bare);
  const token = await sign({ alg: 'ES256', kid: 'k1' }, {
    iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: userId, exp: Math.floor(Date.now() / 1000) + 600,
  });
  const seen: [string, string][] = [];
  t.mock.method(globalThis, 'fetch', async (input: UpstreamInput, init?: UpstreamInit) => {
    const url = String(input);
    seen.push([init?.method ?? 'GET', url]);
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ ...supabaseKey.publicJwk, kid: 'k1' }] });
    if (url.endsWith(`/admin/users/${userId}`) && init?.method === 'GET') {
      return Response.json({ id: userId, identities: [{ provider: 'apple', provider_id: 'apple-subject' }] });
    }
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: userId });
    if (url.endsWith(`/admin/users/${userId}`)) return new Response('{}', { status: 200 });
    if (url.endsWith('/auth/token')) return Response.json({ error: 'invalid_grant' }, { status: 400 });
    throw new Error('unexpected upstream call');
  });
  const route = buildRouter({ ...boundEnv, APPLE_SIGN_IN_PRIVATE_KEY: appleKey.pem });

  const noCode = await route(accountDeleteRequest(token, {}), fakeContext());
  assert.equal(noCode.status, 200);
  assert.deepEqual(await noCode.json(), { data: { status: 'deleted_apple_unrevoked' } });
  assert.deepEqual(seen.map(([method, url]) => `${method} ${new URL(url).pathname}`), [
    'GET /auth/v1/.well-known/jwks.json', `GET /auth/v1/admin/users/${userId}`, 'GET /auth/v1/user', `DELETE /auth/v1/admin/users/${userId}`,
  ]);

  seen.length = 0;
  const refused = await route(accountDeleteRequest(token, { appleAuthorizationCode: 'code-sentinel' }), fakeContext());
  assert.equal(refused.status, 200);
  assert.deepEqual(await refused.json(), { data: { status: 'deleted_apple_unrevoked' } });
  assert.deepEqual(seen.map(([method, url]) => `${method} ${new URL(url).pathname}`), [
    `GET /auth/v1/admin/users/${userId}`, 'GET /auth/v1/user', 'POST /auth/token', `DELETE /auth/v1/admin/users/${userId}`,
  ]);
});

test('the scheduled handler makes the keep-alive request from the parsed Supabase settings, and skips without them', async (t) => {
  t.mock.method(console, 'info', () => {});
  const calls: [string | undefined, string, string | undefined][] = [];
  t.mock.method(globalThis, 'fetch', async (input: UpstreamInput, init?: UpstreamInit) => {
    calls.push([init?.method, String(input), init?.headers.apikey]);
    return Response.json(true);
  });
  await worker.scheduled({}, { ...boundEnv, SUPABASE_URL: 'https://project.supabase.co/' });
  assert.deepEqual(calls, [['POST', 'https://project.supabase.co/rest/v1/rpc/keep_alive', 'sb_secret_placeholder']]);
  calls.length = 0;
  for (const unusable of [{ SUPABASE_SECRET_KEY: undefined }, { SUPABASE_URL: 'http://project.supabase.co' }, { SUPABASE_URL: 'not a url' }]) {
    await worker.scheduled({}, { ...boundEnv, ...unusable });
  }
  assert.deepEqual(calls, []);
});

test('every named export of the entry module is a function or class, as workerd requires', () => {
  // workerd reads each named export of the main module as an entrypoint and refuses to start
  // the Worker when one is a plain value; Node tests import the module without that rule.
  for (const [name, value] of Object.entries(entryModule)) {
    if (name !== 'default') assert.equal(typeof value, 'function', name);
  }
});

test('the deletion route\'s five upstream calls fit inside the phone\'s wait with room to spare', () => {
  // The phone's deletionTimeoutMs (apps/mobile worker-account-deletion.ts) is 20 s; signing,
  // the Worker itself and the phone's own network need the rest.
  const phoneWaitMs = 20_000;
  assert.ok(5 * accountUpstreamTimeoutMs <= phoneWaitMs - 5000, String(accountUpstreamTimeoutMs));
});

// The member AI allowance, composed: a re-ask carrying a Supabase access token the shared
// verifier accepts is counted per member in the DAILY_COUNTERS object; every other request
// behaves as before. A real signed token and a fake network prove the wiring end to end.
type ReaskOptions = { bearer?: string | null; reaskFlag?: boolean; version?: string };

async function memberFixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(`${recommendDate}T10:00:00.000Z`) });
  t.mock.method(console, 'info', () => {});
  const memberId = '3f2b8c1e-5d4a-4c1b-9a7e-0d6f1b2c3d4e';
  const supabaseKey = await generateEs256Key();
  const sign = createEs256Signer(supabaseKey.bare);
  const claims = {
    iss: 'https://project.supabase.co/auth/v1', aud: 'authenticated', role: 'authenticated', sub: memberId,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const token = await sign({ alg: 'ES256', kid: 'k1' }, claims);
  const seen: string[] = [];
  let jwksOutage = false;
  t.mock.method(globalThis, 'fetch', async (input: UpstreamInput) => {
    const url = String(input);
    seen.push(url);
    if (jwksOutage) throw new Error('supabase unreachable');
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ ...supabaseKey.publicJwk, kid: 'k1' }] });
    throw new Error('unexpected upstream call');
  });
  const counters = fakeDailyCounters();
  const lines: string[] = [];
  for (const level of ['warn', 'info', 'log', 'error'] as const) {
    t.mock.method(console, level, (...args: unknown[]) => lines.push(JSON.stringify(args)));
  }
  const runs = { count: 0 };
  const compose = (overrides: Env = {}) => buildRouter({
    ...boundEnv,
    DAILY_COUNTERS: counters,
    WORKERS_AI_MODELS: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
    AI: { async run() { runs.count += 1; return { response: recommendAnswer }; } },
    ...overrides,
  });
  const reask = ({ bearer = token, reaskFlag = true, version = 'v2' }: ReaskOptions = {}) => new Request(
    `https://worker.test/${version}/ai/recommend`,
    {
      method: 'POST',
      headers: {
        'cf-connecting-ip': '203.0.113.10',
        'content-type': 'application/json',
        ...(bearer === null ? {} : { authorization: `Bearer ${bearer}` }),
      },
      body: JSON.stringify(version === 'v2'
        ? { ...recommendRequestBody(), locale: 'en', ...(reaskFlag ? { reask: true } : {}) }
        : recommendRequestBody()),
    },
  );
  return { memberId, token, seen, counters, lines, runs, compose, reask, outage: () => { jwksOutage = true; } };
}

test('the composed route refuses the eleventh member re-ask with the closed 429 and reads the keys once', async (t) => {
  const { memberId, seen, lines, runs, compose, reask } = await memberFixture(t);
  const route = compose();
  for (let count = 1; count <= 10; count += 1) {
    assert.equal((await route(reask(), fakeContext())).status, 200, `re-ask ${count}`);
  }
  assert.equal(runs.count, 10);
  const refused = await route(reask(), fakeContext());
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: { code: 'rate_limited' } });
  assert.equal(runs.count, 10);
  assert.equal(seen.length, 1, 'the key set is read once and cached');
  assert.equal(lines.some((line) => line.includes(memberId)), false);
});

test('the composed route does not count a non-re-ask, a bad token or a request without a header', async (t) => {
  const { seen, runs, compose, reask } = await memberFixture(t);
  const route = compose();
  for (let count = 0; count < 13; count += 1) {
    assert.equal((await route(reask({ reaskFlag: false }), fakeContext())).status, 200);
    assert.equal((await route(reask({ bearer: null }), fakeContext())).status, 200);
    assert.equal((await route(reask({ bearer: 'not.a.token' }), fakeContext())).status, 200);
  }
  assert.equal(runs.count, 39);
  assert.deepEqual(seen, [], 'only a re-ask with a well-formed token is verified, and those fail before the JWKS');
});

test('the composed route runs unchanged when the Supabase address is missing or the verifier is down', async (t) => {
  const { seen, runs, compose, reask, outage } = await memberFixture(t);
  const noSupabase = compose({ SUPABASE_URL: undefined });
  for (let count = 0; count < 12; count += 1) {
    assert.equal((await noSupabase(reask(), fakeContext())).status, 200);
  }
  assert.deepEqual(seen, []);
  outage();
  const down = compose();
  for (let count = 0; count < 12; count += 1) {
    assert.equal((await down(reask(), fakeContext())).status, 200);
  }
  assert.equal(runs.count, 24);
});

test('a member re-ask within its allowance still stops at the global Workers AI total', async (t) => {
  const { counters, runs, compose, reask } = await memberFixture(t);
  const { WORKERS_AI_DAILY_ATTEMPT_LIMIT } = await import('./ai/ai-handler.ts');
  await incrementCounter(counters, 'ai:workers-ai', `ai:workers-ai:${recommendDate}`, WORKERS_AI_DAILY_ATTEMPT_LIMIT);
  const response = await compose()(reask(), fakeContext());
  await assertOffline(response, 'ai_unavailable');
  assert.equal(runs.count, 0);
});
