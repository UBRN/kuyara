import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { aiRecommendV1SuccessSchema } from '@kuyara/contracts';

import {
  WORKERS_AI_DAILY_ATTEMPT_LIMIT,
  createAiHandler as createAiHandlerWithContext,
} from './ai-handler.ts';
import { AiProviderError } from './ai-provider.ts';
import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import { PROBE_DAILY_LIMIT } from './probe-handler.ts';

// The handler reports every provider attempt; keep that out of the test output.
mock.method(console, 'warn', () => {});
mock.method(console, 'info', () => {});

// A fake `ExecutionContext` collecting what the handler hands to `waitUntil`.
function fakeContext() {
  const pending = [];
  return { pending, waitUntil(promise) { pending.push(promise); } };
}

// Most tests do not care about the context: they get a fresh one per call and, as the
// runtime does before the isolate is reused, the work handed to `waitUntil` is settled
// before the response is returned, so a later request sees the cache write.
function createAiHandler(dependencies) {
  const handle = createAiHandlerWithContext(dependencies);
  return async (request, ctx = fakeContext()) => {
    const response = await handle(request, ctx);
    await Promise.allSettled(ctx.pending ?? []);
    return response;
  };
}

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
    catalogVersion: 3,
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
    providers: [{ generateOutfits: async () => validOutput() }],
  })(request());
  const body = await response.json();
  const optionIds = new Set(validRequestBody().options.map(({ optionId }) => optionId));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(aiRecommendV1SuccessSchema.safeParse(body).success, true);
  assert.equal(body.data.picks.every(({ optionId }) => optionIds.has(optionId)), true);
});

// The response schemas are tolerant readers: a stray key the model adds at any level is
// stripped by the gate rather than turned into `invalid_output`, and what reaches the wire
// and the shared cache is the parsed `result.data`, never the raw reply.
test('strips stray model-reply keys before the wire and the cache', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  let calls = 0;
  const handler = createAiHandler({ providers: [{
    id: 'openrouter',
    model: 'stub',
    async generateOutfits() {
      calls += 1;
      const reply = validOutput();
      reply.unexpected = 1;
      reply.data.unexpected = 1;
      reply.data.picks[0].unexpected = 1;
      return reply;
    },
  }] });

  const first = await handler(request());
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), validOutput());
  assert.equal(JSON.stringify(warnings).includes('invalid_output'), false);

  const second = await handler(request());
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), validOutput());
  assert.equal(calls, 1, 'the second identical request is served from the shared cache');
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

test('logs closed provider failure reasons and the successful model', async (t) => {
  const warnings = [];
  const infos = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  t.mock.method(console, 'info', (entry) => infos.push(entry));

  const response = await createAiHandler({ providers: [
    {
      model: 'provider/throws',
      async generateOutfits() {
        throw new Error('private provider failure');
      },
    },
    {
      model: 'provider/invalid',
      generateOutfits: async () => ({ data: { picks: [] } }),
    },
    {
      model: 'provider/succeeds',
      generateOutfits: async () => validOutput(),
    },
  ] })(request());

  assert.equal(response.status, 200);
  assert.deepEqual(warnings, [
    {
      event: 'ai_provider_attempt_failed',
      model: 'provider/throws',
      reason: 'provider_error',
    },
    {
      event: 'ai_provider_attempt_failed',
      model: 'provider/invalid',
      reason: 'invalid_output',
    },
  ]);
  assert.deepEqual(infos, [{
    event: 'ai_provider_attempt_succeeded',
    model: 'provider/succeeds',
    attempt: 3,
  }]);
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

// The weather half of the same rule: a label the day contradicts is refused however well the
// garment justifies it, so the gate stays as narrow as the eligibility lists the prompt
// offers and the two ends of the chain refuse the same answers.
test('the day decides rain_ready and snow_day, and the chain moves on to the honest label', async () => {
  const shellOption = {
    optionId: 'option-casual',
    formality: 'casual',
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
      { slot: 'outer_layer', layerRole: 'outer', garmentTypeId: 'rain_jacket' },
      { slot: 'footwear', layerRole: null, garmentTypeId: 'weather_boots' },
    ],
    traits: {
      ...defaultTraits,
      hasOuterLayer: true,
      outerWaterProtective: true,
      tractionEnhanced: true,
    },
  };
  const bodyFor = (reasonCode) => JSON.stringify({
    ...validRequestBody(),
    requirements: [
      {
        kind: 'water_protection',
        target: 'body',
        minimum: 'waterproof',
        priority: 'mandatory',
        reasonCodes: [reasonCode],
      },
      {
        kind: 'traction',
        minimum: 'enhanced',
        priority: 'mandatory',
        reasonCodes: [reasonCode],
      },
    ],
    options: [shellOption, ...validRequestBody().options.slice(1)],
  });
  const labelled = (archetypeId) => {
    const output = validOutput();
    output.data.picks[0].archetypeId = archetypeId;
    return output;
  };

  for (const [reasonCode, refused, accepted] of [
    ['condition_snow', 'rain_ready', 'snow_day'],
    ['condition_rain', 'snow_day', 'rain_ready'],
  ]) {
    const attempts = [];
    const response = await createAiHandler({ providers: [
      { model: 'first', generateOutfits: async () => { attempts.push(refused); return labelled(refused); } },
      { model: 'second', generateOutfits: async () => { attempts.push(accepted); return labelled(accepted); } },
    ] })(request({ body: bodyFor(reasonCode) }));

    assert.equal(response.status, 200, reasonCode);
    assert.deepEqual(await response.json(), labelled(accepted), reasonCode);
    assert.deepEqual(attempts, [refused, accepted], reasonCode);
  }
});

// A weekday is not a weekend, and nothing upstream knew that until the request carried it.
test('a weekday rejects a weekend_relaxed pick that any other day accepts', async () => {
  const weekday = JSON.stringify({ ...validRequestBody(), dayKind: 'weekday' });
  await assertError(
    await createAiHandler({
      providers: [{ generateOutfits: async () => validOutput() }],
    })(request({ body: weekday })),
    503,
    'ai_unavailable',
  );

  const relabelled = validOutput();
  relabelled.data.picks[0].archetypeId = 'everyday_easy';
  assert.equal(
    (await createAiHandler({
      providers: [{ generateOutfits: async () => relabelled }],
    })(request({ body: weekday }))).status,
    200,
  );

  const weekend = JSON.stringify({ ...validRequestBody(), dayKind: 'weekend' });
  for (const options of [{}, { body: weekend }]) {
    assert.equal(
      (await createAiHandler({
        providers: [{ generateOutfits: async () => validOutput() }],
      })(request(options))).status,
      200,
    );
  }
});

test('a legacy request rejects office_ready on smart while a day-aware request accepts it', async () => {
  const output = validOutput();
  output.data.picks = [
    { optionId: 'option-casual', archetypeId: 'on_the_move' },
    { optionId: 'option-smart', archetypeId: 'office_ready' },
    { optionId: 'option-formal', archetypeId: 'everyday_easy' },
  ];
  const provider = { generateOutfits: async () => output };

  await assertError(
    await createAiHandler({ providers: [provider] })(request()),
    503,
    'ai_unavailable',
  );
  for (const dayKind of ['weekday', 'weekend']) {
    const body = JSON.stringify({ ...validRequestBody(), dayKind });
    assert.equal(
      (await createAiHandler({ providers: [provider] })(request({ body }))).status,
      200,
    );
  }
});

test('accepts every archetype when its option satisfies the precondition', async () => {
  // The three weather archetypes need the day as well as the garment, so their cases carry
  // the requirements the day derives; the rest run on the fixture's own mild day.
  const dayOf = (reasonCode) => [{
    kind: 'water_protection',
    target: 'body',
    minimum: 'waterproof',
    priority: 'mandatory',
    reasonCodes: [reasonCode],
  }];
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
    ), dayOf('condition_rain')],
    ['snow_day', separatesOption(
      'snow', 'casual', 't_shirt', 'trousers', 'weather_boots',
      { tractionEnhanced: true },
    ), dayOf('condition_snow')],
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
  for (const [archetypeId, testedOption, dayRequirements] of cases) {
    const body = validRequestBody();
    if (dayRequirements) body.requirements = dayRequirements;
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
  // The case is distinctness, not labels: the fixture's day has nothing falling on it, so
  // the third option's rain jacket is labelled by what it is rather than by the shell.
  const output = { data: { picks: [
    { optionId: 'same-core-1', archetypeId: 'everyday_easy' },
    { optionId: 'same-core-2', archetypeId: 'in_between' },
    { optionId: 'same-core-3', archetypeId: 'weekend_relaxed' },
  ] } };
  const response = await createAiHandler({
    providers: [{ generateOutfits: async () => output }],
  })(request({ body: JSON.stringify(body) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), output);
});

test('limits default provider attempts to five', async () => {
  let attempts = 0;
  const provider = {
    async generateOutfits() {
      attempts += 1;
      throw new Error('provider failed');
    },
  };
  const response = await createAiHandler({ providers: Array(6).fill(provider) })(request());
  await assertError(response, 503, 'ai_unavailable');
  assert.equal(attempts, 5);
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

test('a request differing only in dayKind is a shared-cache miss', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const weekend = JSON.stringify({ ...validRequestBody(), dayKind: 'weekend' });
    assert.equal((await handle(request())).status, 200);
    assert.equal((await handle(request({ body: weekend }))).status, 200);
    assert.equal(providerCalls, 2);
  } finally {
    restore();
  }
});

test('requests with different offered option ids use different shared-cache entries', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const expandedOffer = validRequestBody();
    expandedOffer.options.push(separatesOption(
      'option-extra',
      'casual',
      'blouse',
      'skirt',
      'sneakers',
    ));
    assert.equal((await handle(request())).status, 200);
    assert.equal((await handle(request({ body: JSON.stringify(expandedOffer) }))).status, 200);
    assert.equal(providerCalls, 2);
  } finally {
    restore();
  }
});

// The canonical string the Worker hashed before the day facts and the gate version joined
// the key, so a test can leave an entry exactly where an older deploy left one.
async function preGateCacheUrl(body) {
  const canonical = [
    body.requirements
      .map(({ kind, priority, minimum, target }) => [kind, priority, minimum, target ?? ''].join('|'))
      .sort().join(','),
    body.options.map(({ optionId }) => optionId).sort().join(','),
    body.clothingPreference,
    body.dressStyle ?? 'smart',
    body.catalogVersion,
    body.dayVariant,
    body.dayKind ?? 'unknown',
  ].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  const hash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `https://kuyara.internal/v1/ai/recommend/${hash}`;
}

// Two requirement sets can project identically into the key and still describe different
// days, because the day is read from the reason codes the projection drops. Rain and snow
// ask for the same waterproof shell; only one of them may be labelled `snow_day`.
test('requests whose reason codes change the day use different shared-cache entries', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const rainy = validRequestBody();
    rainy.requirements.push({
      kind: 'water_protection',
      minimum: 'waterproof',
      priority: 'mandatory',
      target: 'body',
      reasonCodes: ['condition_rain'],
    });
    const snowy = structuredClone(rainy);
    snowy.requirements[1].reasonCodes = ['condition_snow'];
    assert.equal((await handle(request({ body: JSON.stringify(rainy) }))).status, 200);
    assert.equal((await handle(request({ body: JSON.stringify(snowy) }))).status, 200);
    assert.equal(providerCalls, 2, 'a wet day and a frozen day are separate entries');
  } finally {
    restore();
  }
});

// An answer chosen by an older gate keeps its day-blind labels for the whole thirty day
// TTL, and the client's own gate rejects them. The gate version in the key retires it.
test('an entry left under the pre-gate cache key is a miss', async () => {
  const restore = installMemoryCache();
  try {
    let providerCalls = 0;
    const handle = createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] });
    const body = validRequestBody();
    const stale = { data: { picks: [
      { optionId: 'option-casual', archetypeId: 'rain_ready' },
      { optionId: 'option-smart', archetypeId: 'smart_casual' },
      { optionId: 'option-formal', archetypeId: 'office_ready' },
    ] } };
    await globalThis.caches.default.put(
      new Request(await preGateCacheUrl(body)),
      new Response(JSON.stringify(stale), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await handle(request({ body: JSON.stringify(body) }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), validOutput());
    assert.equal(providerCalls, 1, 'the stale entry is not served');
  } finally {
    restore();
  }
});

test('cache identity sorts requirements and excludes reason codes that leave the day unchanged', async () => {
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

test('an empty provider list returns ai_unavailable and caches nothing', async () => {
  const restore = installMemoryCache();
  try {
    await assertError(
      await createAiHandler({ providers: [] })(request()),
      503,
      'ai_unavailable',
    );
    let providerCalls = 0;
    assert.equal((await createAiHandler({ providers: [{
      async generateOutfits() {
        providerCalls += 1;
        return validOutput();
      },
    }] })(request())).status, 200);
    // The identical request is generated, not served from a cached unavailable answer.
    assert.equal(providerCalls, 1);
  } finally {
    restore();
  }
});

// The deterministic "Standard suggestions" fallback is what the phone shows after this
// response, so the walk must end as soon as the providers are exhausted rather than sitting
// on the 36 s deadline. Mocked timers: the clock only moves when a timer is ticked, so an
// elapsed time of zero proves no attempt window was ever awaited.
test('every provider failing immediately ends the request without spending the deadline or caching', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const previous = globalThis.caches;
  const cacheWrites = [];
  globalThis.caches = { default: {
    async match() { return undefined; },
    async put(cacheRequest) { cacheWrites.push(cacheRequest.url); },
  } };
  try {
    let attempts = 0;
    const startedAt = Date.now();
    const response = await createAiHandler({ providers: Array.from({ length: 5 }, () => ({
      model: 'provider/immediate-failure',
      async generateOutfits() {
        attempts += 1;
        throw new Error('provider unavailable');
      },
    })) })(request());
    const serialized = await response.text();

    assert.equal(attempts, 5);
    assert.equal(Date.now() - startedAt, 0);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(serialized, '{"error":{"code":"ai_unavailable"}}');
    assert.deepEqual(cacheWrites, []);
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
});

test('GET and PUT return method_not_allowed with Allow POST', async () => {
  const handler = createAiHandler({ providers: [] });
  for (const method of ['GET', 'PUT']) {
    const response = await handler(request({ method, body: undefined }));
    assert.equal(response.headers.get('allow'), 'POST');
    await assertError(response, 405, 'method_not_allowed');
  }
});

test('rate limiter denial returns rate_limited without calling a provider', async (t) => {
  let providerCalls = 0;
  const keys = [];
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
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
  // A client rate-limit storm used to be invisible: the Worker returned 429 and logged
  // nothing. The IP that tripped it still never reaches the log.
  assert.deepEqual(warnings, [{
    event: 'rate_limited',
    route: '/v1/ai/recommend',
    limiter: 'ai_recommend_burst',
  }]);
  assert.equal(JSON.stringify(warnings).includes('203.0.113.20'), false);
});

test('a quota or rate-limit refusal logs its own reason and still falls through', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const refusal = (kind) => async () => { throw new AiProviderError(kind); };
  const response = await createAiHandler({ providers: [
    { model: 'provider/spent', generateOutfits: refusal('quota_exceeded') },
    { model: 'provider/throttled', generateOutfits: refusal('rate_limited') },
    { model: 'provider/succeeds', generateOutfits: async () => validOutput() },
  ] })(request());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: 'provider/spent', reason: 'quota_exceeded' },
    { event: 'ai_provider_attempt_failed', model: 'provider/throttled', reason: 'rate_limited' },
  ]);
});

test('a timed-out attempt is a timeout even when the provider raises a classified failure', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const response = await createAiHandler({
    attemptTimeoutMs: 20,
    providers: [{
      model: 'provider/stalls',
      generateOutfits: async () => new Promise((_resolve, reject) => {
        setTimeout(() => reject(new AiProviderError('quota_exceeded')), 60);
      }),
    }],
  })(request());

  assert.equal(response.status, 503);
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: 'provider/stalls', reason: 'timeout' },
  ]);
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
    providers: [{ generateOutfits: async () => validOutput() }],
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

test('shared cache separates all dress styles and treats absence as smart', async () => {
  const restore = installMemoryCache();
  try {
    let calls = 0;
    const handle = createAiHandler({ providers: [{ async generateOutfits() {
      calls += 1;
      return validOutput();
    } }] });
    for (const dressStyle of [undefined, 'smart', 'casual', 'formal', 'casual']) {
      const body = { ...validRequestBody(), dressStyle };
      assert.equal((await handle(request({ body: JSON.stringify(body) }))).status, 200);
    }
    assert.equal(calls, 3);
  } finally { restore(); }
});

// Mocked timers, because the margin between the two settings is one millisecond: on the
// real clock the rate limiter, the body parse and the cache lookup can spend it first.
test('stops the walk when the deadline cannot fit another useful attempt', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  let attempts = 0;
  const slowProvider = {
    generateOutfits(_body, signal) {
      attempts += 1;
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(validOutput()), { once: true });
      });
    },
  };
  const pending = createAiHandler({
    providers: [slowProvider, slowProvider],
    attemptTimeoutMs: 10,
    totalDeadlineMs: 11,
  })(request());

  while (attempts === 0) await Promise.resolve();
  t.mock.timers.tick(10);
  const response = await pending;

  assert.equal(attempts, 1);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'ai_unavailable' } });
});

test('uses the transmitted budget for a stalled first attempt and a healthy second', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const attempts = [];
  const handler = createAiHandler({ providers: [
    {
      generateOutfits(_body, signal) {
        attempts.push('stalled');
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve(validOutput()), { once: true });
        });
      },
    },
    {
      generateOutfits() {
        attempts.push('healthy');
        return new Promise((resolve) => {
          setTimeout(() => resolve(validOutput()), 4_500);
        });
      },
    },
    {
      generateOutfits() {
        attempts.push('late');
        return Promise.resolve(validOutput());
      },
    },
  ] });
  const pending = handler(request({ headers: {
    'content-type': 'application/json',
    'x-kuyara-ai-budget-ms': '13000',
  } }));

  while (attempts.length === 0) await Promise.resolve();
  assert.deepEqual(attempts, ['stalled']);
  t.mock.timers.tick(7_000);
  while (attempts.length === 1) await Promise.resolve();
  assert.deepEqual(attempts, ['stalled', 'healthy']);
  t.mock.timers.tick(4_500);
  await Promise.resolve();
  const response = await pending;

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.deepEqual(attempts, ['stalled', 'healthy']);
});

test('does not start an attempt after the transmitted deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  let attempts = 0;
  const stalledProvider = {
    generateOutfits(_body, signal) {
      attempts += 1;
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(validOutput()), { once: true });
      });
    },
  };
  const handler = createAiHandler({ providers: [
    stalledProvider,
    stalledProvider,
    { generateOutfits: async () => {
      attempts += 1;
      return validOutput();
    } },
  ] });
  const pending = handler(request({ headers: {
    'content-type': 'application/json',
    'x-kuyara-ai-budget-ms': '13000',
  } }));

  while (attempts === 0) await Promise.resolve();
  t.mock.timers.tick(7_000);
  while (attempts === 1) await Promise.resolve();
  t.mock.timers.tick(6_000);
  await Promise.resolve();
  const response = await pending;

  assert.equal(response.status, 503);
  assert.equal(attempts, 2);
});

// The maintainer's 2026-09-13 decision: the refresh takes as long as it needs as long as
// every provider gets its turn, so the default deadline has to outlast five 7 s attempts.
test('lets all five providers take their turn inside the default deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  let attempts = 0;
  const stalledProvider = {
    generateOutfits(_body, signal) {
      attempts += 1;
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(validOutput()), { once: true });
      });
    },
  };
  const handler = createAiHandler({
    providers: Array.from({ length: 5 }, () => stalledProvider),
  });
  const pending = handler(request());

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    while (attempts < attempt) await Promise.resolve();
    t.mock.timers.tick(7_000);
  }
  const response = await pending;

  assert.equal(attempts, 5);
  assert.equal(response.status, 503);
});

test('a successful answer hands the shared-cache write to waitUntil instead of awaiting it', async () => {
  const previous = globalThis.caches;
  let putResolve;
  let putCalls = 0;
  globalThis.caches = { default: {
    async match() { return undefined; },
    put() {
      putCalls += 1;
      return new Promise((resolve) => { putResolve = resolve; });
    },
  } };
  try {
    const ctx = fakeContext();
    const response = await createAiHandlerWithContext({
      providers: [{ generateOutfits: async () => validOutput() }],
    })(request(), ctx);
    assert.equal(response.status, 200);
    assert.equal(putCalls, 1);
    assert.equal(ctx.pending.length, 1, 'the cache write is handed to waitUntil');
    // The response returned while the write was still pending; settle it now.
    putResolve();
    await ctx.pending[0];
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
});

test('a failing cache write handed to waitUntil is caught and does not reject', async () => {
  const previous = globalThis.caches;
  globalThis.caches = { default: {
    async match() { return undefined; },
    async put() { throw new Error('cache write failed'); },
  } };
  try {
    const ctx = fakeContext();
    const response = await createAiHandlerWithContext({
      providers: [{ generateOutfits: async () => validOutput() }],
    })(request(), ctx);
    assert.equal(response.status, 200);
    assert.equal(ctx.pending.length, 1);
    await ctx.pending[0];
  } finally {
    if (previous === undefined) delete globalThis.caches;
    else globalThis.caches = previous;
  }
});

function dailyCounter(counts) {
  const keys = [];
  return {
    keys,
    async increment(key) {
      keys.push(key);
      const next = counts.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const LIMIT = WORKERS_AI_DAILY_ATTEMPT_LIMIT;
const fixedNow = () => new Date('2026-09-15T10:00:00.000Z');

function workersAi(model, calls, answer = validOutput) {
  return {
    id: 'workers-ai',
    model,
    async generateOutfits() {
      calls.push(model);
      const output = answer();
      if (output instanceof Error) throw output;
      return output;
    },
  };
}

function openRouter(model, calls, answer = validOutput) {
  return { ...workersAi(model, calls, answer), id: 'openrouter' };
}

test('the daily attempt budget covers the largest prompt in the shared grid', async () => {
  await import('../../../mobile/test/node-typescript-resolver.mjs');
  const { gridRequestCells } = await import('../../../mobile/test/recommendation-grid.mjs');
  const promptCharacters = Math.max(...gridRequestCells()
    .filter(({ request: body }) => body !== null)
    .map(({ request: body }) =>
      JSON.stringify(buildMessages(body)).length
      + JSON.stringify(buildPickJsonSchema(body.options)).length));

  // The grid sends a dayKind, as the app does, so `weekend_relaxed` leaves the eligible
  // lists of a weekday, and it sends the day's requirements, so the three weather archetypes
  // leave the lists of the days that contradict them: the largest prompt is shorter than
  // either the day-blind or the day-kind-only one.
  assert.equal(promptCharacters, 17_424);
  const inputTokens = Math.ceil(promptCharacters / 4 / 100) * 100;
  const attemptNeurons = Math.ceil(
    (inputTokens * 26_668 + 192 * 204_805) / 1_000_000,
  );
  const derivedLimit = Math.floor(
    (10_000 - PROBE_DAILY_LIMIT * 67) / attemptNeurons,
  );
  // The constant keeps the documented 160-Neuron worst case, which the 4,500-token estimate
  // gives, so a shorter prompt leaves it one attempt below what the pool now affords: the
  // budget is covered, which is what this test is for. Raising it to the re-derived figure
  // is an owner spend decision with its own review, outside this Goal.
  assert.ok(
    WORKERS_AI_DAILY_ATTEMPT_LIMIT <= derivedLimit,
    `${WORKERS_AI_DAILY_ATTEMPT_LIMIT} attempts exceed the ${derivedLimit} the pool affords`,
  );
});

test('a Workers AI attempt whose increment lands exactly on the limit still runs', async () => {
  const calls = [];
  const counter = dailyCounter([LIMIT]);
  const response = await createAiHandler({
    providers: [workersAi('@cf/first', calls), openRouter('router/free', calls)],
    dailyCounter: counter,
    dailyLimit: LIMIT,
    now: fixedNow,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['@cf/first']);
  assert.deepEqual(counter.keys, ['ai:workers-ai:2026-09-15']);
});

test('past the daily limit every Workers AI provider is skipped and OpenRouter answers', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const calls = [];
  const counter = dailyCounter([LIMIT + 1, LIMIT + 2]);
  const response = await createAiHandler({
    providers: [
      workersAi('@cf/first', calls),
      workersAi('@cf/second', calls),
      openRouter('router/free', calls),
    ],
    dailyCounter: counter,
    dailyLimit: LIMIT,
    now: fixedNow,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.deepEqual(calls, ['router/free']);
  // One increment answers over the limit; the second Workers AI provider is skipped without
  // another increment, neither is called, and the skip is logged once.
  assert.equal(counter.keys.length, 1);
  assert.deepEqual(warnings, [{
    event: 'ai_daily_budget_exhausted',
    route: '/v1/ai/recommend',
    count: LIMIT + 1,
    limit: LIMIT,
  }]);
});

test('OpenRouter attempts never increment the Workers AI counter', async () => {
  const calls = [];
  const counter = dailyCounter([1]);
  const response = await createAiHandler({
    providers: [openRouter('router/first', calls, () => new Error('down')), openRouter('router/second', calls)],
    dailyCounter: counter,
    dailyLimit: LIMIT,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['router/first', 'router/second']);
  assert.deepEqual(counter.keys, []);
});

test('a shared-cache hit never increments the counter', async () => {
  const restore = installMemoryCache();
  try {
    const calls = [];
    const counter = dailyCounter([1, 2]);
    const handle = createAiHandler({
      providers: [workersAi('@cf/first', calls)],
      dailyCounter: counter,
      dailyLimit: LIMIT,
    });
    assert.equal((await handle(request())).status, 200);
    assert.equal((await handle(request())).status, 200);
    assert.deepEqual(calls, ['@cf/first']);
    assert.equal(counter.keys.length, 1);
  } finally {
    restore();
  }
});

test('a counter failure skips Workers AI without an uncounted call and OpenRouter answers', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const calls = [];
  const response = await createAiHandler({
    providers: [
      workersAi('@cf/first', calls),
      workersAi('@cf/second', calls),
      openRouter('router/free', calls),
    ],
    dailyCounter: dailyCounter([new Error('Durable Object unavailable'), new Error('still down')]),
    dailyLimit: LIMIT,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ['router/free']);
  assert.deepEqual(warnings, [{
    event: 'ai_daily_counter_unavailable',
    route: '/v1/ai/recommend',
  }]);
});

test('a Workers AI quota refusal skips the remaining Workers AI providers and OpenRouter answers', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (entry) => warnings.push(entry));
  const calls = [];
  const refusal = () => new AiProviderError('quota_exceeded');
  const counter = dailyCounter([1, 2, 3]);
  const response = await createAiHandler({
    providers: [
      workersAi('@cf/first', calls, refusal),
      workersAi('@cf/second', calls),
      openRouter('router/free', calls),
    ],
    dailyCounter: counter,
    dailyLimit: LIMIT,
  })(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validOutput());
  assert.deepEqual(calls, ['@cf/first', 'router/free']);
  // The skipped Workers AI provider is not counted either: no attempt, no increment.
  assert.equal(counter.keys.length, 1);
  assert.deepEqual(warnings, [
    { event: 'ai_provider_attempt_failed', model: '@cf/first', reason: 'quota_exceeded' },
    { event: 'ai_workers_ai_quota_exhausted', model: '@cf/first' },
  ]);

  calls.length = 0;
  const spentOpenRouter = await createAiHandler({ providers: [
    openRouter('router/spent', calls, refusal),
    openRouter('router/free', calls),
  ] })(request());
  assert.equal(spentOpenRouter.status, 200);
  assert.deepEqual(calls, ['router/spent', 'router/free']);
});
