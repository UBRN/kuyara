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

// Three options that differ in their body core, so the shared distinctness rule accepts them.
function distinctPicks() {
  const archetypes = ['everyday_easy', 'smart_casual', 'weekend_relaxed'];
  const chosen = [];
  for (const option of request.options) {
    const core = JSON.stringify(option.garments.filter(({ slot }) =>
      slot === 'primary_top' || slot === 'bottom' || slot === 'one_piece'));
    if (chosen.some((picked) => picked.core === core)) continue;
    chosen.push({ core, optionId: option.optionId });
    if (chosen.length === 3) break;
  }
  if (chosen.length !== 3) throw new Error('fixture needs three distinct body cores');
  return chosen.map(({ optionId }, index) => ({ optionId, archetypeId: archetypes[index] }));
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
  assert.deepEqual(result.data, { picks });
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
  assert.deepEqual(result.data, { picks: workerPicks });
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
    assert.deepEqual(result.data, { picks: workerPicks });
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

test('the on-device client names its own failure kinds', async () => {
  const unavailable = new OnDeviceAiClient({
    module: fakeModule({ getAvailability: async () => ({ status: 'unavailable' }) }),
  });
  await assert.rejects(
    () => unavailable.recommend(request),
    (error) => error instanceof OnDeviceAiError && error.kind === 'unavailable',
  );

  const invalid = new OnDeviceAiClient({
    module: fakeModule({ selectOutfits: async () => '{"picks":[]}' }),
  });
  await assert.rejects(
    () => invalid.recommend(request),
    (error) => error instanceof OnDeviceAiError && error.kind === 'invalid-response',
  );

  const native = new OnDeviceAiClient({
    module: fakeModule({
      selectOutfits: async () => {
        throw new Error('boom');
      },
    }),
  });
  await assert.rejects(
    () => native.recommend(request),
    (error) => error instanceof OnDeviceAiError && error.kind === 'native',
  );

  const slow = new OnDeviceAiClient({
    module: fakeModule({ selectOutfits: () => new Promise(() => undefined) }),
    timeoutMilliseconds: 10,
  });
  await assert.rejects(
    () => slow.recommend(request),
    (error) => error instanceof OnDeviceAiError && error.kind === 'timeout',
  );
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
  assert.deepEqual((await client.recommendRouted(request)).data, { picks: workerPicks });
  assert.equal(worker.calls.length, 1);
});
