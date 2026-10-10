import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiProbeV1SuccessSchema,
  aiProbeV2SuccessSchema,
  aiRecommendV1RequestSchema,
  type AiRecommendV1Request,
  type AiRecommendV2Request,
} from '@kuyara/contracts';

import type { RateLimiter } from '../json-request.ts';
import { AiProviderError, type AiProvider } from './ai-provider.ts';
import { createDailyCappedAiProvider } from './daily-capped-ai-provider.ts';
import { HAIKU_DAILY_ATTEMPT_LIMIT } from './haiku-ai-provider.ts';
import {
  createProbeHandler,
  createProbeV2Handler,
  PROBE_DAILY_LIMIT,
  PROBE_MAX_TOKENS,
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

// The counter's whole contract: one atomic increment that returns the new count. `fail`
// stands in for an unreachable Durable Object.
function createCounter(entries: [string, number][] = [], { fail = false } = {}) {
  const values = new Map<string, number>(entries);
  const incrementKeys: string[] = [];
  return {
    values,
    incrementKeys,
    counter: {
      async increment(dateKey: string) {
        incrementKeys.push(dateKey);
        if (fail) throw new Error('Daily counter answered 500.');
        const count = (values.get(dateKey) ?? 0) + 1;
        values.set(dateKey, count);
        return count;
      },
    },
  };
}

type CounterState = ReturnType<typeof createCounter>;
type Overrides = {
  counterState?: CounterState;
  // Most stubs here never succeed, so they carry no `id` or `model`.
  providers?: Partial<AiProvider>[];
  rateLimiter?: RateLimiter;
  now?: () => Date;
  attemptTimeoutMs?: number;
};

function dependencies(overrides: Overrides = {}) {
  const counterState = overrides.counterState ?? createCounter();
  return {
    counterState,
    deps: {
      // The stubs without an `id` or `model` are cast to the provider type on purpose.
      providers: (overrides.providers ?? []) as AiProvider[],
      rateLimiter: overrides.rateLimiter ?? { limit: async () => ({ success: true }) },
      dailyCounter: counterState.counter,
      now: overrides.now ?? (() => new Date(fixedNow)),
      ...(overrides.attemptTimeoutMs === undefined
        ? {}
        : { attemptTimeoutMs: overrides.attemptTimeoutMs }),
    },
  };
}

async function assertJson(response: Response, status: number, body: unknown) {
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

test('rate limiter denial returns 429 without calling a provider', async (t) => {
  let providerCalls = 0;
  const keys: string[] = [];
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const { deps } = dependencies({
    providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
    rateLimiter: {
      async limit(input: { key: string }) {
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
  assert.deepEqual(warnings, [{
    event: 'rate_limited',
    route: '/v1/ai/probe',
    limiter: 'ai_probe_burst',
  }]);
  assert.equal(JSON.stringify(warnings).includes('203.0.113.10'), false);
});

test('the daily counter admits exactly 30 attempts and refuses the 31st', async (t) => {
  let providerCalls = 0;
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const dateKey = 'probe:2026-08-29';
  const counterState = createCounter([[dateKey, PROBE_DAILY_LIMIT - 1]]);
  let currentTime = new Date(fixedNow);
  const { deps } = dependencies({
    counterState,
    now: () => new Date(currentTime),
    providers: [{
      id: 'workers-ai',
      model: '@cf/model',
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
  });
  const handle = createProbeHandler(deps);
  // The 30th attempt: the increment is the gate, so it lands at 30 and runs.
  assert.equal((await handle(request())).status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(counterState.values.get(dateKey), PROBE_DAILY_LIMIT);
  assert.deepEqual(warnings, []);
  // Past the cache, the 31st increment lands at 31 and is refused before the provider.
  currentTime = new Date(new Date(fixedNow).getTime() + 60_001);
  const response = await handle(request());
  assert.equal(response.headers.get('retry-after'), '60');
  await assertJson(response, 429, { error: { code: 'rate_limited' } });
  assert.deepEqual(counterState.incrementKeys, [dateKey, dateKey]);
  assert.equal(providerCalls, 1);
  // The daily cap and the burst limiter both answer 429; the log says which one tripped.
  assert.deepEqual(warnings, [{
    event: 'rate_limited',
    route: '/v1/ai/probe',
    limiter: 'ai_probe_daily',
  }]);
});

test('a failing daily counter answers 503 and never reaches the provider or the cache', async (t) => {
  let providerCalls = 0;
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const counterState = createCounter([], { fail: true });
  const { deps } = dependencies({
    counterState,
    providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
  });
  const handle = createProbeHandler(deps);
  await assertJson(await handle(request()), 503, { error: { code: 'ai_unavailable' } });
  // Nothing was checked, so nothing is cached: the next request within 60 s reaches the
  // counter again instead of serving a result that never existed.
  await assertJson(await handle(request()), 503, { error: { code: 'ai_unavailable' } });
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29', 'probe:2026-08-29']);
  assert.equal(providerCalls, 0);
  assert.deepEqual(warnings, [
    { event: 'ai_daily_counter_unavailable', route: '/v1/ai/probe' },
    { event: 'ai_daily_counter_unavailable', route: '/v1/ai/probe' },
  ]);
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

test('valid provider output returns ok and receives three valid probe options', async (t) => {
  const capturedRequests: (AiRecommendV1Request | AiRecommendV2Request)[] = [];
  const providerName = 'SecretProvider';
  const { deps, counterState } = dependencies({ providers: [{
    id: 'openrouter',
    model: 'some/model:free',
    async generateOutfits(body) {
      capturedRequests.push(body);
      return validOutput();
    },
  }] });
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const response = await createProbeHandler(deps)(request());
  const body = await response.json();
  const serialized = JSON.stringify(body);
  assert.equal(response.status, 200);
  assert.equal(aiProbeV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.status, 'ok');
  assert.deepEqual(warnings, []);
  assert.deepEqual(body.data.assistant, { providerId: 'openrouter', model: 'some/model:free' });
  assert.equal(new Date(body.data.checkedAt).toISOString(), body.data.checkedAt);
  assert.equal(serialized.includes(providerName), false);
  assert.equal(serialized.includes('error'), false);
  const capturedRequest = capturedRequests[0];
  assert.equal(aiRecommendV1RequestSchema.safeParse(capturedRequest).success, true);
  assert.equal(capturedRequest.catalogVersion, 6);
  assert.equal(capturedRequest.dayVariant, 0);
  assert.deepEqual(
    capturedRequest.options.map(({ optionId }) => optionId),
    ['probe-casual', 'probe-smart', 'probe-formal'],
  );
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
});

test('the probe asks for a far smaller token budget than a recommendation', async () => {
  const budgets: (number | undefined)[] = [];
  const { deps } = dependencies({ providers: [{
    id: 'openrouter',
    model: 'some/model:free',
    async generateOutfits(_body, _signal, options) {
      budgets.push(options?.maxTokens);
      return validOutput();
    },
  }] });
  const response = await createProbeHandler(deps)(request());
  assert.equal((await response.json()).data.status, 'ok');
  assert.deepEqual(budgets, [PROBE_MAX_TOKENS]);
  // Small enough to matter against the shared pool, large enough for the three pairs the
  // probe validates.
  assert.equal(PROBE_MAX_TOKENS, 256);
  assert.ok(PROBE_MAX_TOKENS > JSON.stringify(validOutput()).length / 3);
});

test('a structurally valid response must use only supplied probe option ids', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const unknownOption = validOutput();
  unknownOption.data.picks[1].optionId = 'invented-option';
  const { deps } = dependencies({ providers: [{
    model: 'some/model:free',
    generateOutfits: async () => unknownOption,
  }] });
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  assert.deepEqual(warnings, [
    { event: 'ai_probe_attempt_failed', model: 'some/model:free', reason: 'unknown_option' },
  ]);
});

test('output that fails the shared schema returns unavailable and logs invalid_output', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const { deps } = dependencies({ providers: [{
    model: 'some/model:free',
    generateOutfits: async () => ({ data: { picks: 'not-an-array' } }),
  }] });
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  assert.deepEqual(warnings, [
    { event: 'ai_probe_attempt_failed', model: 'some/model:free', reason: 'invalid_output' },
  ]);
});

test('provider failure returns unavailable and names no provider', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const { deps, counterState } = dependencies({ providers: [{
    id: 'openrouter',
    model: 'some/model:free',
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
  // A failed attempt is still one counted attempt.
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
  // The log names the model and a closed reason; the thrown error's text and the caller's
  // address stay out of it.
  assert.deepEqual(warnings, [
    { event: 'ai_probe_attempt_failed', model: 'some/model:free', reason: 'provider_error' },
  ]);
  const loggedText = JSON.stringify(warnings);
  assert.equal(loggedText.includes('SecretProvider'), false);
  assert.equal(loggedText.includes('203.0.113.10'), false);
});

test('a classified provider failure logs its kind so a spent quota is visible', async (t) => {
  for (const kind of ['quota_exceeded', 'rate_limited'] as const) {
    const warnings: unknown[] = [];
    const warn = t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
    const { deps } = dependencies({ providers: [{
      id: 'workers-ai',
      model: '@cf/example/model',
      async generateOutfits() {
        throw new AiProviderError(kind);
      },
    }] });
    await assertJson(
      await createProbeHandler(deps)(request()),
      200,
      { data: { status: 'unavailable', checkedAt: fixedNow } },
    );
    assert.deepEqual(warnings, [
      { event: 'ai_probe_attempt_failed', model: '@cf/example/model', reason: kind },
    ]);
    warn.mock.restore();
  }
});

test('provider timeout returns unavailable and logs timeout', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const counterState = createCounter();
  let incrementsSeenByProvider;
  const { deps } = dependencies({
    counterState,
    providers: [{
      model: 'some/model:free',
      generateOutfits: async () => {
        incrementsSeenByProvider = counterState.incrementKeys.length;
        return new Promise(() => {});
      },
    }],
    attemptTimeoutMs: 20,
  });
  await assertJson(
    await createProbeHandler(deps)(request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  // A timed-out attempt is still one counted attempt, taken before the provider ran.
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29']);
  assert.equal(incrementsSeenByProvider, 1);
  assert.deepEqual(warnings, [
    { event: 'ai_probe_attempt_failed', model: 'some/model:free', reason: 'timeout' },
  ]);
});

test('cache reuses the probe result within 60 seconds and refreshes after expiry', async () => {
  let currentTime = new Date(fixedNow);
  let providerCalls = 0;
  const { deps, counterState } = dependencies({
    now: () => new Date(currentTime),
    providers: [{
      id: 'workers-ai',
      model: '@cf/example/model',
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }],
  });
  const handle = createProbeHandler(deps);
  const firstBody = await (await handle(request())).json();
  assert.deepEqual(firstBody.data.assistant, {
    providerId: 'workers-ai',
    model: '@cf/example/model',
  });
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

test('a failing rate-limit binding answers a stable ai_unavailable, not a thrown error', async (t) => {
  t.mock.method(console, 'warn', () => {});
  let providerCalls = 0;
  const { deps } = dependencies({
    providers: [{ async generateOutfits() { providerCalls += 1; return validOutput(); } }],
    rateLimiter: { async limit() { throw new Error('binding down'); } },
  });
  const response = await createProbeHandler(deps)(request());
  await assertJson(response, 503, { error: { code: 'ai_unavailable' } });
  assert.equal(providerCalls, 0);
});

test('the probe skips the Worker-internal provider and reports the first one the response can name', async () => {
  const called: string[] = [];
  const answer = (id: AiProvider['id'], model: string): AiProvider => ({
    id,
    model,
    async generateOutfits() {
      called.push(model);
      return validOutput();
    },
  });
  const { deps } = dependencies({
    providers: [answer('haiku', 'claude-haiku-5-5'), answer('workers-ai', '@cf/first')],
  });
  const body = aiProbeV1SuccessSchema.parse(await (await createProbeHandler(deps)(request())).json());
  assert.deepEqual(called, ['@cf/first']);
  assert.deepEqual(body.data.assistant, { providerId: 'workers-ai', model: '@cf/first' });
});

function answeringProvider(id: AiProvider['id'], model: string, called: string[] = []): AiProvider {
  return {
    id,
    model,
    async generateOutfits() {
      called.push(model);
      return validOutput();
    },
  };
}

function v2Request() {
  return new Request('http://localhost/v2/ai/probe', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.10' },
  });
}

// The composed Haiku provider: the same cap wrapper `createAiProviders` builds, counting
// under `ai:haiku` in the shared fake counter.
function cappedHaiku(counterState: CounterState, called: string[]): AiProvider {
  return createDailyCappedAiProvider({
    provider: answeringProvider('haiku', 'claude-haiku-5-5', called),
    counter: counterState.counter,
    counterName: 'ai:haiku',
    dailyLimit: HAIKU_DAILY_ATTEMPT_LIMIT,
    admits: () => true,
    now: () => new Date(fixedNow),
  });
}

test('the v2 probe tests the first provider, Haiku, and counts the probe and Haiku budgets once each', async () => {
  const called: string[] = [];
  const counterState = createCounter();
  const { deps } = dependencies({
    counterState,
    providers: [cappedHaiku(counterState, called), answeringProvider('workers-ai', '@cf/first', called)],
  });
  const response = await createProbeV2Handler(deps)(v2Request());
  const body = aiProbeV2SuccessSchema.parse(await response.json());
  assert.deepEqual(called, ['claude-haiku-5-5']);
  assert.deepEqual(body.data, {
    status: 'ok',
    checkedAt: fixedNow,
    assistant: { providerId: 'haiku', model: 'claude-haiku-5-5' },
  });
  assert.deepEqual(counterState.incrementKeys, ['probe:2026-08-29', 'ai:haiku:2026-08-29']);
});

test('the v2 probe falls to the chain\'s first remaining provider when Haiku is not composed', async () => {
  const called: string[] = [];
  const { deps } = dependencies({
    providers: [answeringProvider('workers-ai', '@cf/first', called), answeringProvider('openrouter', 'x/y:free', called)],
  });
  const body = aiProbeV2SuccessSchema.parse(await (await createProbeV2Handler(deps)(v2Request())).json());
  assert.deepEqual(called, ['@cf/first']);
  assert.deepEqual(body.data.assistant, { providerId: 'workers-ai', model: '@cf/first' });
});

test('a spent Haiku budget makes the v2 probe unavailable instead of walking on to the next provider', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const called: string[] = [];
  const counterState = createCounter([['ai:haiku:2026-08-29', HAIKU_DAILY_ATTEMPT_LIMIT]]);
  const { deps } = dependencies({
    counterState,
    providers: [cappedHaiku(counterState, called), answeringProvider('workers-ai', '@cf/first', called)],
  });
  await assertJson(
    await createProbeV2Handler(deps)(v2Request()),
    200,
    { data: { status: 'unavailable', checkedAt: fixedNow } },
  );
  assert.deepEqual(called, []);
  assert.equal(counterState.values.get('ai:haiku:2026-08-29'), HAIKU_DAILY_ATTEMPT_LIMIT + 1);
  assert.deepEqual(warnings, [
    { event: 'ai_probe_attempt_failed', model: 'claude-haiku-5-5', reason: 'quota_exceeded' },
  ]);
});

test('the v2 probe has its own route label, shares the daily cap and burst limit, and never feeds the v1 cache', async (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));
  const called: string[] = [];
  const counterState = createCounter();
  const { deps } = dependencies({
    counterState,
    providers: [answeringProvider('haiku', 'claude-haiku-5-5', called), answeringProvider('workers-ai', '@cf/first', called)],
  });
  const v1 = createProbeHandler(deps);
  const v2 = createProbeV2Handler(deps);
  const v2Body = await (await v2(v2Request())).json();
  const v1Body = await (await v1(request())).json();
  assert.equal(v2Body.data.assistant.providerId, 'haiku');
  assert.deepEqual(v1Body.data.assistant, { providerId: 'workers-ai', model: '@cf/first' });
  assert.deepEqual(called, ['claude-haiku-5-5', '@cf/first']);
  // Both versions count against the one `probe` cap.
  assert.equal(counterState.values.get('probe:2026-08-29'), 2);
  // Each keeps its own 60 s cache.
  assert.deepEqual(await (await v2(v2Request())).json(), v2Body);
  assert.deepEqual(await (await v1(request())).json(), v1Body);
  assert.equal(called.length, 2);

  const limited = createProbeV2Handler({ ...deps, rateLimiter: { limit: async () => ({ success: false }) } });
  assert.equal((await limited(v2Request())).status, 429);
  assert.deepEqual(warnings, [{ event: 'rate_limited', route: '/v2/ai/probe', limiter: 'ai_probe_burst' }]);
});

test('the v1 probe keeps its exact shape and never names Haiku', async () => {
  const { deps } = dependencies({
    providers: [answeringProvider('haiku', 'claude-haiku-5-5'), answeringProvider('workers-ai', '@cf/first')],
  });
  assert.equal(
    await (await createProbeHandler(deps)(request())).text(),
    JSON.stringify({
      data: {
        status: 'ok',
        checkedAt: fixedNow,
        assistant: { providerId: 'workers-ai', model: '@cf/first' },
      },
    }),
  );
});
