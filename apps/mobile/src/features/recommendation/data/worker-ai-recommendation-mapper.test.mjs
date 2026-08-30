import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAiRecommendationRequest,
  mapWorkerAiRecommendation,
  WorkerAiRecommendationMappingError,
} from './worker-ai-recommendation-mapper.ts';

const observedAt = '2026-08-01T18:00:00.000Z';

function input() {
  return {
    snapshot: {
      id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
      localProfileId: 'profile-one',
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: { kind: 'sample', sourceId: 'mapper-test' },
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
    wardrobeItems: [{
      id: 'private-item',
      localProfileId: 'profile-one',
      name: 'do not send this',
      category: 'footwear',
      garmentTypeId: 'sneakers',
      color: 'private color text',
      colorFamily: 'blue',
      thermalLevelOverride: null,
      waterProtectionOverride: null,
      windProtectionOverride: null,
      breathabilityOverride: null,
      armCoverageOverride: null,
      legCoverageOverride: null,
      tractionSuitabilityOverride: null,
      photoRelativePath: 'private/photo.jpg',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      deletedAt: null,
    }],
  };
}

function picks(request) {
  const used = new Set();
  return request.options.slice(0, 3).map((option) => {
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
  });
}

test('different day variants rotate distinct deterministic option sets for identical weather', () => {
  const first = createAiRecommendationRequest(input());
  const repeated = createAiRecommendationRequest(input());
  const next = createAiRecommendationRequest({ ...input(), dayVariant: 1 });

  assert.deepEqual(first, repeated);
  assert.equal(first.catalogVersion, 2);
  assert.equal(first.dayVariant, 0);
  assert.equal(first.options.length > 3 && first.options.length <= 24, true);
  assert.notDeepEqual(
    first.options.map(({ optionId }) => optionId),
    next.options.map(({ optionId }) => optionId),
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /do not send this|private color text|private\/photo\.jpg|profile-one|wardrobe:/,
  );
});

test('maps each validated pick to its locally composed outfit and archetype', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  const result = mapWorkerAiRecommendation(request, { picks: selected });

  assert.equal(result.status, 'recommended');
  assert.equal(result.generationMode, 'ai-assisted');
  assert.equal(result.outfits.length, 3);
  assert.deepEqual(
    result.outfits.map(({ archetypeId }) => archetypeId),
    selected.map(({ archetypeId }) => archetypeId),
  );
});

test('rejects a response pick whose option id was not supplied', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  selected[0] = { ...selected[0], optionId: 'unknown-option' };

  assert.throws(
    () => mapWorkerAiRecommendation(request, { picks: selected }),
    (error) => error instanceof WorkerAiRecommendationMappingError,
  );
});
