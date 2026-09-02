import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WorkerAiClient,
  WorkerAiClientError,
} from './worker-ai-client.ts';

const request = {
  clothingPreference: 'womens',
  catalogVersion: 3,
  dayVariant: 3,
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  options: [
    option('option-1', 't_shirt', 'shorts', 'sneakers'),
    option('option-2', 'long_sleeve_t_shirt', 'jeans', 'sandals'),
    option('option-3', 'shirt', 'trousers', 'closed_shoes', 'smart'),
  ],
};

const responseData = {
  picks: [
    { optionId: 'option-1', archetypeId: 'everyday_easy' },
    { optionId: 'option-2', archetypeId: 'weekend_relaxed' },
    { optionId: 'option-3', archetypeId: 'smart_casual' },
  ],
};

function option(optionId, primaryTop, bottom, footwear, formality = 'casual') {
  return {
    optionId,
    formality,
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: primaryTop },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: bottom },
      { slot: 'footwear', layerRole: null, garmentTypeId: footwear },
    ],
    traits: {
      hasMidLayer: false,
      hasOuterLayer: false,
      outerThermalHigh: false,
      outerWaterProtective: false,
      windResistant: false,
      tractionEnhanced: false,
      breathabilityHigh: primaryTop === 't_shirt',
    },
  };
}

test('posts the validated recommendation request and returns validated data', async () => {
  let received;
  const client = new WorkerAiClient({
    baseUrl: 'https://worker.example/',
    fetch: async (input, init) => {
      received = { input, init };
      return new Response(JSON.stringify({ data: responseData }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const result = await client.recommend(request);

  assert.deepEqual(result, responseData);
  assert.equal(received.input, 'https://worker.example/v1/ai/recommend');
  assert.equal(received.init.method, 'POST');
  assert.equal(received.init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(received.init.body), request);
});

test('rejects malformed success data without repairing it', async () => {
  const client = new WorkerAiClient({
    baseUrl: 'https://worker.example',
    fetch: async () => new Response(JSON.stringify({
      data: { picks: responseData.picks.slice(0, 2) },
    }), { status: 200 }),
  });

  await assert.rejects(
    () => client.recommend(request),
    (error) => error instanceof WorkerAiClientError &&
      error.kind === 'invalid-response' &&
      !String(error).includes('outfits'),
  );
});

test('maps non-2xx, network, and timeout failures to sanitized errors', async () => {
  const cases = [
    {
      fetch: async () => new Response(JSON.stringify({
        error: { code: 'ai_unavailable' },
      }), { status: 503 }),
      kind: 'service',
    },
    {
      fetch: async () => { throw new Error('raw network details'); },
      kind: 'network',
    },
    {
      fetch: async (_input, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('raw timeout details')));
      }),
      kind: 'network',
      requestTimeoutMilliseconds: 1,
    },
  ];

  for (const scenario of cases) {
    const client = new WorkerAiClient({
      baseUrl: 'https://worker.example',
      fetch: scenario.fetch,
      requestTimeoutMilliseconds: scenario.requestTimeoutMilliseconds,
    });
    await assert.rejects(
      () => client.recommend(request),
      (error) => error instanceof WorkerAiClientError &&
        error.kind === scenario.kind &&
        !/provider|network details|timeout details/i.test(String(error)),
    );
  }
});
