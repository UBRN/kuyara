import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WorkerAiClient,
  WorkerAiClientError,
} from './worker-ai-client.ts';

const request = {
  clothingPreference: 'womens',
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  candidates: [
    candidate('catalog:t_shirt', 't_shirt', 'top', 'upper_body', ['base', 'standalone']),
    candidate('catalog:trousers', 'trousers', 'bottom', 'lower_body', ['standalone']),
    candidate('catalog:sneakers', 'sneakers', 'footwear', 'feet', []),
  ],
};

const responseData = {
  outfits: Array.from({ length: 3 }, () => [
    { slot: 'primary_top', layerRole: 'standalone', candidateKey: 'catalog:t_shirt' },
    { slot: 'bottom', layerRole: 'standalone', candidateKey: 'catalog:trousers' },
    { slot: 'footwear', layerRole: null, candidateKey: 'catalog:sneakers' },
  ]),
};

function candidate(candidateKey, garmentTypeId, category, bodyRegion, supportedLayerRoles) {
  return {
    candidateKey,
    source: 'catalog',
    garmentTypeId,
    colorFamily: null,
    properties: {
      category,
      bodyRegion,
      supportedLayerRoles,
      thermalLevel: 'light',
      waterProtection: null,
      windProtection: null,
      breathability: 'moderate',
      armCoverage: category === 'top' ? 'partial' : null,
      legCoverage: category === 'bottom' ? 'full' : null,
      tractionSuitability: category === 'footwear' ? 'everyday' : null,
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
      data: { outfits: responseData.outfits.slice(0, 2) },
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
