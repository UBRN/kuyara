import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { recommendOutfits } from './recommend-outfits.ts';

const observedAt = '2026-08-01T18:00:00.000Z';
const futureAt = '2026-08-01T19:00:00.000Z';

function measurements(overrides = {}) {
  return {
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 0,
    humidity: 0.5,
    uvIndex: 0,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  const current = {
    observedAt,
    ...measurements(overrides.current),
  };
  const hourly = overrides.hourly ?? [
    {
      forecastAt: futureAt,
      ...measurements({
        temperatureCelsius: current.temperatureCelsius,
        apparentTemperatureCelsius: current.apparentTemperatureCelsius,
        condition: current.condition,
        precipitationProbability: current.precipitationProbability,
        windSpeedMetersPerSecond: current.windSpeedMetersPerSecond,
      }),
    },
  ];

  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: observedAt,
    origin: { kind: 'sample', sourceId: 'recommend-outfits-test' },
    current,
    minimumTemperatureCelsius:
      overrides.minimumTemperatureCelsius ?? current.temperatureCelsius,
    maximumTemperatureCelsius:
      overrides.maximumTemperatureCelsius ?? current.temperatureCelsius + 1,
    hourly,
    ...overrides.snapshotFields,
  };
}

function coldWetSnapshot() {
  return snapshot({
    current: {
      temperatureCelsius: 0,
      apparentTemperatureCelsius: -2,
      condition: 'heavy_rain',
      precipitationProbability: 1,
      windSpeedMetersPerSecond: 12,
    },
    minimumTemperatureCelsius: -2,
    maximumTemperatureCelsius: 2,
  });
}

function warmWetSnapshot() {
  return snapshot({
    current: {
      temperatureCelsius: 20,
      apparentTemperatureCelsius: 18,
      condition: 'rain',
      precipitationProbability: 1,
      windSpeedMetersPerSecond: 8,
    },
    minimumTemperatureCelsius: 18,
    maximumTemperatureCelsius: 22,
  });
}

function candidateKeys(result) {
  return result.outfits.flatMap((outfit) => outfit.candidateKeys);
}

test('cold wet weather recommends immutable deterministic catalog outfits', () => {
  const weather = coldWetSnapshot();
  const result = recommendOutfits({
    snapshot: weather,
    clothingPreference: 'womens',
  });

  assert.equal(result.status, 'recommended');
  assert.equal(result.generationMode, 'deterministic-fallback');
  assert.equal(result.outfits.length >= 1 && result.outfits.length <= 3, true);
  assert.deepEqual(result.requirements, deriveClothingRequirements(weather));
  assert.equal(result.outfits.every((outfit) =>
    outfit.requirementEvaluations.every(({ requirement, status }) =>
      requirement.priority === 'optional' ||
      status === 'met' ||
      status === 'tradeoff',
    )), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requirements), true);
  assert.equal(Object.isFrozen(result.outfits), true);
});

test('fallback archetypes use rule order and advance past duplicates', () => {
  const result = recommendOutfits({
    snapshot: coldWetSnapshot(),
    clothingPreference: 'womens',
  });

  assert.equal(result.status, 'recommended');
  assert.deepEqual(
    result.outfits.map(({ archetypeId }) => archetypeId),
    ['rain_ready', 'snow_day', 'wind_guard'],
  );
});

test('mens recommendations exclude womens-only catalog types', () => {
  const weather = warmWetSnapshot();
  const womens = recommendOutfits({
    snapshot: weather,
    clothingPreference: 'womens',
  });
  const mens = recommendOutfits({
    snapshot: weather,
    clothingPreference: 'mens',
  });
  const womensOnlyKeys = ['catalog:blouse', 'catalog:skirt', 'catalog:dress'];

  assert.equal(womens.status, 'recommended');
  assert.equal(mens.status, 'recommended');
  assert.equal(
    candidateKeys(womens).some((key) => womensOnlyKeys.includes(key)),
    true,
  );
  assert.equal(
    candidateKeys(mens).some((key) => womensOnlyKeys.includes(key)),
    false,
  );
});

test('recommendations are deterministic across repeated calls with the same input', () => {
  const input = Object.freeze({
    snapshot: warmWetSnapshot(),
    clothingPreference: 'womens',
  });

  const first = recommendOutfits(input);
  const repeated = recommendOutfits(input);

  assert.deepEqual(first, repeated);
});

test('fallback prefers each dress style while preserving three distinct valid options', () => {
  for (const dressStyle of ['casual', 'smart', 'formal']) {
    const result = recommendOutfits({
      snapshot: snapshot(),
      clothingPreference: 'womens',
      dayVariant: 0,
      dressStyle,
    });
    assert.equal(result.status, 'recommended');
    assert.equal(result.outfits.length, 3);
    assert.equal(result.outfits[0].formality, dressStyle);
    assert.equal(new Set(result.outfits.map(({ optionId }) => optionId)).size, 3);
  }
});

test('casual and formal styles select different triples from the same conditions', () => {
  const shared = { snapshot: snapshot(), clothingPreference: 'womens', dayVariant: 0 };
  const casual = recommendOutfits({ ...shared, dressStyle: 'casual' });
  const formal = recommendOutfits({ ...shared, dressStyle: 'formal' });
  assert.equal(casual.status, 'recommended');
  assert.equal(formal.status, 'recommended');
  assert.notDeepEqual(
    casual.outfits.map(({ optionId }) => optionId),
    formal.outfits.map(({ optionId }) => optionId),
  );
});

test('each dress style keeps three distinct fallback outfits across catalog preferences, weather and day variants', () => {
  for (const clothingPreference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const weather of [snapshot(), coldWetSnapshot(), warmWetSnapshot()]) {
        for (let dayVariant = 0; dayVariant < 7; dayVariant += 1) {
          const result = recommendOutfits({
            snapshot: weather,
            clothingPreference,
            dressStyle,
            dayVariant,
          });
          assert.equal(result.status, 'recommended');
          assert.equal(result.outfits.length, 3);
          assert.equal(new Set(result.outfits.map(({ optionId }) => optionId)).size, 3);
          assert.equal(new Set(result.outfits.map(({ archetypeId }) => archetypeId)).size, 3);
        }
      }
    }
  }
});
