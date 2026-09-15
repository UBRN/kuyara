import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiHandler } from './ai-handler.ts';
import { WorkersAiProvider } from './workers-ai-provider.ts';

const request = {
  clothingPreference: 'mens',
  catalogVersion: 3,
  dayVariant: 3,
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  options: [{
    optionId: 'option-1',
    formality: 'casual',
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
      { slot: 'footwear', layerRole: null, garmentTypeId: 'sneakers' },
    ],
    traits: {
      hasMidLayer: false,
      hasOuterLayer: false,
      outerThermalHigh: false,
      outerWaterProtective: false,
      windResistant: false,
      tractionEnhanced: false,
      breathabilityHigh: true,
    },
  }],
};

test('passes a per-request pick schema to the binding and unwraps its response', async () => {
  const expected = { data: { picks: [] } };
  let captured;
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run(model, input) {
        captured = { model, input };
        return { response: expected };
      },
    },
  });
  const result = await provider.generateOutfits(
    request,
    new AbortController().signal,
  );
  const pickProperties = captured.input.response_format.json_schema
    .properties.data.properties.picks.items.properties;
  assert.equal(captured.model, '@cf/model');
  assert.equal(captured.input.max_tokens, 192);
  assert.equal(captured.input.response_format.type, 'json_schema');
  assert.deepEqual(pickProperties.optionId.enum, ['option-1']);
  assert.equal(pickProperties.archetypeId.enum.length, 12);
  assert.deepEqual(result, expected);
});

test('prompt sends only the approved model inputs', async () => {
  let input;
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run(_model, capturedInput) {
        input = capturedInput;
        return { response: {} };
      },
    },
  });
  await provider.generateOutfits(request, new AbortController().signal);
  const payload = JSON.parse(input.messages[1].content);
  assert.deepEqual(payload, {
    clothingPreference: 'mens',
    formalityOrder: ['smart', 'casual', 'formal'],
    options: [{
      optionId: 'option-1',
      formality: 'casual',
      garments: [
        { slot: 'primary_top', garmentTypeId: 't_shirt' },
        { slot: 'bottom', garmentTypeId: 'trousers' },
        { slot: 'footwear', garmentTypeId: 'sneakers' },
      ],
      // The handler rejects a pick whose archetype fails its precondition, so the
      // approved input carries the conditional archetypes this option can be given.
      // everyday_easy is unconditional and the prompt states it instead.
      eligibleArchetypeIds: ['weekend_relaxed', 'light_and_airy', 'on_the_move'],
    }],
  });
  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    'requirements',
    'reasonCodes',
    'layerRole',
    'traits',
    'catalogVersion',
    'dayVariant',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('rejects missing or non-object responses', async () => {
  for (const result of [null, {}, { response: null }, { response: 'not an object' }]) {
    const provider = new WorkersAiProvider({
      model: '@cf/model',
      ai: { run: async () => result },
    });
    await assert.rejects(
      provider.generateOutfits(request, new AbortController().signal),
    );
  }
});

test('rejects an already-aborted signal before calling the binding', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run() {
        calls += 1;
        return { response: {} };
      },
    },
  });
  await assert.rejects(provider.generateOutfits(request, controller.signal));
  assert.equal(calls, 0);
});

// Cloudflare surfaces an account-level Workers AI failure as a thrown binding error whose
// message the runtime formats as `${internalCode}: ${description}`; the spent daily
// allocation is code 3036 "Account limited", served as a 429
// (https://developers.cloudflare.com/workers-ai/platform/errors/). The binding takes no
// AbortSignal, so a quota refusal arrives as an ordinary rejection rather than an abort,
// and the chain has to move on.
const quotaError = Object.assign(
  new Error(
    '3036: You have used up your daily free allocation of 10,000 neurons. '
    + "Please upgrade to Cloudflare's Workers Paid plan if you would like to continue usage.",
  ),
  { name: 'Account limited' },
);

test('a quota-exhausted binding fails as a classified quota error carrying nothing from the request or the binding', async () => {
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: { run: async () => { throw quotaError; } },
  });
  const controller = new AbortController();
  await assert.rejects(
    provider.generateOutfits(request, controller.signal),
    (error) => {
      // A quota refusal, not a timeout: the handler logs `quota_exceeded` and still gives
      // the next provider its turn.
      assert.equal(controller.signal.aborted, false);
      assert.equal(error.name, 'AiProviderError');
      assert.equal(error.kind, 'quota_exceeded');
      const serialized = `${error.name}: ${error.message}`;
      for (const forbidden of [
        'option-1', 'mens', 't_shirt', 'trousers', 'sneakers',
        '3036', 'neurons', 'Workers Paid', '429',
      ]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
      }
      return true;
    },
  );
});

// The codes are the closed set on https://developers.cloudflare.com/workers-ai/platform/errors/:
// 3036 "Account limited" is the spent daily allocation; 3040 "Out of capacity" is a data
// center refusal of one attempt, so it must never read as quota, which would make the
// handler skip the other Workers AI models. 4006 is a GraphQL analytics code, not a binding
// code, and matches nothing.
test('binding failures are classified by their own code and text, and nothing else is', async () => {
  const cases = [
    ['3036: You have used up your daily free allocation of 10,000 neurons.', 'quota_exceeded'],
    ['InferenceUpstreamError: 3036: Account limited', 'quota_exceeded'],
    ['Neurons exhausted for this account', 'quota_exceeded'],
    ['3040: No more data centers to forward the request to', 'rate_limited'],
    ['429: rate limit reached for this model', 'rate_limited'],
    ['Too Many Requests', 'rate_limited'],
  ];
  for (const [message, kind] of cases) {
    const provider = new WorkersAiProvider({
      model: '@cf/model',
      ai: { run: async () => { throw new Error(message); } },
    });
    await assert.rejects(
      provider.generateOutfits(request, new AbortController().signal),
      (error) => {
        assert.equal(error.name, 'AiProviderError', message);
        assert.equal(error.kind, kind, message);
        return true;
      },
    );
  }

  // An ordinary upstream failure stays unclassified, so the handler still logs
  // `provider_error` for it; a timeout code (3007) and the analytics-only 4006 are not
  // binding quota codes and stay unclassified too.
  for (const message of [
    'AiInternalError: 5006: upstream unavailable',
    '3007: Request timeout',
    '4006: Account limit reached',
  ]) {
    const unclassified = new WorkersAiProvider({
      model: '@cf/model',
      ai: { run: async () => { throw new Error(message); } },
    });
    await assert.rejects(
      unclassified.generateOutfits(request, new AbortController().signal),
      (error) => {
        assert.equal(error.name, 'Error', message);
        assert.equal(error.kind, undefined, message);
        return true;
      },
    );
  }
});

// A capacity refusal of one attempt leaves the other Workers AI models their turn: the
// handler's pool-spent skip fires only on `quota_exceeded`.
test('an out-of-capacity binding is not read as a spent quota and the next Workers AI model still runs', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  let secondBindingCalls = 0;
  const capacityError = new Error('3040: No more data centers to forward the request to');
  const handler = createAiHandler({ providers: [
    new WorkersAiProvider({
      model: '@cf/out-of-capacity',
      ai: { run: async () => { throw capacityError; } },
    }),
    new WorkersAiProvider({
      model: '@cf/second',
      ai: { run: async () => { secondBindingCalls += 1; throw capacityError; } },
    }),
  ] });
  const response = await handler(new Request('http://localhost/v1/ai/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  }), { waitUntil() {} });

  assert.equal(secondBindingCalls, 1);
  assert.equal(response.status, 503);
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: '@cf/out-of-capacity', reason: 'rate_limited' },
    { event: 'ai_provider_attempt_failed', model: '@cf/second', reason: 'rate_limited' },
  ]);
  assert.equal(JSON.stringify(warnings).includes('3040'), false);
});

test('a caller-supplied token budget narrows max_tokens; a recommendation keeps the full one', async () => {
  const budgets = [];
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run(_model, input) {
        budgets.push(input.max_tokens);
        return { response: {} };
      },
    },
  });
  const signal = new AbortController().signal;
  await provider.generateOutfits(request, signal, { maxTokens: 256 });
  await provider.generateOutfits(request, signal);
  assert.deepEqual(budgets, [256, 192]);
});

// The binding's synchronous output documents a `usage` object; its two token counts are
// the measured replacement for the chars/4 estimate behind WORKERS_AI_DAILY_ATTEMPT_LIMIT.
test('logs the binding-reported token usage as integers and nothing else', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      run: async () => ({
        response: { data: { picks: [] } },
        usage: { prompt_tokens: 2896.4, completion_tokens: 96, total_tokens: 2992 },
      }),
    },
  });
  await provider.generateOutfits(request, new AbortController().signal);
  assert.deepEqual(infos, [{
    event: 'ai_provider_usage',
    model: '@cf/model',
    promptTokens: 2896,
    completionTokens: 96,
  }]);
});

test('a missing or malformed usage object logs nothing and does not fail the call', async (t) => {
  const infos = [];
  t.mock.method(console, 'info', (entry) => infos.push(entry));
  for (const usage of [
    undefined,
    null,
    'usage',
    { prompt_tokens: '2896', completion_tokens: 96 },
    { prompt_tokens: 2896 },
    { prompt_tokens: Number.NaN, completion_tokens: 96 },
  ]) {
    const provider = new WorkersAiProvider({
      model: '@cf/model',
      ai: { run: async () => ({ response: {}, usage }) },
    });
    await provider.generateOutfits(request, new AbortController().signal);
  }
  assert.deepEqual(infos, []);
});

// The Neuron pool is account-level, so a spent Workers AI binding skips the remaining
// Workers AI models, which can only fail the same way, and hands the turn to OpenRouter.
test('a quota-exhausted binding skips the other Workers AI model and leaks nothing', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  let secondBindingCalls = 0;
  let nextProviderCalls = 0;
  const handler = createAiHandler({ providers: [
    new WorkersAiProvider({
      model: '@cf/quota-exhausted',
      ai: { run: async () => { throw quotaError; } },
    }),
    new WorkersAiProvider({
      model: '@cf/second',
      ai: { run: async () => { secondBindingCalls += 1; throw quotaError; } },
    }),
    {
      id: 'openrouter',
      model: 'provider/next',
      async generateOutfits() {
        nextProviderCalls += 1;
        throw new Error('the next provider also failed');
      },
    },
  ] });
  const response = await handler(new Request('http://localhost/v1/ai/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  }), { waitUntil() {} });
  const serialized = await response.text();

  assert.equal(secondBindingCalls, 0);
  assert.equal(nextProviderCalls, 1);
  assert.equal(response.status, 503);
  assert.equal(serialized, '{"error":{"code":"ai_unavailable"}}');
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: '@cf/quota-exhausted', reason: 'quota_exceeded' },
    { event: 'ai_workers_ai_quota_exhausted', model: '@cf/quota-exhausted' },
    { event: 'ai_provider_attempt_failed', model: 'provider/next', reason: 'provider_error' },
  ]);
  // The binding's own text stays inside the Worker: neither the response nor the log
  // repeats it.
  for (const forbidden of ['3036', 'neurons', 'Workers Paid', '429', 'option-1']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
    assert.equal(JSON.stringify(warnings).includes(forbidden), false, forbidden);
  }
});
