import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RecommendationApplicationController,
  localDayKey,
  localDayVariant,
  recommendationRefreshTrigger,
} from './recommendation-application-controller.ts';
import { WorkerAiClientError } from '../data/worker-ai-client.ts';
import {
  createAiRecommendationRequest,
  mapWorkerAiRecommendation,
} from '../data/worker-ai-recommendation-mapper.ts';

const profileId = 'profile-one';
const now = '2026-08-01T20:00:00.000Z';
function workerResponse(request) {
  const used = new Set();
  return {
    picks: request.options.slice(0, 3).map((option) => {
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
      const archetypeId = candidates.find((candidate) => !used.has(candidate));
      if (!archetypeId) throw new Error('fixture needs three distinct archetypes');
      used.add(archetypeId);
      return { optionId: option.optionId, archetypeId };
    }),
  };
}

function input(temperatureCelsius = 30) {
  const observedAt = '2026-08-01T18:00:00.000Z';
  return {
    snapshot: {
      id: 'weather-one',
      localProfileId: profileId,
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: { kind: 'sample', sourceId: 'controller-test' },
      current: {
        observedAt,
        temperatureCelsius,
        apparentTemperatureCelsius: temperatureCelsius,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: temperatureCelsius,
      maximumTemperatureCelsius: temperatureCelsius + 1,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius,
        apparentTemperatureCelsius: temperatureCelsius,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
    dayVariant: 3,
    localDayKey: '2026-08-01',
  };
}

function createHarness({ cached = null, client, failSave = false, captureAnalyticsEvent } = {}) {
  let stored = cached;
  const calls = { client: 0, saves: 0 };
  const requests = [];
  const repository = {
    async getSnapshot() { return stored; },
    async saveSnapshot(localProfileId, value) {
      calls.saves += 1;
      if (failSave) throw new Error('database unavailable');
      stored = {
        id: cached?.id ?? '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
        localProfileId,
        weatherSnapshotId: value.weatherSnapshotId,
        locationKey: value.locationKey,
        clothingPreference: value.context.clothingPreference,
        dressStyle: value.context.dressStyle,
        dayVariant: value.context.dayVariant,
        localDayKey: value.context.localDayKey ?? null,
        generationMode: value.recommendation.generationMode,
        recommendation: value.recommendation,
        createdAt: cached?.createdAt ?? now,
        updatedAt: now,
      };
      return stored;
    },
  };
  const recommend = client?.recommend ?? (async (request) => workerResponse(request));
  // The routed client runs the shared validation gate itself and answers with the mapped
  // recommendation. A `client.recommend` override stands for the Worker tier, whose answers
  // are `ai-assisted` exactly as before; a reply the gate rejects throws here, which is the
  // AI failure the controller's catch turns into the deterministic fallback.
  const recommendRouted = client?.recommendRouted ??
    (async (request) => mapWorkerAiRecommendation(request, await recommend(request), 'ai-assisted'));
  const aiClient = {
    async recommendRouted(request) {
      calls.client += 1;
      requests.push(request);
      return recommendRouted(request);
    },
  };
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => repository,
    client: aiClient,
    captureAnalyticsEvent,
  });
  return { controller, calls, repository, requests, getStored: () => stored };
}

async function persistedRecommendation() {
  const { controller } = createHarness();
  await controller.initialize();
  return controller.refresh('first-recommendation', input(16));
}

test('local day variant is a deterministic seven-day ring', () => {
  assert.equal(localDayVariant(new Date(2026, 0, 1, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 2, 12)), 2);
  assert.equal(localDayVariant(new Date(2026, 0, 8, 12)), 1);
});

test('local day key changes across New Year even when the composition seed repeats', () => {
  const december31 = new Date(2025, 11, 31, 23, 59);
  const january1 = new Date(2026, 0, 1, 0, 1);
  assert.equal(localDayVariant(december31), localDayVariant(january1));
  assert.equal(localDayKey(december31), '2025-12-31');
  assert.equal(localDayKey(january1), '2026-01-01');

  const previous = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: localDayVariant(december31),
    localDayKey: localDayKey(december31),
  };
  assert.equal(
    recommendationRefreshTrigger(previous, {
      ...previous,
      dayVariant: localDayVariant(january1),
      localDayKey: localDayKey(january1),
    }, null),
    'local-day-changed',
  );
});

test('a missing persisted snapshot triggers the first recommendation', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dayVariant: 3,
  };

  assert.equal(
    recommendationRefreshTrigger(null, current, null),
    'first-recommendation',
  );
});

test('equal persisted signals do not trigger a recommendation on reopen', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dayVariant: 3,
  };

  assert.equal(recommendationRefreshTrigger(current, current, null), null);
});

test('a changed persisted location triggers a recommendation', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dayVariant: 3,
  };

  assert.equal(
    recommendationRefreshTrigger({ ...current, locationKey: 'old' }, current, null),
    'active-location-changed',
  );
});

test('trigger selection distinguishes stale refresh from unapproved weather changes', () => {
  const current = {
    weatherSnapshotId: 'weather-two',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 3,
    localDayKey: '2026-08-01',
  };
  const previous = { ...current, weatherSnapshotId: 'weather-one' };

  assert.equal(recommendationRefreshTrigger(previous, current, null), null);
  assert.equal(
    recommendationRefreshTrigger(previous, current, 'weather-one'),
    'stale-weather-refreshed',
  );
  assert.equal(
    recommendationRefreshTrigger({ ...previous, locationKey: 'old' }, current, null),
    'active-location-changed',
  );
  assert.equal(
    recommendationRefreshTrigger({ ...previous, clothingPreference: 'mens' }, current, null),
    'clothing-preference-changed',
  );
  assert.equal(
    recommendationRefreshTrigger({ ...previous, localDayKey: '2026-07-31' }, current, null),
    'local-day-changed',
  );
  assert.equal(
    recommendationRefreshTrigger({ ...previous, dayVariant: 2 }, current, null),
    null,
  );
});

test('duplicate concurrent refreshes share one AI request and one save', async () => {
  let resolve;
  let receivedRequest;
  const pending = new Promise((done) => { resolve = done; });
  const { controller, calls } = createHarness({
    client: { recommend: async (request) => {
      receivedRequest = request;
      return pending;
    } },
  });
  await controller.initialize();

  const first = controller.refresh('explicit', input(16));
  const second = controller.refresh('explicit', input(16));
  assert.equal(calls.client, 1);
  resolve(workerResponse(receivedRequest));
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, secondResult);
  assert.equal(calls.client, 1);
  assert.equal(calls.saves, 1);
});

test('a new-day generation excludes the persisted previous-day option ids', async () => {
  const previous = await persistedRecommendation();
  const previousOptionIds = previous.recommendation.outfits.map(({ optionId }) => optionId);
  const { controller, requests } = createHarness({ cached: previous });
  await controller.initialize();

  const snapshot = await controller.refresh('local-day-changed', {
    ...input(16),
    dayVariant: 4,
    localDayKey: '2026-08-02',
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].options.some(({ optionId }) => previousOptionIds.includes(optionId)),
    false,
  );
  assert.equal(
    snapshot.recommendation.outfits.some(({ optionId }) => previousOptionIds.includes(optionId)),
    false,
  );
});

test('a same-day regeneration does not exclude persisted option ids', async () => {
  const previous = await persistedRecommendation();
  const expected = createAiRecommendationRequest(input(16));
  const { controller, requests } = createHarness({ cached: previous });
  await controller.initialize();

  await controller.refresh('explicit', input(16));

  assert.deepEqual(requests[0].options, expected.options);
});

test('a fresh install generates with the complete offered option list', async () => {
  const expected = createAiRecommendationRequest(input(16));
  const { controller, requests } = createHarness();
  await controller.initialize();

  await controller.refresh('first-recommendation', input(16));

  assert.deepEqual(requests[0].options, expected.options);
});

test('AI client failure returns and persists a three-outfit deterministic fallback', async () => {
  const { controller, calls } = createHarness({
    client: { recommend: async () => { throw new Error('provider details'); } },
  });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(16));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().snapshot, snapshot);
  assert.deepEqual(calls, { client: 1, saves: 1 });
});

test('an unknown response option id falls back deterministically', async () => {
  const { controller, calls } = createHarness({
    client: {
      recommend: async (request) => {
        const response = workerResponse(request);
        response.picks[0] = { ...response.picks[0], optionId: 'unknown-option' };
        return response;
      },
    },
  });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(16));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.equal(new Set(snapshot.recommendation.outfits.map(
    ({ archetypeId }) => archetypeId)).size, 3);
  assert.deepEqual(calls, { client: 1, saves: 1 });
});

test('weather with no clothing requirements skips AI and persists the deterministic fallback', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(20));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(calls, { client: 0, saves: 1 });
});

test('failed refresh keeps the previous snapshot in memory and in the repository', async () => {
  const cached = Object.freeze({
    id: 'cached-recommendation',
    generationMode: 'deterministic-fallback',
    recommendation: { status: 'recommended', outfits: [] },
  });
  const { controller, getStored } = createHarness({ cached, failSave: true });
  await controller.initialize();

  const result = await controller.refresh('explicit', input());

  assert.equal(result, cached);
  assert.equal(controller.getSnapshot().snapshot, cached);
  assert.equal(getStored(), cached);
});

test('a dress style change refreshes but an unchanged style preserves the snapshot', () => {
  const previous = {
    weatherSnapshotId: 'w',
    locationKey: 'l',
    clothingPreference: 'womens',
    dayVariant: 1,
    dressStyle: 'smart',
  };
  assert.equal(
    recommendationRefreshTrigger(previous, { ...previous, dressStyle: 'formal' }, null),
    'dress-style-changed',
  );
  assert.equal(recommendationRefreshTrigger(previous, { ...previous }, null), null);
});

test('a failed save classifies the Worker client kind and clears it on the next success', async () => {
  // Only the Worker client's own kinds are classifiable. It has no rate-limit kind today,
  // so a throttled Worker arrives as 'service' and reads as an unavailable upstream.
  const cases = [
    ['network', 'offline'],
    ['service', 'unavailable'],
    ['invalid-request', 'unavailable'],
    ['invalid-response', 'unavailable'],
  ];

  for (const [kind, category] of cases) {
    const { controller } = createHarness({
      client: { recommend: async () => { throw new WorkerAiClientError(kind); } },
      failSave: true,
    });
    await controller.initialize();
    assert.equal(controller.getSnapshot().lastFailure, null);

    // The AI throw alone is survivable: the deterministic fallback composes. The save
    // failure is what leaves the state without a snapshot, and it reports the AI cause
    // rather than the less specific repository throw.
    await controller.refresh('explicit', input(16));
    assert.equal(controller.getSnapshot().lastFailure, category);
  }

  // With no AI failure to prefer, the save throw itself is classified, and it is not
  // one of the Worker client's errors.
  const { controller } = createHarness({ failSave: true });
  await controller.initialize();
  await controller.refresh('explicit', input(20));
  assert.equal(controller.getSnapshot().lastFailure, 'unknown');
});

test('an unclassifiable throw is unknown, and a success clears the category', async () => {
  const { controller } = createHarness({
    client: { recommend: async () => { throw new Error('provider details'); } },
    failSave: true,
  });
  await controller.initialize();

  await controller.refresh('explicit', input(16));
  assert.equal(controller.getSnapshot().lastFailure, 'unknown');

  const recovered = createHarness();
  await recovered.controller.initialize();
  assert.equal(recovered.controller.getSnapshot().lastFailure, null);
  await recovered.controller.refresh('explicit', input(16));
  assert.equal(recovered.controller.getSnapshot().lastFailure, null);
});

test('an unusable input is an unknown failure without touching the AI client', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();

  // A snapshot the recommendation context cannot be built from never reaches the client.
  const unusable = input(16);
  await controller.refresh('explicit', { ...unusable, snapshot: { ...unusable.snapshot, hourly: null } });

  assert.equal(controller.getSnapshot().lastFailure, 'unknown');
  assert.equal(calls.client, 0);
});

test('a repository load failure leaves the ready state carrying an unknown failure', async () => {
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => { throw new Error('database unavailable'); },
    client: { recommend: async () => { throw new Error('unused'); } },
  });

  await controller.initialize();

  assert.deepEqual(controller.getSnapshot(), {
    status: 'ready',
    snapshot: null,
    isRefreshing: false,
    lastFailure: 'unknown',
  });
});

test('recommendation_regenerated reports the trigger, result and generation mode on success', async () => {
  const captured = [];
  const { controller } = createHarness({
    captureAnalyticsEvent: (name, properties) => captured.push({ name, properties }),
  });
  await controller.initialize();

  await controller.refresh('first-recommendation', input(16));

  assert.deepEqual(captured, [{
    name: 'recommendation_regenerated',
    properties: {
      schema_version: 2,
      trigger_reason: 'first_recommendation',
      result: 'success',
      generation_mode: 'ai_assisted',
    },
  }]);
});

test('recommendation_regenerated omits generation_mode and reports failure_kept_last_known when a save fails with a prior snapshot', async () => {
  const cached = Object.freeze({
    id: 'cached-recommendation',
    generationMode: 'deterministic-fallback',
    recommendation: { status: 'recommended', outfits: [] },
  });
  const captured = [];
  const { controller } = createHarness({
    cached,
    failSave: true,
    captureAnalyticsEvent: (name, properties) => captured.push({ name, properties }),
  });
  await controller.initialize();

  await controller.refresh('explicit', input());

  assert.deepEqual(captured, [{
    name: 'recommendation_regenerated',
    properties: {
      schema_version: 2,
      trigger_reason: 'explicit_request',
      result: 'failure_kept_last_known',
    },
  }]);
});

test('recommendation_regenerated reports failure_no_snapshot when a save fails with no prior snapshot', async () => {
  const captured = [];
  const { controller } = createHarness({
    failSave: true,
    captureAnalyticsEvent: (name, properties) => captured.push({ name, properties }),
  });
  await controller.initialize();

  await controller.refresh('explicit', input());

  assert.deepEqual(captured, [{
    name: 'recommendation_regenerated',
    properties: {
      schema_version: 2,
      trigger_reason: 'explicit_request',
      result: 'failure_no_snapshot',
    },
  }]);
});

test('the tier the routed client used becomes the stored generation mode', async () => {
  const captured = [];
  const { controller, calls } = createHarness({
    client: {
      recommendRouted: async (request) =>
        mapWorkerAiRecommendation(request, workerResponse(request), 'on-device-ai'),
    },
    captureAnalyticsEvent: (name, properties) => captured.push({ name, properties }),
  });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(16));

  assert.equal(snapshot.generationMode, 'on-device-ai');
  assert.equal(snapshot.recommendation.generationMode, 'on-device-ai');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(calls, { client: 1, saves: 1 });
  assert.equal(captured[0].properties.generation_mode, 'on_device_ai');
});
