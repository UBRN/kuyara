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
  assert.equal(captured.input.max_tokens, 2048);
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
// message carries its own numeric code and text; the daily allocation is the 3040 family
// and the gateway reports it as a 429. The binding takes no AbortSignal, so a quota refusal
// arrives as an ordinary rejection rather than an abort, and the chain has to move on.
const quotaError = new Error(
  'AiError: 3040: Account daily Neurons limit exceeded (429 Too Many Requests)',
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
        '3040', 'Neurons', '429',
      ]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
      }
      return true;
    },
  );
});

test('binding failures are classified by their own code and text, and nothing else is', async () => {
  const cases = [
    ['AiError: 3040: Account daily Neurons limit exceeded (429 Too Many Requests)', 'quota_exceeded'],
    ['AiError: 4006: Account limit reached', 'quota_exceeded'],
    ['InferenceUpstreamError: Neurons exhausted for this account', 'quota_exceeded'],
    ['AiError: 3036: Too Many Requests', 'rate_limited'],
    ['429: rate limit reached for this model', 'rate_limited'],
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
  // `provider_error` for it.
  const unclassified = new WorkersAiProvider({
    model: '@cf/model',
    ai: { run: async () => { throw new Error('AiInternalError: 5006: upstream unavailable'); } },
  });
  await assert.rejects(
    unclassified.generateOutfits(request, new AbortController().signal),
    (error) => {
      assert.equal(error.name, 'Error');
      assert.equal(error.kind, undefined);
      return true;
    },
  );
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
  assert.deepEqual(budgets, [256, 2048]);
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
  for (const forbidden of ['3040', 'Neurons', '429', 'option-1']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
    assert.equal(JSON.stringify(warnings).includes(forbidden), false, forbidden);
  }
});
