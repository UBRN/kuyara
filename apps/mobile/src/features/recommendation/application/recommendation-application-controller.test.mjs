import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RecommendationApplicationController,
  localDayVariant,
  recommendationRefreshTrigger,
} from './recommendation-application-controller.ts';

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
  const recommend = client?.recommend ?? (async (request) => workerResponse(request));
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

test('local day variant is a deterministic seven-day ring', () => {
  assert.equal(localDayVariant(new Date(2026, 0, 1, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 2, 12)), 2);
  assert.equal(localDayVariant(new Date(2026, 0, 8, 12)), 1);
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
    dayVariant: 3,
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
    recommendationRefreshTrigger({ ...previous, dayVariant: 2 }, current, null),
    'local-day-changed',
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
