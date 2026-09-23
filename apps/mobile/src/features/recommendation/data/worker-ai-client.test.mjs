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
  assert.equal(received.input, 'https://worker.example/v2/ai/recommend');
  assert.equal(received.init.method, 'POST');
  assert.equal(received.init.headers['content-type'], 'application/json');
  assert.equal(received.init.headers['x-kuyara-ai-budget-ms'], '37000');
  assert.deepEqual(JSON.parse(received.init.body), { ...request, locale: 'en' });
});

test('sends the application locale and preserves optional v2 prose', async () => {
  let sent;
  const client = new WorkerAiClient({
    baseUrl: 'https://worker.example',
    fetch: async (_input, init) => {
      sent = JSON.parse(init.body);
      return Response.json({ data: { ...responseData, insightSentence: 'Bu gün için uygun.' } });
    },
  });
  const data = await client.recommend(request, { locale: 'tr' });
  assert.equal(sent.locale, 'tr');
  assert.equal('styleAesthetics' in sent, false);
  assert.equal(data.insightSentence, 'Bu gün için uygun.');
});

test('drops a malformed optional sentence while retaining valid picks', async () => {
  const client = new WorkerAiClient({ baseUrl: 'https://worker.example', fetch: async () =>
    Response.json({ data: { ...responseData, insightSentence: 'Two sentences. Another.' } }) });
  assert.deepEqual(await client.recommend(request), responseData);
});

test('sends the routed client timeout minus the transport margin', async () => {
  let receivedHeaders;
  const client = new WorkerAiClient({
    baseUrl: 'https://worker.example',
    fetch: async (_input, init) => {
      receivedHeaders = init.headers;
      return Response.json({ data: responseData });
    },
  });

  await client.recommend(request, { timeoutMilliseconds: 14_000 });

  assert.equal(receivedHeaders['x-kuyara-ai-budget-ms'], '13000');
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

test('waits the default 38 s budget before aborting a slow Worker attempt', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let aborted = false;
  const client = new WorkerAiClient({
    baseUrl: 'https://worker.example',
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('raw timeout details'));
      });
    }),
  });

  const pending = client.recommend(request).catch((error) => error);
  t.mock.timers.tick(37_999);
  await Promise.resolve();
  assert.equal(aborted, false);
  t.mock.timers.tick(1);
  const error = await pending;
  assert.equal(aborted, true);
  assert.ok(error instanceof WorkerAiClientError && error.kind === 'network');
});
