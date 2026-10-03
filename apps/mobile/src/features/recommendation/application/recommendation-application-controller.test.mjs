import assert from 'node:assert/strict';
import test from 'node:test';
import { archetypeDayFromRequirements } from '@kuyara/contracts';

import {
  RecommendationApplicationController,
  expiredCoverageNeedsSelection,
  localDayKey,
  localDayKind,
  localDayVariant,
  recommendationRefreshTrigger,
  recommendationPoolExhausted,
  usingStandardPhaseMilliseconds,
} from './recommendation-application-controller.ts';
import { WorkerAiClientError } from '../data/worker-ai-client.ts';
import { RecommendationRepositoryError } from '../data/recommendation-repository.ts';
import { assignFallbackArchetypes, composeOutfitPool, outfitOptionId } from './recommend-outfits.ts';
import {
  createRecommendationContextWithPool,
  mapWorkerAiRecommendation,
} from '../data/worker-ai-recommendation-mapper.ts';
import { aiRequestFor } from '../../../../test/recommendation-grid.mjs';

const profileId = 'profile-one';
const now = '2026-08-01T20:00:00.000Z';
test('expired coverage is selected once on foreground, never on weather refresh', () => {
  const stored = { coverageEnd: '2026-08-02T01:00:00.000Z' };
  assert.equal(expiredCoverageNeedsSelection(stored, '2026-08-02T00:59:59.000Z', true, null), false);
  assert.equal(expiredCoverageNeedsSelection(stored, '2026-08-02T01:00:00.000Z', false, null), false);
  assert.equal(expiredCoverageNeedsSelection(stored, '2026-08-02T01:00:00.000Z', true, null), true);
  assert.equal(expiredCoverageNeedsSelection(stored, '2026-08-02T02:00:00.000Z', true,
    stored.coverageEnd), false);
  assert.equal(expiredCoverageNeedsSelection({}, '2026-08-02T02:00:00.000Z', true, null), false);
});
function workerResponse(request) {
  const used = new Set();
  const day = archetypeDayFromRequirements(request.requirements);
  return {
    picks: request.options.slice(0, 3).map((option) => {
      const candidates = [
        day.wet && option.traits.outerWaterProtective && 'rain_ready',
        day.frozen && option.traits.tractionEnhanced && 'snow_day',
        day.cold && option.traits.outerThermalHigh && 'cold_shield',
        day.windy && option.traits.windResistant && 'wind_guard',
        option.traits.hasMidLayer && option.traits.hasOuterLayer && 'layered_warmth',
        option.traits.hasMidLayer && !option.traits.hasOuterLayer && 'in_between',
        !day.cold && !option.traits.hasOuterLayer && option.traits.breathabilityHigh
          && 'light_and_airy',
        // This request sends no dayKind, so office_ready holds for formal outfits only.
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

function createHarness({ cached = null, client, failSave = false, captureAnalyticsEvent, holdPhase,
  loadRecentWorn, createContextWithPool } = {}) {
  let stored = cached;
  const calls = { client: 0, saves: 0 };
  const requests = [];
  const repository = {
    async getSnapshot(_localProfileId, localDayKey) {
      if (stored && localDayKey !== undefined && stored.localDayKey !== localDayKey) {
        throw new RecommendationRepositoryError('invalid-data');
      }
      return stored;
    },
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
        catalogVersion: value.context.catalogVersion,
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
    async recommendRouted(request, options) {
      calls.client += 1;
      requests.push(request);
      return recommendRouted(request, options);
    },
  };
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => repository,
    loadRecentWorn,
    createContextWithPool,
    client: aiClient,
    captureAnalyticsEvent,
    holdPhase: holdPhase ?? (async () => undefined),
    reserveAiReask: async () => true,
  });
  return { controller, calls, repository, requests, getStored: () => stored };
}

test('refreshing is observable before synchronous pool composition', async () => {
  let controller;
  const states = [];
  ({ controller } = createHarness({
    createContextWithPool: (...args) => {
      states.push(controller.getSnapshot());
      return createRecommendationContextWithPool(...args);
    },
  }));
  await controller.initialize();
  await controller.refresh('first-recommendation', input(20));
  assert.equal(states[0].isRefreshing, true);
});

function wornFromAiOption(option) {
  return { garments: Object.fromEntries(option.garments.map((garment) =>
    [garment.slot, garment.garmentTypeId])), archetypeId: 'everyday_easy',
  formality: option.formality, source: 'recommended' };
}

function garmentSet(garments) {
  return [...new Set(garments.map((garment) => garment.garmentTypeId))].sort().join('|');
}

function fourOptionContext(input, localDayKey) {
  const { context } = createRecommendationContextWithPool(
    { ...input, recentWorn: [], excludedOptionIds: [] }, localDayKey);
  const narrow = context.options.slice(0, 4);
  const worn = new Set((input.recentWorn ?? []).map(({ garments }) =>
    [...new Set(Object.values(garments).filter(Boolean))].sort().join('|')));
  const pool = narrow.filter((option) => !worn.has(garmentSet(option.garments)));
  const excluded = new Set(input.excludedOptionIds ?? []);
  const remaining = pool.filter((option) => !excluded.has(option.optionId));
  return {
    context: { ...context, options: remaining.length >= 3 ? remaining : pool },
    poolOptionIds: pool.map((option) => option.optionId),
  };
}

test('regeneration reads current history after a worn outfit is logged', async () => {
  let recentWorn = [];
  const { controller, requests } = createHarness({ loadRecentWorn: async () => recentWorn });
  await controller.initialize();
  await controller.refresh('first-recommendation', input(20));
  assert.ok(requests[0].options.length > 3);
  const newlyWorn = requests[0].options[3];
  recentWorn = [wornFromAiOption(newlyWorn)];
  await controller.refresh('regenerate', input(20));
  const wornSet = garmentSet(newlyWorn.garments);
  assert.equal(requests[1].options.some((option) => garmentSet(option.garments) === wornSet), false);
});

test('restart reconstructs exhausted state from the current history-filtered pool', async () => {
  const first = createHarness();
  await first.controller.initialize();
  const generationInput = { ...input(30), clothingPreference: 'mens' };
  const snapshot = await first.controller.refresh('first-recommendation', generationInput);
  const requirements = {
    ...snapshot.recommendation.requirements,
    requirements: [...snapshot.recommendation.requirements.requirements,
      { kind: 'leg_coverage', minimum: 'full', priority: 'mandatory',
        reasonCodes: ['temperature_low'] }],
  };
  const composition = composeOutfitPool(requirements, 'mens', generationInput.dayVariant);
  assert.equal(composition.status, 'composed');
  assert.equal(composition.outfits.length, 4);
  const narrow = {
    ...snapshot,
    recommendation: {
      ...snapshot.recommendation,
      requirements,
      outfits: assignFallbackArchetypes(composition.outfits, requirements, 3),
    },
  };
  const fourth = composition.outfits[3];
  const fourthOption = first.requests[0].options.find(
    (option) => option.optionId === outfitOptionId(fourth));
  assert.ok(fourthOption);
  const restored = createHarness({ cached: narrow,
    loadRecentWorn: async () => [wornFromAiOption(fourthOption)] });
  await restored.controller.initialize();
  assert.equal(restored.controller.getSnapshot().exhausted, true);
});

test('cold initialize reuses the pool when persisted requirement keys are reordered', async () => {
  const generationInput = { ...input(16), now };
  const first = createHarness();
  await first.controller.initialize();
  const snapshot = await first.controller.refresh('first-recommendation', generationInput);
  const reorderedSnapshot = {
    ...snapshot,
    recommendation: {
      ...snapshot.recommendation,
      requirements: {
        ...snapshot.recommendation.requirements,
        requirements: snapshot.recommendation.requirements.requirements.map((requirement) =>
          Object.fromEntries(Object.entries(requirement).reverse())),
      },
    },
  };
  let compositions = 0;
  const restored = createHarness({
    cached: reorderedSnapshot,
    createContextWithPool: (...args) => {
      compositions += 1;
      return createRecommendationContextWithPool(...args);
    },
  });

  await restored.controller.initialize();
  restored.controller.updatePoolAvailability(generationInput);

  assert.equal(compositions, 0);
});

test('availability reuses the generation history-filtered pool for provider input', async () => {
  const first = createHarness({ createContextWithPool: fourOptionContext });
  await first.controller.initialize();
  const generationInput = { ...input(30), now };
  await first.controller.refresh('first-recommendation', generationInput);
  const fourth = first.requests[0].options[3];
  const worn = [wornFromAiOption(fourth)];
  let compositions = 0;
  const withHistory = createHarness({
    loadRecentWorn: async () => worn,
    createContextWithPool: (...args) => {
      compositions += 1;
      return fourOptionContext(...args);
    },
  });
  await withHistory.controller.initialize();
  await withHistory.controller.refresh('first-recommendation', generationInput);
  assert.equal(withHistory.requests[0].options.length, 3);
  const generationCompositions = compositions;

  withHistory.controller.updatePoolAvailability(generationInput);

  assert.deepEqual({
    availabilityCompositions: compositions - generationCompositions,
    exhausted: withHistory.controller.getSnapshot().exhausted,
  }, { availabilityCompositions: 0, exhausted: true });
});

async function persistedRecommendation() {
  const { controller } = createHarness();
  await controller.initialize();
  return controller.refresh('first-recommendation', input(16));
}

test('first generation can save deterministic outfits while its AI request continues', async () => {
  let resolveAi;
  let request;
  const ai = new Promise((resolve) => { resolveAi = resolve; });
  const { controller, calls } = createHarness({
    client: { recommendRouted: (nextRequest) => {
      request = nextRequest;
      return ai;
    } },
  });
  await controller.initialize();
  const pending = controller.refresh('first-recommendation', input());
  assert.equal(controller.getSnapshot().showFirstGenerationOverlay, true);
  assert.equal(controller.getSnapshot().isRefreshing, true);
  // The runway draws neutral drafts while it waits: the state carries no provisional outfit (N2).
  assert.equal('firstGenerationPreview' in controller.getSnapshot(), false);

  const skipped = await controller.skipWait();
  assert.equal(skipped.generationMode, 'deterministic-fallback');
  assert.equal(controller.getSnapshot().showFirstGenerationOverlay, false);
  assert.equal(controller.getSnapshot().isRefreshing, true);
  assert.equal(calls.client, 1);

  resolveAi(mapWorkerAiRecommendation(request, workerResponse(request), 'ai-assisted'));
  const settled = await pending;
  assert.equal(settled.generationMode, 'ai-assisted');
  assert.equal(controller.getSnapshot().isRefreshing, false);
  assert.equal(calls.client, 1);
});

test('a same-day background refresh never requests the first-generation overlay', async () => {
  const cached = await persistedRecommendation();
  let resolveAi;
  const ai = new Promise((resolve) => { resolveAi = resolve; });
  const { controller } = createHarness({ cached, client: { recommendRouted: () => ai } });
  await controller.initialize();
  const pending = controller.refresh('explicit', input());
  assert.equal(controller.getSnapshot().showFirstGenerationOverlay, false);
  resolveAi(null);
  await pending;
});

test('exhaustion compares the complete pool with the current shown set', async () => {
  const snapshot = await persistedRecommendation();
  const ids = snapshot.recommendation.outfits.map(({ optionId }) => optionId);
  assert.equal(recommendationPoolExhausted(ids, snapshot), true);
  assert.equal(recommendationPoolExhausted([...ids, 'unseen-valid-option'], snapshot), false);
  assert.equal(recommendationPoolExhausted([], snapshot), true);
  assert.equal(recommendationPoolExhausted(null, snapshot), false);
  assert.equal(recommendationPoolExhausted(ids, null), false);
});

test('unchanged pool inputs reuse the generation composition on repeated availability checks', async () => {
  let compositions = 0;
  const { controller } = createHarness({
    createContextWithPool: (...args) => {
      compositions += 1;
      return createRecommendationContextWithPool(...args);
    },
  });
  const sameInput = { ...input(16), now };
  await controller.initialize();
  await controller.refresh('first-recommendation', sameInput);
  assert.equal(compositions, 1);

  controller.updatePoolAvailability(sameInput);
  controller.updatePoolAvailability({ ...sameInput, snapshot: { ...sameInput.snapshot } });
  assert.equal(compositions, 1);

  controller.updatePoolAvailability({ ...input(30), now });
  controller.updatePoolAvailability({ ...input(30), now });
  assert.equal(compositions, 2);
});

// The rules and their boundaries are pinned in domain/local-day.test.mjs; this checks that the
// controller still re-exports them and that the refresh trigger reads the same key.
test('the controller re-exports the local day rules and the trigger follows their key', async () => {
  const domain = await import('../domain/local-day.ts');
  assert.equal(localDayKey, domain.localDayKey);
  assert.equal(localDayKind, domain.localDayKind);
  assert.equal(localDayVariant, domain.localDayVariant);

  const signalsFor = (date) => ({
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    catalogVersion: 4,
    localDayKey: localDayKey(date),
  });
  const triggerBetween = (from, to) =>
    recommendationRefreshTrigger(signalsFor(from), signalsFor(to), null);
  const midnight = [new Date(2025, 11, 31, 23, 59), new Date(2026, 0, 1, 0, 1)];

  assert.equal(triggerBetween(...midnight), null);
  assert.equal(triggerBetween(midnight[1], new Date(2026, 0, 1, 4, 0)), 'local-day-changed');
  assert.equal(triggerBetween(new Date(2026, 0, 1, 4, 0), new Date(2026, 0, 1, 18, 0)), 'local-day-changed');
});

test('a missing persisted snapshot triggers the first recommendation', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    catalogVersion: 4,
    dayVariant: 3,
  };

  assert.equal(
    recommendationRefreshTrigger(null, current, null),
    'first-recommendation',
  );
});

test('a lasting aesthetic edit takes the existing profile-change trigger even on a new day', () => {
  const previous = {
    weatherSnapshotId: 'weather-one', locationKey: 'location-one',
    clothingPreference: 'womens', dressStyle: 'smart', styleAesthetics: [],
    catalogVersion: 4, localDayKey: '2026-09-23',
  };
  const current = { ...previous, styleAesthetics: ['minimal'], localDayKey: '2026-09-24' };
  assert.equal(recommendationRefreshTrigger(previous, current, null), 'dress-style-changed');
  assert.equal(recommendationRefreshTrigger(previous, { ...current, styleAesthetics: [] }, null),
    'local-day-changed');
});

test('equal persisted signals do not trigger a recommendation on reopen', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    catalogVersion: 4,
    dayVariant: 3,
  };

  assert.equal(recommendationRefreshTrigger(current, current, null), null);
});

test('a changed persisted location triggers a recommendation', () => {
  const current = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    catalogVersion: 4,
    dayVariant: 3,
  };

  assert.equal(
    recommendationRefreshTrigger({ ...current, locationKey: 'old' }, current, null),
    'active-location-changed',
  );
});

test('weather refresh alone preserves the recommendation while approved signals trigger generation', () => {
  const current = {
    weatherSnapshotId: 'weather-two',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    catalogVersion: 4,
    dayVariant: 3,
    localDayKey: '2026-08-01',
  };
  const previous = { ...current, weatherSnapshotId: 'weather-one' };

  assert.equal(recommendationRefreshTrigger(previous, current, null), null);
  assert.equal(
    recommendationRefreshTrigger(previous, current),
    null,
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

test('a same-day regeneration excludes the three options already on screen', async () => {
  const previous = await persistedRecommendation();
  const shownOptionIds = previous.recommendation.outfits.map(({ optionId }) => optionId);
  const unfiltered = aiRequestFor(input(16));
  const { controller, requests } = createHarness({ cached: previous });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(16));

  assert.equal(
    requests[0].options.some(({ optionId }) => shownOptionIds.includes(optionId)),
    false,
  );
  assert.equal(requests[0].options.length, unfiltered.options.length - 3);
  assert.equal(
    snapshot.recommendation.outfits.some(({ optionId }) => shownOptionIds.includes(optionId)),
    false,
  );
});

test('a fresh install generates with the complete offered option list', async () => {
  const expected = aiRequestFor(input(16));
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

// A mild day derives no clothing requirement, and it reaches the AI tiers like every other
// day: the composed pool decides whether there is anything to choose from, not the weather.
test('weather with no clothing requirements still reaches the AI client', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(20));

  assert.equal(snapshot.generationMode, 'ai-assisted');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(calls, { client: 1, saves: 1 });
});

test('a mild day falls back to the deterministic three when every AI tier fails', async () => {
  const { controller, calls } = createHarness({
    client: { recommendRouted: async () => { throw new Error('every AI tier failed'); } },
  });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(20));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(calls, { client: 1, saves: 1 });
});

// A four-option controller fixture exercises the AI floor. The catalog fallback still
// composes three outfits when every AI tier fails.
test('the smallest composable pool still reaches the AI client', async () => {
  const { controller, calls, requests } = createHarness({ createContextWithPool: fourOptionContext });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(30));

  assert.equal(requests[0].options.length, 4);
  assert.equal(calls.client, 1);
  assert.equal(snapshot.generationMode, 'ai-assisted');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.equal(controller.getSnapshot().exhausted, false);

  await controller.refresh('regenerate', input(30));
  assert.equal(requests[1].options.length, 4);

  const restored = createHarness({ cached: snapshot });
  await restored.controller.initialize();
  assert.equal(restored.controller.getSnapshot().exhausted, false);
});

test('the smallest composable pool still fills three deterministic outfits when the AI tier fails', async () => {
  const { controller, calls } = createHarness({
    client: { recommendRouted: async () => { throw new Error('every AI tier failed'); } },
  });
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(30));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.equal(new Set(snapshot.recommendation.outfits.map(
    ({ archetypeId }) => archetypeId)).size, 3);
  assert.deepEqual(calls, { client: 1, saves: 1 });
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
    catalogVersion: 4,
    dayVariant: 1,
    dressStyle: 'smart',
  };
  assert.equal(
    recommendationRefreshTrigger(previous, { ...previous, dressStyle: 'formal' }, null),
    'dress-style-changed',
  );
  assert.equal(recommendationRefreshTrigger(previous, { ...previous }, null), null);
});

test('a catalog version change refreshes and the same version preserves the snapshot', () => {
  const current = {
    weatherSnapshotId: 'w',
    locationKey: 'l',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    catalogVersion: 4,
    localDayKey: '2026-08-01',
  };
  assert.equal(
    recommendationRefreshTrigger({ ...current, catalogVersion: 3 }, current, null),
    'first-recommendation',
  );
  assert.equal(
    recommendationRefreshTrigger({ ...current, catalogVersion: null }, current, null),
    'first-recommendation',
  );
  assert.equal(recommendationRefreshTrigger(current, current, null), null);
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

test('clearing an old failure keeps the saved outfit and does not persist', async () => {
  const cached = await persistedRecommendation();
  const { controller, calls, getStored } = createHarness({ cached, failSave: true });
  await controller.initialize();
  await controller.refresh('explicit', input(20));
  assert.equal(controller.getSnapshot().lastFailure, 'unknown');
  const saved = controller.getSnapshot().snapshot;
  const saves = calls.saves;

  controller.clearLastFailure();

  assert.equal(controller.getSnapshot().lastFailure, null);
  assert.equal(controller.getSnapshot().snapshot, saved);
  assert.equal(getStored(), cached);
  assert.equal(calls.saves, saves);
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
    phase: null,
    exhausted: false,
    showFirstGenerationOverlay: false,
  });
});

test('recommendation_regenerated reports the trigger, result and generation mode on success', async () => {
  const captured = [];
  const { controller, getStored } = createHarness({
    captureAnalyticsEvent: (name, properties) => captured.push({ name, properties }),
    client: { recommendRouted: async (request) => mapWorkerAiRecommendation(request, {
      ...workerResponse(request), insightSentence: 'The outfit suits the day.',
    }, 'ai-assisted', { locale: 'en' }) },
  });
  await controller.initialize();

  await controller.refresh('first-recommendation', input(16));

  assert.equal(getStored().recommendation.insightSentence, 'The outfit suits the day.');
  assert.equal(getStored().recommendation.insightLocale, 'en');

  assert.deepEqual(captured, [{
    name: 'recommendation_regenerated',
    properties: {
      schema_version: 3,
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
      schema_version: 3,
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
      schema_version: 3,
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

// Today renders the phase, so what matters is the sequence of distinct values the controller
// emits, starting and ending at null: a settled state has no phase.
function recordPhases(controller) {
  const phases = [null];
  controller.subscribe(() => {
    const state = controller.getSnapshot();
    const phase = state.status === 'ready' ? state.phase : null;
    if (phases.at(-1) !== phase) phases.push(phase);
  });
  return phases;
}

function narratingClient(reported, outcome) {
  return {
    recommendRouted: async (request, options) => {
      for (const phase of reported) options?.onPhase?.(phase);
      if (outcome === 'fail') throw new WorkerAiClientError('service');
      return mapWorkerAiRecommendation(request, workerResponse(request), outcome);
    },
  };
}

test('an on-device answer narrates its own tier and settles back to no phase', async () => {
  const { controller } = createHarness({
    client: narratingClient(['checking-on-device', 'answer-received'], 'on-device-ai'),
  });
  await controller.initialize();
  const phases = recordPhases(controller);

  await controller.refresh('first-recommendation', input(16));

  assert.deepEqual(phases, [
    null, 'checking-on-device', 'answer-received', 'preparing-outfits', null,
  ]);
});

test('a failed on-device tier narrates the stylist before the outfits are prepared', async () => {
  const { controller } = createHarness({
    client: narratingClient(
      ['checking-on-device', 'asking-stylist', 'answer-received'],
      'ai-assisted',
    ),
  });
  await controller.initialize();
  const phases = recordPhases(controller);

  await controller.refresh('first-recommendation', input(16));

  assert.deepEqual(phases, [
    null, 'checking-on-device', 'asking-stylist', 'answer-received', 'preparing-outfits', null,
  ]);
});

// AI failure never prevents a recommendation, and the phase says so in the same words the
// deterministic composition is described with everywhere else.
test('every AI tier failing narrates the standard suggestions and still delivers three', async () => {
  const { controller } = createHarness({
    client: narratingClient(['checking-on-device', 'asking-stylist'], 'fail'),
  });
  await controller.initialize();
  const phases = recordPhases(controller);

  const snapshot = await controller.refresh('first-recommendation', input(16));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(phases, [
    null, 'checking-on-device', 'asking-stylist', 'using-standard', 'preparing-outfits', null,
  ]);
});

// The deterministic composition is synchronous, so the phase is held long enough to be
// rendered and read before the settled result replaces it.
test('the standard suggestions phase is held on screen before the deterministic three settle', async () => {
  const holds = [];
  const phasesAtHold = [];
  let controller;
  ({ controller } = createHarness({
    client: narratingClient(['checking-on-device', 'asking-stylist'], 'fail'),
    holdPhase: async (milliseconds) => {
      holds.push(milliseconds);
      phasesAtHold.push(controller.getSnapshot().phase);
    },
  }));
  await controller.initialize();

  const snapshot = await controller.refresh('first-recommendation', input(16));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.deepEqual(holds, [usingStandardPhaseMilliseconds]);
  assert.deepEqual(phasesAtHold, ['using-standard']);
});

test('an AI answer never waits on the standard suggestions hold', async () => {
  const holds = [];
  const { controller } = createHarness({ holdPhase: async (ms) => { holds.push(ms); } });
  await controller.initialize();

  const snapshot = await controller.refresh('first-recommendation', input(16));

  assert.notEqual(snapshot.generationMode, 'deterministic-fallback');
  assert.deepEqual(holds, []);
});

test('a superseded refresh does not flip the phase of the one the user is waiting on', async () => {
  let supersededOnPhase;
  let releaseSuperseded;
  let call = 0;
  const { controller } = createHarness({
    client: {
      recommendRouted: async (request, options) => {
        call += 1;
        if (call === 1) {
          supersededOnPhase = options.onPhase;
          await new Promise((resolve) => { releaseSuperseded = resolve; });
        }
        return mapWorkerAiRecommendation(request, workerResponse(request), 'ai-assisted');
      },
    },
  });
  await controller.initialize();

  const superseded = controller.refresh('first-recommendation', input(16));
  const latest = controller.refresh('explicit', input(24));
  await latest;
  assert.equal(controller.getSnapshot().phase, null);

  supersededOnPhase('asking-stylist');

  assert.equal(controller.getSnapshot().phase, null);
  releaseSuperseded();
  await superseded;
  assert.equal(controller.getSnapshot().phase, null);
});

test('joining a superseded in-flight refresh leaves the controller settled when it finishes', async () => {
  let releaseFirst;
  let call = 0;
  const { controller } = createHarness({
    client: {
      recommendRouted: async (request) => {
        call += 1;
        if (call === 1) await new Promise((resolve) => { releaseFirst = resolve; });
        return mapWorkerAiRecommendation(request, workerResponse(request), 'ai-assisted');
      },
    },
  });
  await controller.initialize();

  const first = controller.refresh('first-recommendation', input(16));
  await controller.refresh('explicit', input(24));
  const joined = controller.refresh('first-recommendation', input(16));
  assert.equal(call, 2);
  assert.equal(controller.getSnapshot().isRefreshing, true);

  releaseFirst();
  await Promise.all([first, joined]);

  assert.equal(controller.getSnapshot().isRefreshing, false);
});
