import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiHandler } from './ai-handler.ts';
import { OpenRouterAiProvider } from './openrouter-ai-provider.ts';

const request = {
  clothingPreference: 'womens',
  catalogVersion: 3,
  dayVariant: 0,
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

test('posts a per-request structured output schema and returns parsed content verbatim', async () => {
  const expected = { data: { picks: [] } };
  const signal = new AbortController().signal;
  let captured;
  const provider = new OpenRouterAiProvider({
    apiKey: 'secret-key',
    model: 'provider/model',
    fetch: async (url, init) => {
      captured = { url, init };
      return Response.json({
        choices: [{ message: { content: JSON.stringify(expected) } }],
      });
    },
  });
  const result = await provider.generateOutfits(request, signal);
  const body = JSON.parse(captured.init.body);
  const pickProperties = body.response_format.json_schema.schema
    .properties.data.properties.picks.items.properties;
  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer secret-key');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.signal, signal);
  assert.equal(body.model, 'provider/model');
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.deepEqual(pickProperties.optionId.enum, ['option-1']);
  assert.equal(pickProperties.archetypeId.enum.length, 12);
  assert.equal(body.provider.require_parameters, true);
  assert.deepEqual(result, expected);
});

test('rejects non-2xx responses without exposing secrets or provider response text', async () => {
  const apiKey = 'private-api-key';
  const responseText = 'private provider response';
  const provider = new OpenRouterAiProvider({
    apiKey,
    model: 'provider/model',
    fetch: async () => new Response(responseText, { status: 401 }),
  });
  await assert.rejects(
    provider.generateOutfits(request, new AbortController().signal),
    (error) => {
      assert.equal(error.message, 'OpenRouter request failed.');
      assert.equal(error.message.includes(apiKey), false);
      assert.equal(error.message.includes(responseText), false);
      return true;
    },
  );
});

test('rejects non-JSON model content', async () => {
  const provider = new OpenRouterAiProvider({
    apiKey: 'secret-key',
    model: 'provider/model',
    fetch: async () => Response.json({
      choices: [{ message: { content: 'not json' } }],
    }),
  });
  await assert.rejects(
    provider.generateOutfits(request, new AbortController().signal),
  );
});

test('rejects a null response envelope as invalid', async () => {
  const provider = new OpenRouterAiProvider({
    apiKey: 'secret-key',
    model: 'provider/model',
    fetch: async () => Response.json(null),
  });
  await assert.rejects(
    provider.generateOutfits(request, new AbortController().signal),
    { message: 'OpenRouter response invalid.' },
  );
});

// OpenRouter answers an exhausted free-model allowance with an HTTP 429 whose JSON body
// names the exceeded allowance and whose headers report the remaining quota.
const rateLimitedBody = JSON.stringify({
  error: { message: 'Rate limit exceeded: free-models-per-day', code: 429 },
});

const rateLimitedFetch = async () => new Response(rateLimitedBody, {
  status: 429,
  headers: { 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0' },
});

test('a rate-limited response fails as a provider error without the key or the provider text', async () => {
  const apiKey = 'private-api-key';
  const controller = new AbortController();
  const provider = new OpenRouterAiProvider({
    apiKey,
    model: 'provider/model',
    fetch: rateLimitedFetch,
  });
  await assert.rejects(
    provider.generateOutfits(request, controller.signal),
    (error) => {
      // A provider error, not a timeout: the handler classifies it as `provider_error` and
      // gives the next provider its turn.
      assert.equal(controller.signal.aborted, false);
      assert.equal(error.message, 'OpenRouter request failed.');
      for (const forbidden of [apiKey, 'free-models-per-day', 'Rate limit', '429', 'option-1']) {
        assert.equal(error.message.includes(forbidden), false, forbidden);
      }
      return true;
    },
  );
});

test('a rate-limited response hands the turn to the next provider and leaks nothing', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  let nextProviderCalls = 0;
  const handler = createAiHandler({ providers: [
    new OpenRouterAiProvider({
      apiKey: 'private-api-key',
      model: 'provider/rate-limited',
      fetch: rateLimitedFetch,
    }),
    {
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
  }));
  const serialized = await response.text();

  assert.equal(nextProviderCalls, 1);
  assert.equal(response.status, 503);
  assert.equal(serialized, '{"error":{"code":"ai_unavailable"}}');
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: 'provider/rate-limited', reason: 'provider_error' },
    { event: 'ai_provider_attempt_failed', model: 'provider/next', reason: 'provider_error' },
  ]);
  for (const forbidden of ['private-api-key', 'free-models-per-day', 'X-RateLimit-Remaining', 'option-1']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
    assert.equal(JSON.stringify(warnings).includes(forbidden), false, forbidden);
  }
});
