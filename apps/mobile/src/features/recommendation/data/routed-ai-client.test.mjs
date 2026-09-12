import assert from 'node:assert/strict';
import test from 'node:test';

import { aiModelInputFromRequest, picksAreMeaningfullyDifferent } from '@kuyara/contracts';

import { OnDeviceAiClient, OnDeviceAiError } from './on-device-ai-client.ts';
import { RoutedAiClient } from './routed-ai-client.ts';
import { createAiRecommendationRequest } from './worker-ai-recommendation-mapper.ts';

const observedAt = '2026-08-01T18:00:00.000Z';

function input() {
  return {
    snapshot: {
      id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
      localProfileId: 'profile-one',
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: { kind: 'sample', sourceId: 'routed-test' },
      current: {
        observedAt,
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: 16,
      maximumTemperatureCelsius: 17,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
    dayVariant: 0,
    localDayKey: '2026-08-01',
  };
}

const request = createAiRecommendationRequest(input());

// Three options that differ in their body core, so the shared distinctness rule accepts
// them, each labelled with an archetype its own traits satisfy, so the mapper's archetype
// precondition accepts them too. Both gates now run inside the chain.
function archetypeFor(option, used) {
  const candidates = [
    option.traits.outerWaterProtective && 'rain_ready',
    option.traits.tractionEnhanced && 'snow_day',
    option.traits.outerThermalHigh && 'cold_shield',
    option.traits.windResistant && 'wind_guard',
    option.traits.hasMidLayer && option.traits.hasOuterLayer && 'layered_warmth',
    option.traits.hasMidLayer && !option.traits.hasOuterLayer && 'in_between',
    !option.traits.hasOuterLayer && option.traits.breathabilityHigh && 'light_and_airy',
    option.formality === 'formal' && 'office_ready',
    option.formality !== 'casual' && 'smart_casual',
    option.garments.some(({ slot, garmentTypeId }) =>
      slot === 'footwear' && garmentTypeId === 'sneakers') && 'on_the_move',
    option.formality === 'casual' && 'weekend_relaxed',
    'everyday_easy',
  ].filter(Boolean);
  return candidates.find((candidate) => !used.has(candidate));
}

function distinctPicks() {
  const used = new Set();
  const chosen = [];
  for (const option of request.options) {
    const core = JSON.stringify(option.garments.filter(({ slot }) =>
      slot === 'primary_top' || slot === 'bottom' || slot === 'one_piece'));
    if (chosen.some((picked) => picked.core === core)) continue;
    const archetypeId = archetypeFor(option, used);
    if (!archetypeId) continue;
    used.add(archetypeId);
    chosen.push({ core, optionId: option.optionId, archetypeId });
    if (chosen.length === 3) break;
  }
  if (chosen.length !== 3) throw new Error('fixture needs three distinct body cores');
  return chosen.map(({ optionId, archetypeId }) => ({ optionId, archetypeId }));
}

const picks = distinctPicks();

// The deterministic composer never offers two options a user would call the same outfit,
// so the near-duplicate has to be built: the first pick's option under a second id. Picking
// both is the case the shared distinctness rule exists to reject.
const twinOptionId = 'twin-of-first';
const requestWithTwin = {
  ...request,
  options: [
    ...request.options,
    {
      ...request.options.find(({ optionId }) => optionId === picks[0].optionId),
      optionId: twinOptionId,
    },
  ],
};
assert.equal(
  picksAreMeaningfullyDifferent([
    request.options.find(({ optionId }) => optionId === picks[0].optionId),
    requestWithTwin.options.at(-1),
  ]),
  false,
);
const workerPicks = [...picks].reverse();

function fakeModule(overrides = {}) {
  return {
    calls: [],
    getAvailability: async () => ({ status: 'available' }),
    selectOutfits: async function selectOutfits(inputJson, options) {
      this.calls.push({ inputJson, options });
      return JSON.stringify({ picks });
    },
    ...overrides,
  };
}

function fakeWorker() {
  return {
    calls: [],
    async recommend(_request, options) {
      this.calls.push(options);
      return { picks: workerPicks };
    },
  };
}

// `recommendRouted` now answers with the mapped recommendation, so a tier is identified by
// its generation mode and the option ids of the three outfits it produced.
function pickedOptionIds(result) {
  return result.outfits.map(({ optionId }) => optionId);
}

function routed(module, worker, now) {
  return new RoutedAiClient({
    onDevice: new OnDeviceAiClient({ module, timeoutMilliseconds: 50 }),
    worker,
    now,
  });
}

test('an available module answers on device and nothing reaches the Worker', async () => {
  const module = fakeModule();
  const worker = fakeWorker();

  const result = await routed(module, worker).recommendRouted(request);

  assert.equal(result.generationMode, 'on-device-ai');
  assert.deepEqual(pickedOptionIds(result), picks.map(({ optionId }) => optionId));
  assert.equal(worker.calls.length, 0);
  assert.equal(module.calls.length, 1);
  assert.equal(module.calls[0].options.timeoutMs, 50);
  // ADR 0034 section 8: the module sees the shared projection and nothing else.
  assert.deepEqual(
    JSON.parse(module.calls[0].inputJson),
    JSON.parse(JSON.stringify(aiModelInputFromRequest(request))),
  );
  assert.doesNotMatch(module.calls[0].inputJson, /profile-one|wardrobe|localDayKey|catalogVersion/);
});

test('an unavailable module costs no time and the Worker keeps the whole budget', async () => {
  const module = fakeModule({
    getAvailability: async () => ({ status: 'unavailable', reason: 'device_not_eligible' }),
    selectOutfits: async () => {
      throw new Error('the module must not be asked to select');
    },
  });
  const worker = fakeWorker();

  // A fixed clock: an unavailable answer spends none of the budget by construction.
  const result = await routed(module, worker, () => 1000).recommendRouted(request);

  assert.equal(result.generationMode, 'ai-assisted');
  assert.deepEqual(pickedOptionIds(result), workerPicks.map(({ optionId }) => optionId));
  assert.deepEqual(worker.calls, [{ timeoutMilliseconds: 20000 }]);
});

test('a timed-out attempt is abandoned and the Worker gets the rest of the budget', async () => {
  const module = fakeModule({ selectOutfits: () => new Promise(() => undefined) });
  const worker = fakeWorker();
  let clock = 1000;
  const client = routed(module, worker, () => clock);

  const pending = client.recommendRouted(request);
  clock = 7000;
  const result = await pending;

  assert.equal(result.generationMode, 'ai-assisted');
  assert.deepEqual(worker.calls, [{ timeoutMilliseconds: 14000 }]);
});

for (const [name, overrides] of [
  ['invalid JSON', { selectOutfits: async () => 'not json at all' }],
  ['an invented option id', {
    selectOutfits: async () => JSON.stringify({
      picks: [{ ...picks[0], optionId: 'invented-option' }, picks[1], picks[2]],
    }),
  }],
  ['a duplicate archetype', {
    selectOutfits: async () => JSON.stringify({
      picks: [picks[0], { ...picks[1], archetypeId: picks[0].archetypeId }, picks[2]],
    }),
  }],
  ['a native throw', {
    selectOutfits: async () => {
      throw new Error('the model session failed');
    },
  }],
]) {
  test(`${name} falls to the Worker instead of being repaired`, async () => {
    const worker = fakeWorker();

    const result = await routed(fakeModule(overrides), worker).recommendRouted(request);

    assert.equal(result.generationMode, 'ai-assisted');
    assert.deepEqual(pickedOptionIds(result), workerPicks.map(({ optionId }) => optionId));
    assert.equal(worker.calls.length, 1);
  });
}

test('picks that are not meaningfully different fall to the Worker', async () => {
  const worker = fakeWorker();
  const module = fakeModule({
    selectOutfits: async () => JSON.stringify({
      picks: [picks[0], { ...picks[1], optionId: twinOptionId }, picks[2]],
    }),
  });

  const result = await routed(module, worker).recommendRouted(requestWithTwin);

  assert.equal(result.generationMode, 'ai-assisted');
  assert.equal(worker.calls.length, 1);
});

test('every on-device outcome except a result is one failure to the caller', async () => {
  const cases = [
    ['an unavailable device', { getAvailability: async () => ({ status: 'unavailable' }) }],
    ['an unparseable reply', { selectOutfits: async () => '{"picks":' }],
    ['a native throw', {
      selectOutfits: async () => {
        throw new Error('boom');
      },
    }],
    ['a module that never settles', { selectOutfits: () => new Promise(() => undefined) }],
  ];

  for (const [name, overrides] of cases) {
    const client = new OnDeviceAiClient({
      module: fakeModule(overrides),
      timeoutMilliseconds: 10,
    });
    await assert.rejects(
      () => client.recommend(request),
      (error) => error instanceof OnDeviceAiError,
      name,
    );
  }
});

// The AI status row renders a missing answer as "not available on this device", so an
// availability read that never settles would show a wrong answer for the life of the screen.
test('an availability read for the status row is bounded by the same budget', async () => {
  const client = new OnDeviceAiClient({
    module: fakeModule({ getAvailability: () => new Promise(() => undefined) }),
    timeoutMilliseconds: 10,
  });

  assert.deepEqual(await client.getAvailability(), {
    status: 'unavailable',
    reason: 'unknown',
  });
});

test('no module at all reports unavailable and routes to the Worker', async () => {
  const worker = fakeWorker();
  const client = new RoutedAiClient({
    onDevice: new OnDeviceAiClient({ module: null }),
    worker,
  });

  assert.deepEqual(await client.getAvailability(), {
    status: 'unavailable',
    reason: 'device_not_eligible',
  });
  assert.deepEqual(
    pickedOptionIds(await client.recommendRouted(request)),
    workerPicks.map(({ optionId }) => optionId),
  );
  assert.equal(worker.calls.length, 1);
});

// The shared gate runs inside the on-device attempt, so an answer it rejects is an
// on-device failure and the Worker still gets its turn with the rest of the budget. The
// fixture is 16 degrees and clear, so nothing in it has enhanced traction and `snow_day`
// fails the archetype precondition while the picks stay supplied and distinct.
test('an on-device pick the shared gate rejects falls to the Worker, not to the fallback', async () => {
  const used = new Set(picks.map(({ archetypeId }) => archetypeId));
  assert.equal(used.has('snow_day'), false);
  const smooth = picks.find(({ optionId }) => !request.options
    .find((option) => option.optionId === optionId).traits.tractionEnhanced);
  assert.notEqual(smooth, undefined);

  const worker = fakeWorker();
  const module = fakeModule({
    selectOutfits: async () => JSON.stringify({
      picks: picks.map((pick) => pick === smooth
        ? { ...pick, archetypeId: 'snow_day' }
        : pick),
    }),
  });
  let clock = 1000;

  const pending = routed(module, worker, () => clock).recommendRouted(request);
  clock = 7000;
  const result = await pending;

  assert.equal(result.generationMode, 'ai-assisted');
  assert.deepEqual(pickedOptionIds(result), workerPicks.map(({ optionId }) => optionId));
  assert.deepEqual(worker.calls, [{ timeoutMilliseconds: 14000 }]);
});

// ADR 0034 section 2: the 6 s covers the whole on-device cost, the availability read
// included. An availability call that never settles must not hold the recommendation past
// the budget, and must not leave the user without even the deterministic fallback.
test('an availability read that never settles is abandoned inside the on-device budget', async () => {
  const worker = fakeWorker();
  const module = fakeModule({
    getAvailability: () => new Promise(() => undefined),
    selectOutfits: async () => {
      throw new Error('the module must not be asked to select');
    },
  });
  let clock = 1000;

  const pending = routed(module, worker, () => clock).recommendRouted(request);
  clock = 7000;
  const result = await pending;

  assert.equal(result.generationMode, 'ai-assisted');
  assert.deepEqual(worker.calls, [{ timeoutMilliseconds: 14000 }]);
});

// The row that tells the user what the device can do reads availability through its own
// call, so a request that gave up waiting never writes "unavailable" to it.
test('a timed-out request does not make the status row report unavailable', async () => {
  let settle;
  const module = fakeModule({
    getAvailability: () => new Promise((resolve) => {
      settle = () => resolve({ status: 'available' });
    }),
  });
  const client = routed(module, fakeWorker());

  await client.recommendRouted(request);
  const pending = client.getAvailability();
  settle();

  assert.deepEqual(await pending, { status: 'available' });
});
