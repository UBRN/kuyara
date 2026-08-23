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
        temperatureCelsius: 30,
        apparentTemperatureCelsius: 30,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: 30,
      maximumTemperatureCelsius: 31,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius: 30,
        apparentTemperatureCelsius: 30,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
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

const outfit = [
  { slot: 'primary_top', layerRole: 'standalone', candidateKey: 'catalog:t_shirt' },
  { slot: 'bottom', layerRole: 'standalone', candidateKey: 'catalog:shorts' },
  { slot: 'footwear', layerRole: null, candidateKey: 'catalog:sandals' },
];

test('builds a sanitized request and maps validated arrangements to domain outfits', () => {
  const request = createAiRecommendationRequest(input());
  const serialized = JSON.stringify(request);

  assert.equal(request.candidates.some(({ candidateKey }) => candidateKey === 'wardrobe:private-item'), true);
  assert.equal(request.candidates.find(({ candidateKey }) => candidateKey === 'wardrobe:private-item').colorFamily, 'blue');
  assert.doesNotMatch(serialized, /do not send this|private color text|private\/photo\.jpg|profile-one/);

  const result = mapWorkerAiRecommendation(request, {
    outfits: [outfit, outfit, outfit],
  });

  assert.equal(result.status, 'recommended');
  assert.equal(result.generationMode, 'ai-assisted');
  assert.equal(result.outfits.length, 3);
  assert.deepEqual(result.outfits[0].candidateKeys, [
    'catalog:sandals',
    'catalog:shorts',
    'catalog:t_shirt',
  ]);
});

test('rejects an AI layer assignment that deterministic domain rules do not reproduce', () => {
  const request = createAiRecommendationRequest(input());
  const invalid = outfit.map((garment) =>
    garment.slot === 'primary_top' ? { ...garment, layerRole: 'base' } : garment,
  );

  assert.throws(
    () => mapWorkerAiRecommendation(request, { outfits: [invalid, outfit, outfit] }),
    (error) => error instanceof WorkerAiRecommendationMappingError,
  );
});
