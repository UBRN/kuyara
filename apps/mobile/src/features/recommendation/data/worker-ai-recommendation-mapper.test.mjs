import assert from 'node:assert/strict';
import test from 'node:test';

import { picksAreMeaningfullyDifferent } from '@kuyara/contracts';

import {
  aiRequestFromContext,
  createAiRecommendationRequest,
  createRecommendationContext,
  mapStoredRecommendation,
  mapWorkerAiRecommendation,
  toStoredRecommendationOutfits,
  WorkerAiRecommendationMappingError,
} from './worker-ai-recommendation-mapper.ts';
import { recommendOutfits } from '../application/recommend-outfits.ts';

const observedAt = '2026-08-01T18:00:00.000Z';

function input({
  temperatureCelsius = 16,
  condition = 'clear',
  clothingPreference = 'womens',
  dayVariant = 0,
  dressStyle = undefined,
} = {}) {
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
        temperatureCelsius,
        apparentTemperatureCelsius: temperatureCelsius,
        condition,
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
        condition,
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference,
    dressStyle,
    dayVariant,
    localDayKey: '2026-08-01',
  };
}

// The archetypes `outfitMatchesArchetype` accepts for an option, most specific first.
function archetypeCandidates(option) {
  return [
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
}

/** Picks for the given options, one distinct accepted archetype each, or null if impossible. */
function picksFor(options) {
  const used = new Set();
  const selected = [];
  for (const option of options) {
    const archetypeId = archetypeCandidates(option).find((candidate) => !used.has(candidate));
    if (!archetypeId) return null;
    used.add(archetypeId);
    selected.push({ optionId: option.optionId, archetypeId });
  }
  return selected;
}

function picks(request) {
  const selected = picksFor(request.options.slice(0, 3));
  if (!selected) throw new Error('fixture needs three distinct archetypes');
  return selected;
}

test('different day variants rotate distinct deterministic option sets for identical weather', () => {
  const first = createAiRecommendationRequest(input());
  const repeated = createAiRecommendationRequest(input());
  const next = createAiRecommendationRequest({ ...input(), dayVariant: 1 });

  assert.deepEqual(first, repeated);
  assert.equal(first.catalogVersion, 4);
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

const dressStyles = ['casual', 'smart', 'formal'];

// A grid wide enough to reach every composition shape: no layers, a mid layer, an optional
// outer layer, one-pieces, and the traction and waterproofing branches. Dress style reorders
// formality preference but never changes the offered options, so it rotates through the grid
// instead of tripling it; composing the catalog for one scenario costs about 120 ms.
const gridScenarios = [-3, 8, 16, 24, 31].flatMap((temperatureCelsius) =>
  ['clear', 'cloudy', 'rain', 'snow'].flatMap((condition) =>
    ['womens', 'mens'].flatMap((clothingPreference) =>
      [0, 3].map((dayVariant) => ({
        temperatureCelsius,
        condition,
        clothingPreference,
        dayVariant,
      })),
    ),
  ),
).map((scenario, index) => {
  const scenarioInput = input({
    ...scenario,
    dressStyle: dressStyles[index % dressStyles.length],
  });
  const context = createRecommendationContext(scenarioInput);
  return { scenarioInput, context, request: aiRequestFromContext(context) };
});

function optionSignature(option) {
  return option.garments
    .map(({ slot, garmentTypeId, layerRole }) => `${slot}:${garmentTypeId}:${layerRole}`)
    .join(' ');
}

function triple(options, index) {
  return [0, 1, 2].map((offset) => options[(index + offset) % options.length]);
}

// The defect this guards: `outfitFromOption` rebuilt a picked option from its garment list
// and took the first valid arrangement, not the offered one, so any option with a mid layer
// or an optional outer layer came back simpler, failed the match, and took the whole answer
// down to "Standard suggestions" even though the Worker had answered with valid picks.
test('every offered option rebuilds into the outfit it describes, across the weather grid', () => {
  let checkedOptions = 0;
  for (const { request } of gridScenarios) {
    if (!request) continue;
    for (let index = 0; index < request.options.length; index += 3) {
      const picked = triple(request.options, index);
      const selected = picksFor(picked);
      if (!selected || !picksAreMeaningfullyDifferent(picked)) continue;
      const result = mapWorkerAiRecommendation(request, { picks: selected });

      assert.deepEqual(
        result.outfits.map(({ optionId }) => optionId),
        selected.map(({ optionId }) => optionId),
      );
      assert.deepEqual(
        result.outfits.map(({ archetypeId }) => archetypeId),
        selected.map(({ archetypeId }) => archetypeId),
      );
      checkedOptions += picked.length;
    }
  }

  // The grid offers about 1,500 options; the guard catches a loop that skipped them all.
  assert.equal(checkedOptions > 1_000, true);
});

test('every deterministic recommendation round-trips through the stored mapper', () => {
  let checkedRecommendations = 0;
  for (const { scenarioInput, context } of gridScenarios) {
    const recommendation = recommendOutfits(scenarioInput);
    if (recommendation.status !== 'recommended') continue;
    const restored = mapStoredRecommendation(
      context,
      toStoredRecommendationOutfits(recommendation),
      'deterministic-fallback',
    );

    assert.equal(restored.generationMode, 'deterministic-fallback');
    assert.deepEqual(
      restored.outfits.map(({ optionId, archetypeId }) => ({ optionId, archetypeId })),
      recommendation.outfits.map(({ optionId, archetypeId }) => ({ optionId, archetypeId })),
    );
    checkedRecommendations += 1;
  }

  assert.equal(checkedRecommendations, gridScenarios.length);
});

// The two live Worker answers that the first valid arrangement rejected on 2026-09-13: the
// mid layer was dropped, and the overshirt was promoted to a standalone primary top.
test('rebuilds an offered option with its mid layer instead of the simpler arrangement', () => {
  const request = createAiRecommendationRequest(input({ temperatureCelsius: 24 }));
  const signatures = [
    'primary_top:blouse:base bottom:shorts:standalone mid_layer:overshirt:mid footwear:sneakers:null',
    'primary_top:sleeveless_top:base bottom:shorts:standalone mid_layer:overshirt:mid footwear:sneakers:null',
  ];

  for (const signature of signatures) {
    const index = request.options.findIndex(
      (option) => optionSignature(option) === signature);
    assert.notEqual(index, -1, `the composer no longer offers ${signature}`);
    const option = request.options[index];
    const result = mapWorkerAiRecommendation(request, {
      picks: picksFor(triple(request.options, index)),
    });

    assert.equal(result.outfits[0].optionId, option.optionId);
    assert.equal(result.outfits[0].midLayer.garment.garmentTypeId, 'overshirt');
    assert.equal(
      result.outfits[0].body.primaryTop.garment.garmentTypeId,
      option.garments[0].garmentTypeId,
    );
  }
});

test('rejects an option that names a garment the catalog does not have', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  const [option, ...rest] = request.options;
  const invented = {
    ...option,
    garments: [{ ...option.garments[0], garmentTypeId: 'space_suit' }, ...option.garments.slice(1)],
  };

  assert.throws(
    () => mapWorkerAiRecommendation({ ...request, options: [invented, ...rest] }, { picks: selected }),
    (error) => error instanceof WorkerAiRecommendationMappingError,
  );
});

test('rejects an option that moves a garment into a slot it cannot occupy', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  const [option, ...rest] = request.options;
  const misplaced = {
    ...option,
    garments: option.garments.map((garment) => garment.slot === 'footwear'
      ? { ...garment, slot: 'mid_layer', layerRole: 'mid' }
      : garment),
  };

  assert.throws(
    () => mapWorkerAiRecommendation({ ...request, options: [misplaced, ...rest] }, { picks: selected }),
    (error) => error instanceof WorkerAiRecommendationMappingError,
  );
});
