import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenRouterAiProvider } from './openrouter-ai-provider.ts';

const request = {
  clothingPreference: 'womens',
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  candidates: [{
    candidateKey: 'top:1',
    source: 'catalog',
    garmentTypeId: 't_shirt',
    colorFamily: 'blue',
    properties: {
      category: 'top',
      bodyRegion: 'upper_body',
      supportedLayerRoles: ['standalone'],
      thermalLevel: 'light',
      waterProtection: 'none',
      windProtection: 'none',
      breathability: 'high',
      armCoverage: 'partial',
      legCoverage: null,
      tractionSuitability: null,
    },
  }],
};

test('posts structured output request and returns parsed content verbatim', async () => {
  const expected = { data: { outfits: [] } };
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

  assert.equal(captured.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(captured.init.headers.Authorization, 'Bearer secret-key');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.signal, signal);
  assert.equal(body.model, 'provider/model');
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
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
