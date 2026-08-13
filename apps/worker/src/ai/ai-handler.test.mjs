import assert from 'node:assert/strict';
import test from 'node:test';

import { aiRecommendV1SuccessSchema } from '@kuyara/contracts';

import { createAiHandler } from './ai-handler.ts';
import { DeterministicStubAiProvider } from './stub-ai-provider.ts';

function candidate(candidateKey, category, garmentTypeId, bodyRegion) {
  return {
    candidateKey,
    source: 'catalog',
    garmentTypeId,
    colorFamily: 'blue',
    properties: {
      category,
      bodyRegion,
      supportedLayerRoles: ['standalone'],
      thermalLevel: 'light',
      waterProtection: 'none',
      windProtection: 'none',
      breathability: 'high',
      armCoverage: category === 'top' ? 'partial' : null,
      legCoverage: category === 'bottom' ? 'full' : null,
      tractionSuitability: category === 'footwear' ? 'everyday' : null,
    },
  };
}

function validRequestBody() {
  return {
    clothingPreference: 'womens',
    requirements: [{
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes: ['temperature_low'],
    }],
    candidates: [
      candidate('top:1', 'top', 't_shirt', 'upper_body'),
      candidate('top:2', 'top', 'shirt', 'upper_body'),
      candidate('bottom:1', 'bottom', 'trousers', 'lower_body'),
      candidate('bottom:2', 'bottom', 'jeans', 'lower_body'),
      candidate('shoe:1', 'footwear', 'sneakers', 'feet'),
      candidate('shoe:2', 'footwear', 'closed_shoes', 'feet'),
    ],
  };
}

function validOutput(suffix = '1') {
  const outfit = [
    { slot: 'primary_top', layerRole: 'standalone', candidateKey: `top:${suffix}` },
    { slot: 'bottom', layerRole: 'standalone', candidateKey: `bottom:${suffix}` },
    { slot: 'footwear', layerRole: null, candidateKey: `shoe:${suffix}` },
  ];
  return { data: { outfits: [outfit, outfit, outfit] } };
}

function request(options = {}) {
  const method = options.method ?? 'POST';
  const headers = options.headers ?? { 'content-type': 'application/json' };
  const path = options.path ?? '/v1/ai/recommend';
  const body = Object.hasOwn(options, 'body')
    ? options.body
    : JSON.stringify(validRequestBody());
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

async function assertError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { code } });
}

test('returns a contract-valid success using only request candidate keys', async () => {
  const response = await createAiHandler({
    providers: [new DeterministicStubAiProvider()],
  })(request());
  const body = await response.json();
  const requestKeys = new Set(validRequestBody().candidates.map(({ candidateKey }) => candidateKey));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(aiRecommendV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.outfits.every((outfit) =>
    outfit.every(({ candidateKey }) => requestKeys.has(candidateKey))), true);
});

test('falls back in order after a provider throws', async () => {
  const calls = [];
  const expected = validOutput('2');
  const handler = createAiHandler({ providers: [
    {
      async generateOutfits() {
        calls.push('failing');
        throw new Error('private failing provider');
      },
    },
    {
      async generateOutfits() {
        calls.push('succeeding');
        return expected;
      },
    },
  ] });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
  assert.deepEqual(calls, ['failing', 'succeeding']);
});

test('stops after the first successful provider', async () => {
  let laterCalls = 0;
  const response = await createAiHandler({ providers: [
    { generateOutfits: async () => validOutput() },
    {
      async generateOutfits() {
        laterCalls += 1;
        return validOutput('2');
      },
    },
  ] })(request());

  assert.equal(response.status, 200);
  assert.equal(laterCalls, 0);
});

test('aborts a timed-out provider and falls through', async () => {
  let observedAbort = false;
  const slowProvider = {
    generateOutfits(_body, signal) {
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          observedAbort = signal.aborted;
          resolve(validOutput());
        }, { once: true });
      });
    },
  };
  const response = await createAiHandler({
    providers: [slowProvider, { generateOutfits: async () => validOutput('2') }],
    attemptTimeoutMs: 10,
  })(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput('2'));
  assert.equal(observedAbort, true);
});

test('rejects structurally invalid provider outputs', async () => {
  const duplicateSlot = validOutput();
  duplicateSlot.data.outfits[0][1].slot = 'primary_top';
  const missingFootwear = validOutput();
  missingFootwear.data.outfits[0].pop();
  const wrongOutfitCount = { data: { outfits: validOutput().data.outfits.slice(0, 2) } };

  for (const output of [wrongOutfitCount, missingFootwear, duplicateSlot]) {
    await assertError(
      await createAiHandler({ providers: [{ generateOutfits: async () => output }] })(request()),
      503,
      'ai_unavailable',
    );
  }
});

test('rejects provider output containing a candidate key outside the request set', async () => {
  const output = validOutput();
  output.data.outfits[0][0].candidateKey = 'unknown:key';
  await assertError(
    await createAiHandler({ providers: [{ generateOutfits: async () => output }] })(request()),
    503,
    'ai_unavailable',
  );
});

test('rejects a duplicate candidate key within one outfit', async () => {
  const output = validOutput();
  output.data.outfits[0][1].candidateKey = 'top:1';
  await assertError(
    await createAiHandler({ providers: [{ generateOutfits: async () => output }] })(request()),
    503,
    'ai_unavailable',
  );
});

test('collapses exhausted providers to one exact sanitized unavailable error', async () => {
  const handler = createAiHandler({ providers: [{
    async generateOutfits() {
      throw new Error('Provider SecretName rejected rule_x for top:1 clothingPreference');
    },
  }] });
  const response = await handler(request());
  const serialized = await response.text();

  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(serialized, '{"error":{"code":"ai_unavailable"}}');
  for (const forbidden of [
    'SecretName', 'rule_x', 'top:1', 'clothingPreference', 'womens',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('an empty provider list returns ai_unavailable', async () => {
  await assertError(
    await createAiHandler({ providers: [] })(request()),
    503,
    'ai_unavailable',
  );
});

test('GET and PUT return method_not_allowed with Allow POST', async () => {
  const handler = createAiHandler({ providers: [] });
  for (const method of ['GET', 'PUT']) {
    const response = await handler(request({ method, body: undefined }));
    assert.equal(response.headers.get('allow'), 'POST');
    await assertError(response, 405, 'method_not_allowed');
  }
});

test('wrong content type, malformed JSON, and schema violations return invalid_request', async () => {
  const handler = createAiHandler({ providers: [] });
  await assertError(await handler(request({
    headers: { 'content-type': 'text/plain' },
  })), 400, 'invalid_request');
  await assertError(await handler(request({ body: '{' })), 400, 'invalid_request');
  await assertError(await handler(request({
    body: JSON.stringify({ ...validRequestBody(), clothingPreference: 'private' }),
  })), 400, 'invalid_request');
});
