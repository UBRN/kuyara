import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RecommendationApplicationController,
  recommendationRefreshTrigger,
  recommendationWardrobeKey,
  shouldRefreshRecommendation,
} from './recommendation-application-controller.ts';

const profileId = 'profile-one';
const now = '2026-08-01T20:00:00.000Z';
const workerOutfit = [
  { slot: 'primary_top', layerRole: 'standalone', candidateKey: 'catalog:t_shirt' },
  { slot: 'bottom', layerRole: 'standalone', candidateKey: 'catalog:shorts' },
  { slot: 'footwear', layerRole: null, candidateKey: 'catalog:sandals' },
];

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
    wardrobeItems: [],
  };
}

function createHarness({ cached = null, client, failSave = false } = {}) {
  let stored = cached;
  const calls = { client: 0, saves: 0 };
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
        generationMode: value.recommendation.generationMode,
        recommendation: value.recommendation,
        createdAt: cached?.createdAt ?? now,
        updatedAt: now,
      };
      return stored;
    },
  };
  const recommend = client?.recommend ?? (async () => ({
    outfits: [workerOutfit, workerOutfit, workerOutfit],
  }));
  const aiClient = {
    async recommend(...args) {
      calls.client += 1;
      return recommend(...args);
    },
  };
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => repository,
    client: aiClient,
  });
  return { controller, calls, repository, getStored: () => stored };
}

test('refresh decision allows only the five approved change triggers', () => {
  assert.equal(shouldRefreshRecommendation('app-opened'), false);
  for (const trigger of [
    'stale-weather-refreshed',
    'active-location-changed',
    'clothing-preference-changed',
    'wardrobe-changed',
    'explicit',
  ]) assert.equal(shouldRefreshRecommendation(trigger), true);
});

test('wardrobe invalidation ignores private presentation fields but tracks recommendation properties', () => {
  const item = {
    id: 'item-one',
    localProfileId: profileId,
    name: 'private name',
    category: 'top',
    garmentTypeId: 't_shirt',
    color: 'private color',
    colorFamily: 'blue',
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: 'private/photo.jpg',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  assert.equal(
    recommendationWardrobeKey([item]),
    recommendationWardrobeKey([{
      ...item,
      name: 'renamed',
      color: 'different free-form color',
      photoRelativePath: 'private/replaced.jpg',
      updatedAt: '2026-08-01T20:05:00.000Z',
    }]),
  );
  assert.notEqual(
    recommendationWardrobeKey([item]),
    recommendationWardrobeKey([{ ...item, thermalLevelOverride: 'high' }]),
  );
});

test('trigger selection distinguishes stale refresh from unapproved weather changes', () => {
  const current = {
    weatherSnapshotId: 'weather-two',
    locationKey: 'location-one',
    clothingPreference: 'womens',
    wardrobeKey: 'wardrobe-one',
    contextKey: 'context-one',
  };
  const previous = { ...current, weatherSnapshotId: 'weather-one' };

  assert.equal(recommendationRefreshTrigger(null, current, null), null);
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
    recommendationRefreshTrigger({ ...previous, wardrobeKey: 'old' }, current, null),
    'wardrobe-changed',
  );
});

test('app initialization renders cache without requesting a recommendation', async () => {
  const cached = { id: 'cached-recommendation' };
  const { controller, calls } = createHarness({ cached });

  await controller.initialize();
  await controller.refresh('app-opened', input());

  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().snapshot, cached);
  assert.deepEqual(calls, { client: 0, saves: 0 });
});

test('duplicate concurrent refreshes share one AI request and one save', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { controller, calls } = createHarness({
    client: { recommend: async () => pending },
  });
  await controller.initialize();

  const first = controller.refresh('explicit', input());
  const second = controller.refresh('explicit', input());
  assert.equal(calls.client, 1);
  resolve({ outfits: [workerOutfit, workerOutfit, workerOutfit] });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, secondResult);
  assert.equal(calls.client, 1);
  assert.equal(calls.saves, 1);
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

test('weather with no clothing requirements skips AI and persists the deterministic fallback', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', input(20));

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(snapshot.recommendation.outfits.length, 3);
  assert.deepEqual(calls, { client: 0, saves: 1 });
});

test('candidate sets above the Worker limit skip AI without blocking local fallback', async () => {
  const oversized = input(16);
  oversized.wardrobeItems = Array.from({ length: 126 }, (_value, index) => ({
    id: `accessory-${index}`,
    localProfileId: profileId,
    name: null,
    category: 'accessory',
    garmentTypeId: 'umbrella',
    color: null,
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
  const { controller, calls } = createHarness();
  await controller.initialize();

  const snapshot = await controller.refresh('explicit', oversized);

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
