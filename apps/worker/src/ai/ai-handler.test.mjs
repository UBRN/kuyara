import assert from 'node:assert/strict';
import test from 'node:test';

import { aiRecommendV1SuccessSchema } from '@kuyara/contracts';

import { createAiHandler } from './ai-handler.ts';
import { DeterministicStubAiProvider } from './stub-ai-provider.ts';

const defaultTraits = {
  hasMidLayer: false,
  hasOuterLayer: false,
  outerThermalHigh: false,
  outerWaterProtective: false,
  windResistant: false,
  tractionEnhanced: false,
  breathabilityHigh: false,
};

function separatesOption(
  optionId,
  formality,
  primaryTop,
  bottom,
  footwear,
  traits = {},
) {
  return {
    optionId,
    formality,
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: primaryTop },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: bottom },
      { slot: 'footwear', layerRole: null, garmentTypeId: footwear },
    ],
    traits: { ...defaultTraits, ...traits },
  };
}

function onePieceOption(optionId, formality, onePiece, footwear, traits = {}) {
  return {
    optionId,
    formality,
    garments: [
      { slot: 'one_piece', layerRole: 'standalone', garmentTypeId: onePiece },
      { slot: 'footwear', layerRole: null, garmentTypeId: footwear },
    ],
    traits: { ...defaultTraits, ...traits },
  };
}

function validRequestBody() {
  return {
    clothingPreference: 'womens',
    catalogVersion: 2,
    dayVariant: 0,
    requirements: [{
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes: ['temperature_low'],
    }],
    options: [
      separatesOption(
        'option-casual',
        'casual',
        't_shirt',
        'trousers',
        'sneakers',
        { breathabilityHigh: true },
      ),
      separatesOption(
        'option-smart',
        'smart',
        'shirt',
        'jeans',
        'closed_shoes',
      ),
      onePieceOption('option-formal', 'formal', 'dress', 'ankle_boots'),
    ],
  };
}

function validOutput() {
  return {
    data: {
      picks: [
        { optionId: 'option-casual', archetypeId: 'weekend_relaxed' },
        { optionId: 'option-smart', archetypeId: 'smart_casual' },
        { optionId: 'option-formal', archetypeId: 'office_ready' },
      ],
    },
  };
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

function installMemoryCache() {
  const previous = globalThis.caches;
  const entries = new Map();
  globalThis.caches = {
    default: {
      async match(cacheRequest) {
        return entries.get(cacheRequest.url)?.clone();
      },
      async put(cacheRequest, response) {
        entries.set(cacheRequest.url, response.clone());
      },
    },
  };
  return () => {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  };
}

test('returns a contract-valid pick response using supplied option ids', async () => {
  const response = await createAiHandler({
    providers: [new DeterministicStubAiProvider()],
  })(request());
  const body = await response.json();
  const optionIds = new Set(validRequestBody().options.map(({ optionId }) => optionId));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(aiRecommendV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.picks.every(({ optionId }) => optionIds.has(optionId)), true);
});

test('falls back in order after a provider throws', async () => {
  const calls = [];
  const expected = validOutput();
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

test('rejects an unsupplied option id and tries the next provider', async () => {
  const invalid = validOutput();
  invalid.data.picks[0].optionId = 'unsupplied-option';
  let fallbackCalls = 0;
  const response = await createAiHandler({ providers: [
    { generateOutfits: async () => invalid },
    {
      async generateOutfits() {
        fallbackCalls += 1;
        return validOutput();
      },
    },
  ] })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.equal(fallbackCalls, 1);
});

test('rejects duplicate option or archetype ids and tries the next provider', async () => {
  const duplicateOption = validOutput();
  duplicateOption.data.picks[1].optionId = duplicateOption.data.picks[0].optionId;
  const duplicateArchetype = validOutput();
  duplicateArchetype.data.picks[1].archetypeId = duplicateArchetype.data.picks[0].archetypeId;
  for (const invalid of [duplicateOption, duplicateArchetype]) {
    let fallbackCalls = 0;
    const response = await createAiHandler({ providers: [
      { generateOutfits: async () => invalid },
      {
        async generateOutfits() {
          fallbackCalls += 1;
          return validOutput();
        },
      },
    ] })(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), validOutput());
    assert.equal(fallbackCalls, 1);
  }
});

test('rejects an archetype whose own option fails its precondition', async () => {
  const invalid = validOutput();
  invalid.data.picks[0].archetypeId = 'office_ready';
  invalid.data.picks[2].archetypeId = 'everyday_easy';
  const response = await createAiHandler({ providers: [
    { generateOutfits: async () => invalid },
    { generateOutfits: async () => validOutput() },
  ] })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
});

test('accepts every archetype when its option satisfies the precondition', async () => {
  const cases = [
    ['everyday_easy', validRequestBody().options[0]],
    ['smart_casual', validRequestBody().options[1]],
    ['office_ready', validRequestBody().options[2]],
    ['weekend_relaxed', validRequestBody().options[0]],
    ['layered_warmth', separatesOption(
      'layered', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { hasMidLayer: true, hasOuterLayer: true },
    )],
    ['cold_shield', separatesOption(
      'cold', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { outerThermalHigh: true },
    )],
    ['rain_ready', separatesOption(
      'rain', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { outerWaterProtective: true },
    )],
    ['snow_day', separatesOption(
      'snow', 'casual', 't_shirt', 'trousers', 'weather_boots',
      { tractionEnhanced: true },
    )],
    ['wind_guard', separatesOption(
      'wind', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { windResistant: true },
    )],
    ['light_and_airy', separatesOption(
      'airy', 'casual', 't_shirt', 'shorts', 'sandals',
      { breathabilityHigh: true },
    )],
    ['on_the_move', validRequestBody().options[0]],
    ['in_between', separatesOption(
      'between', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { hasMidLayer: true },
    )],
  ];
  for (const [archetypeId, testedOption] of cases) {
    const body = validRequestBody();
    const optionUnderTest = { ...structuredClone(testedOption), optionId: `tested-${archetypeId}` };
    const formalSupport = onePieceOption(
      'support-formal', 'formal', 'jumpsuit', 'ankle_boots',
    );
    const casualSupport = separatesOption(
      'support-casual',
      'casual',
      'blouse',
      'skirt',
      'sneakers',
      { breathabilityHigh: true },
    );
    body.options = [optionUnderTest, formalSupport, casualSupport];
    const formalArchetype = ['office_ready', 'smart_casual', 'everyday_easy']
      .find((candidate) => candidate !== archetypeId);
    const casualArchetype = [
      'weekend_relaxed', 'light_and_airy', 'on_the_move', 'everyday_easy',
    ].find((candidate) => candidate !== archetypeId && candidate !== formalArchetype);
    const output = { data: { picks: [
      { optionId: optionUnderTest.optionId, archetypeId },
      { optionId: formalSupport.optionId, archetypeId: formalArchetype },
      { optionId: casualSupport.optionId, archetypeId: casualArchetype },
    ] } };
    const response = await createAiHandler({
      providers: [{ generateOutfits: async () => output }],
    })(request({ body: JSON.stringify(body) }));
    assert.equal(response.status, 200, archetypeId);
  }
});

test('rejects three picks that are not pairwise meaningfully different', async () => {
  const body = validRequestBody();
  body.options = [
    separatesOption(
      'same-1', 'casual', 't_shirt', 'trousers', 'sneakers',
      { breathabilityHigh: true },
    ),
    separatesOption(
      'same-2', 'casual', 't_shirt', 'trousers', 'closed_shoes',
      { breathabilityHigh: true },
    ),
    separatesOption(
      'same-3', 'casual', 't_shirt', 'trousers', 'ankle_boots',
      { breathabilityHigh: true },
    ),
  ];
  const output = {
    data: {
      picks: [
        { optionId: 'same-1', archetypeId: 'everyday_easy' },
        { optionId: 'same-2', archetypeId: 'weekend_relaxed' },
        { optionId: 'same-3', archetypeId: 'light_and_airy' },
      ],
    },
  };
  await assertError(
    await createAiHandler({
      providers: [{ generateOutfits: async () => output }],
    })(request({ body: JSON.stringify(body) })),
    503,
    'ai_unavailable',
  );
});

test('accepts same-core picks when every pair differs by at least two garment pairs', async () => {
  const body = validRequestBody();
  body.options = [
    separatesOption('same-core-1', 'casual', 't_shirt', 'trousers', 'sneakers'),
    {
      ...separatesOption(
        'same-core-2', 'casual', 't_shirt', 'trousers', 'closed_shoes',
        { hasMidLayer: true },
      ),
      garments: [
        { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
        { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
        { slot: 'mid_layer', layerRole: 'mid', garmentTypeId: 'cardigan' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'closed_shoes' },
      ],
    },
    {
      ...separatesOption(
        'same-core-3', 'casual', 't_shirt', 'trousers', 'ankle_boots',
        { hasOuterLayer: true, outerWaterProtective: true },
      ),
      garments: [
        { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
        { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
        { slot: 'outer_layer', layerRole: 'outer', garmentTypeId: 'rain_jacket' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'ankle_boots' },
      ],
    },
  ];
  const output = { data: { picks: [
    { optionId: 'same-core-1', archetypeId: 'everyday_easy' },
    { optionId: 'same-core-2', archetypeId: 'in_between' },
    { optionId: 'same-core-3', archetypeId: 'rain_ready' },
  ] } };
  const response = await createAiHandler({
    providers: [{ generateOutfits: async () => output }],
  })(request({ body: JSON.stringify(body) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), output);
});

test('limits default provider attempts to four', async () => {
  let attempts = 0;
  const provider = {
    async generateOutfits() {
      attempts += 1;
      throw new Error('provider failed');
    },
  };
  const response = await createAiHandler({ providers: Array(5).fill(provider) })(request());
  await assertError(response, 503, 'ai_unavailable');
  assert.equal(attempts, 4);
});

test('stops after the first successful provider', async () => {
  let laterCalls = 0;
  const response = await createAiHandler({ providers: [
    { generateOutfits: async () => validOutput() },
    {
      async generateOutfits() {
        laterCalls += 1;
        return validOutput();
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
    providers: [slowProvider, { generateOutfits: async () => validOutput() }],
    attemptTimeoutMs: 10,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.equal(observedAbort, true);
});

test('a second identical request is served from shared cache', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const first = await handle(request());
    const second = await handle(request());
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await second.json(), validOutput());
    assert.equal(providerCalls, 1);
  } finally {
    restore();
  }
});

test('a request differing only in dayVariant is a shared-cache miss', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const nextDay = validRequestBody();
    nextDay.dayVariant = 1;
    assert.equal((await handle(request())).status, 200);
    assert.equal((await handle(request({ body: JSON.stringify(nextDay) }))).status, 200);
    assert.equal(providerCalls, 2);
  } finally {
    restore();
  }
});

test('cache identity sorts requirements and excludes reason codes', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const first = validRequestBody();
    first.requirements.push({
      kind: 'wind_protection',
      minimum: 'wind_resistant',
      priority: 'optional',
      reasonCodes: ['wind_elevated'],
    });
    const equivalent = structuredClone(first);
    equivalent.requirements.reverse();
    equivalent.requirements[1].reasonCodes = ['apparent_temperature_low'];
    assert.equal((await handle(request({ body: JSON.stringify(first) }))).status, 200);
    assert.equal((await handle(request({ body: JSON.stringify(equivalent) }))).status, 200);
    assert.equal(providerCalls, 1);
  } finally {
    restore();
  }
});

test('shared cache read and write failures fall through without failing generation', async () => {
  const previous = globalThis.caches;
  globalThis.caches = { default: {
    async match() { throw new Error('cache read failed'); },
    async put() { throw new Error('cache write failed'); },
  } };
  try {
    const response = await createAiHandler({
      providers: [{ generateOutfits: async () => validOutput() }],
    })(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), validOutput());
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
});

test('collapses exhausted providers to one exact sanitized unavailable error', async () => {
  const handler = createAiHandler({ providers: [{
    async generateOutfits() {
      throw new Error('Provider SecretName rejected option-casual clothingPreference');
    },
  }] });
  const response = await handler(request());
  const serialized = await response.text();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(serialized, '{"error":{"code":"ai_unavailable"}}');
  for (const forbidden of [
    'SecretName', 'option-casual', 'clothingPreference', 'womens',
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

test('rate limiter denial returns rate_limited without calling a provider', async () => {
  let providerCalls = 0;
  const keys = [];
  const response = await createAiHandler({
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
  })(request({ headers: {
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.20',
  } }));
  assert.equal(response.headers.get('retry-after'), '60');
  await assertError(response, 429, 'rate_limited');
  assert.deepEqual(keys, ['recommend:203.0.113.20']);
  assert.equal(providerCalls, 0);
});

test('rate limiter approval preserves recommendation behavior', async () => {
  const keys = [];
  const response = await createAiHandler({
    providers: [{ generateOutfits: async () => validOutput() }],
    rateLimiter: {
      async limit(input) {
        keys.push(input.key);
        return { success: true };
      },
    },
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.deepEqual(keys, ['recommend:unknown']);
});

test('wrong content type, malformed JSON, and schema violations return invalid_request', async () => {
  const handler = createAiHandler({ providers: [] });
  assert.equal((await createAiHandler({
    providers: [new DeterministicStubAiProvider()],
  })(request({
    headers: { 'content-type': 'application/json; charset=utf-8' },
  }))).status, 200);
  await assertError(await handler(request({
    headers: { 'content-type': 'application/jsonp' },
  })), 400, 'invalid_request');
  await assertError(await handler(request({
    headers: { 'content-type': 'text/plain' },
  })), 400, 'invalid_request');
  await assertError(await handler(request({ body: '{' })), 400, 'invalid_request');
  await assertError(await handler(request({
    body: JSON.stringify({ ...validRequestBody(), clothingPreference: 'private' }),
  })), 400, 'invalid_request');
});
