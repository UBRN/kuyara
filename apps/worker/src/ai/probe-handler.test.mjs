import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiProbeV1SuccessSchema,
  aiRecommendV1RequestSchema,
} from '@kuyara/contracts';

import {
  createProbeHandler,
  PROBE_DAILY_LIMIT,
} from './probe-handler.ts';

const fixedNow = '2026-08-29T12:34:56.000Z';

function request(method = 'POST', ip = '203.0.113.10') {
  return new Request('http://localhost/v1/ai/probe', {
    method,
    headers: { 'cf-connecting-ip': ip },
  });
}

function validOutput() {
  return { data: { picks: [
    { optionId: 'probe-casual', archetypeId: 'weekend_relaxed' },
    { optionId: 'probe-smart', archetypeId: 'smart_casual' },
    { optionId: 'probe-formal', archetypeId: 'office_ready' },
  ] } };
}

function createCounter(entries = []) {
  const values = new Map(entries);
  const getKeys = [];
  const incrementKeys = [];
  return {
    values,
    getKeys,
    incrementKeys,
    counter: {
      async get(dateKey) {
        getKeys.push(dateKey);
        return values.get(dateKey) ?? 0;
      },
      async increment(dateKey) {
        incrementKeys.push(dateKey);
        values.set(dateKey, (values.get(dateKey) ?? 0) + 1);
      },
    },
  };
}

function dependencies(overrides = {}) {
  const counterState = overrides.counterState ?? createCounter();
  return {
    counterState,
    deps: {
      providers: overrides.providers ?? [],
      rateLimiter: overrides.rateLimiter ?? { limit: async () => ({ success: true }) },
      dailyCounter: counterState.counter,
      now: overrides.now ?? (() => new Date(fixedNow)),
      ...(overrides.attemptTimeoutMs === undefined
        ? {}
        : { attemptTimeoutMs: overrides.attemptTimeoutMs }),
    },
  };
}

async function assertJson(response, status, body) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), body);
}

test('non-POST methods return 405 without calling a provider', async () => {
  let providerCalls = 0;
  const { deps } = dependencies({ providers: [{
    async generateOutfits() {
      providerCalls += 1;
      return validOutput();
    },
  }] });
  const handle = createProbeHandler(deps);
  for (const method of ['GET', 'PUT']) {
    const response = await handle(request(method));
    assert.equal(response.headers.get('allow'), 'POST');
    await assertJson(response, 405, { error: { code: 'method_not_allowed' } });
  }
  assert.equal(providerCalls, 0);
});

test('rate limiter denial returns 429 without calling a provider', async () => {
  let providerCalls = 0;
  const keys = [];
  const { deps } = dependencies({
    providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
    rateLimiter: {
      async limit(input) {
        keys.push(input.key);
        return { success: false };
      },
    },
  });
  const response = await createProbeHandler(deps)(request());
  assert.equal(response.headers.get('retry-after'), '60');
  await assertJson(response, 429, { error: { code: 'rate_limited' } });
  assert.deepEqual(keys, ['probe:203.0.113.10']);
  assert.equal(providerCalls, 0);
});

test('daily limit returns 429 without calling a provider', async () => {
  let providerCalls = 0;
  const dateKey = 'probe:2026-08-29';
  const counterState = createCounter([[dateKey, PROBE_DAILY_LIMIT]]);
  const { deps } = dependencies({
    counterState,
    providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
  });
  const response = await createProbeHandler(deps)(request());
  assert.equal(response.headers.get('retry-after'), '60');
  await assertJson(response, 429, { error: { code: 'rate_limited' } });
  assert.deepEqual(counterState.getKeys, [dateKey]);
  assert.equal(providerCalls, 0);
});

test('no providers returns unavailable without incrementing the daily counter', async () => {
  const { deps, counterState } = dependencies();
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  assert.deepEqual(counterState.incrementKeys, []);
});

test('valid provider output returns ok and receives three valid probe options', async () => {
  let capturedRequest;
  const providerName = 'SecretProvider';
  const { deps, counterState } = dependencies({ providers: [{
    async generateOutfits(body) {
      capturedRequest = body;
      return validOutput();
    },
  }] });
  const response = await createProbeHandler(deps)(request());
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(response.status, 200);
  assert.equal(aiProbeV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.status, 'ok');
  assert.equal(new Date(body.data.checkedAt).toISOString(), body.data.checkedAt);
  assert.equal(serialized.includes(providerName), false);
  assert.equal(serialized.includes('error'), false);
  assert.equal(aiRecommendV1RequestSchema.safeParse(capturedRequest).success, true);
  assert.equal(capturedRequest.catalogVersion, 2);
  assert.equal(capturedRequest.dayVariant, 0);
  assert.deepEqual(
    capturedRequest.options.map(({ optionId }) => optionId),
    ['probe-casual', 'probe-smart', 'probe-formal'],
  );
  assert.deepEqual(counterState.getKeys, ['probe:2026-08-29']);
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
});

test('a structurally valid response must use only supplied probe option ids', async () => {
  const unknownOption = validOutput();
  unknownOption.data.picks[1].optionId = 'invented-option';
  const { deps } = dependencies({ providers: [{
    generateOutfits: async () => unknownOption,
  }] });
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
});

test('provider failure returns unavailable and increments the daily counter', async () => {
  const { deps, counterState } = dependencies({ providers: [{
    async generateOutfits() {
      throw new Error('SecretProvider private error');
    },
  }] });
  const response = await createProbeHandler(deps)(request());
  const serialized = await response.text();
  assert.equal(response.status, 200);
  assert.equal(serialized, JSON.stringify({
    data: { status: 'unavailable', checkedAt: fixedNow },
  }));
  assert.equal(serialized.includes('SecretProvider'), false);
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
});

test('provider timeout returns unavailable', async () => {
  const { deps, counterState } = dependencies({
    providers: [{ generateOutfits: async () => new Promise(() => {}) }],
    attemptTimeoutMs: 20,
  });
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
});

test('cache reuses the probe result within 60 seconds and refreshes after expiry', async () => {
  let currentTime = new Date(fixedNow);
  let providerCalls = 0;
  const { deps, counterState } = dependencies({
    now: () => new Date(currentTime),
    providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
  });
  const handle = createProbeHandler(deps);
  const firstBody = await (await handle(request())).json();
  currentTime = new Date(new Date(fixedNow).getTime() + 59_000);
  const cachedBody = await (await handle(request())).json();
  assert.deepEqual(cachedBody, firstBody);
  assert.equal(providerCalls, 1);
  assert.equal(counterState.incrementKeys.length, 1);
  currentTime = new Date(new Date(fixedNow).getTime() + 60_001);
  const refreshedBody = await (await handle(request())).json();
  assert.equal(refreshedBody.data.checkedAt, currentTime.toISOString());
  assert.equal(providerCalls, 2);
  assert.equal(counterState.incrementKeys.length, 2);
});
