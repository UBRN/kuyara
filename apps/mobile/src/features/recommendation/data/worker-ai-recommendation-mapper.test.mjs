import assert from 'node:assert/strict';
import test from 'node:test';

import { picksAreMeaningfullyDifferent } from '@kuyara/contracts';

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
    localDayKey: '2026-08-01',
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
  assert.equal(first.catalogVersion, 3);
  assert.equal(first.dayVariant, 0);
  assert.equal(first.options.length > 3 && first.options.length <= 24, true);
  assert.notDeepEqual(
    first.options.map(({ optionId }) => optionId),
    next.options.map(({ optionId }) => optionId),
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /profile-one|wardrobe:/,
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

test('mobile request sends only dress style and preserves the candidate set across styles', () => {
  const smart = createAiRecommendationRequest({ ...input(), dressStyle: 'smart' });
  for (const dressStyle of ['casual', 'smart', 'formal']) {
    const request = createAiRecommendationRequest({
      ...input(),
      dressStyle,
      birthDate: '2000-01-01',
    });
    assert.equal(request.dressStyle, dressStyle);
    assert.deepEqual(request.options, smart.options);
    assert.equal('birthDate' in request, false);
    assert.equal('birthYear' in request, false);
    assert.equal('localDayKey' in request, false);
    assert.equal(['age', 'Band'].join('') in request, false);
  }
});

test('records the tier that produced the picks as the generation mode', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);

  assert.equal(
    mapWorkerAiRecommendation(request, { picks: selected }, 'on-device-ai').generationMode,
    'on-device-ai',
  );
  assert.equal(
    mapWorkerAiRecommendation(request, { picks: selected }, 'ai-assisted').generationMode,
    'ai-assisted',
  );
});

// The deterministic composer never offers two options a user would call the same outfit, so
// the near-duplicate has to be built. Whichever gate fires first, the answer is rejected
// whole and never repaired into a different outfit.
test('rejects an answer that fails the shared distinctness rule, whichever tier chose it', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  const twin = {
    ...request.options.find(({ optionId }) => optionId === selected[0].optionId),
    optionId: 'twin-of-first',
  };
  const withTwin = { ...request, options: [...request.options, twin] };
  assert.equal(
    picksAreMeaningfullyDifferent([
      request.options.find(({ optionId }) => optionId === selected[0].optionId),
      twin,
    ]),
    false,
  );

  for (const mode of ['on-device-ai', 'ai-assisted']) {
    assert.throws(
      () => mapWorkerAiRecommendation(
        withTwin,
        { picks: [selected[0], { ...selected[1], optionId: twin.optionId }, selected[2]] },
        mode,
      ),
      (error) => error instanceof WorkerAiRecommendationMappingError,
    );
  }
});
