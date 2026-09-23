import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessoryOutfitSlots,
  archetypeDayFromRequirements,
  picksAreMeaningfullyDifferent,
} from '@kuyara/contracts';

import {
  aiRequestFromContext,
  createAiRecommendationRequest,
  createRecommendationContext,
  mapStoredRecommendation,
  mapWorkerAiRecommendation,
  parseRecommendationContext,
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

// The archetypes `outfitMatchesArchetype` accepts for an option on a given day, most
// specific first. The three weather labels are the day's to withhold: a waterproof shell is
// no rain answer where nothing falls, a rain boot no snow answer outside snow and sleet, and
// nothing is airy on a day asking for insulation.
function archetypeCandidates(option, day) {
  return [
    day.wet && option.traits.outerWaterProtective && 'rain_ready',
    day.frozen && option.traits.tractionEnhanced && 'snow_day',
    option.traits.outerThermalHigh && 'cold_shield',
    option.traits.windResistant && 'wind_guard',
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
}

/** Picks for the given options, one distinct accepted archetype each, or null if impossible. */
function picksFor(options, day) {
  const used = new Set();
  const selected = [];
  for (const option of options) {
    const archetypeId = archetypeCandidates(option, day)
      .find((candidate) => !used.has(candidate));
    if (!archetypeId) return null;
    used.add(archetypeId);
    selected.push({ optionId: option.optionId, archetypeId });
  }
  return selected;
}

function picks(request) {
  const selected = picksFor(
    request.options.slice(0, 3),
    archetypeDayFromRequirements(request.requirements),
  );
  if (!selected) throw new Error('fixture needs three distinct archetypes');
  return selected;
}

test('different day variants rotate distinct deterministic option sets for identical weather', () => {
  const first = createAiRecommendationRequest(input());
  const repeated = createAiRecommendationRequest(input());
  const next = createAiRecommendationRequest({ ...input(), dayVariant: 1 });

  assert.deepEqual(first, repeated);
  assert.equal(first.catalogVersion, 5);
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

test('validates optional prose without altering valid outfit picks', () => {
  const request = createAiRecommendationRequest(input());
  const selected = picks(request);
  const accepted = mapWorkerAiRecommendation(request, {
    picks: selected, insightSentence: 'The outfit suits the day.',
  }, 'ai-assisted', { locale: 'en' });
  assert.equal(accepted.insightSentence, 'The outfit suits the day.');
  assert.equal(accepted.insightLocale, 'en');
  const rejected = mapWorkerAiRecommendation(request, {
    picks: selected, insightSentence: 'The AI outfit suits the day.',
  }, 'ai-assisted', { locale: 'en' });
  assert.equal(rejected.insightSentence, undefined);
  assert.equal(rejected.insightLocale, undefined);
  assert.deepEqual(rejected.outfits, accepted.outfits);
  assert.equal(mapWorkerAiRecommendation(request, {
    picks: selected, insightSentence: 'The day is 21,2 degrees.',
  }, 'ai-assisted', { locale: 'en' }).insightSentence, undefined);
  assert.equal(mapWorkerAiRecommendation(request, {
    picks: selected, insightSentence: 'The outfit suits the day.',
  }, 'on-device-ai', { locale: 'en' }).insightSentence, undefined);
});

test('stored context requires sentence and locale together while older rows parse', () => {
  const context = createRecommendationContext(input());
  const sentence = 'The outfit suits the day.';
  assert.equal(parseRecommendationContext(context).insightSentence, undefined);
  assert.equal(parseRecommendationContext({ ...context, insightSentence: sentence,
    insightLocale: 'en' }).insightLocale, 'en');
  assert.throws(() => parseRecommendationContext({ ...context, insightSentence: sentence }),
    WorkerAiRecommendationMappingError);
  assert.throws(() => parseRecommendationContext({ ...context, insightLocale: 'en' }),
    WorkerAiRecommendationMappingError);
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

test('AI request excludes display name and every free-text profile field', () => {
  const context = gridScenarios.find(({ request }) => request)?.context;
  assert.ok(context);
  const request = aiRequestFromContext({
    ...context,
    displayName: 'Utku',
    profileNote: 'private profile note',
  });
  assert.ok(request);
  const serialized = JSON.stringify(request);
  for (const excluded of ['displayName', 'profileNote', 'Utku', 'private profile note']) {
    assert.equal(serialized.includes(excluded), false);
  }
});

// The arrangement of the six body slots. Accessories are left out: they follow from the
// weather and the option's formality, so they say nothing about how it was arranged.
function optionSignature(option) {
  return option.garments
    .filter(({ slot }) => !accessoryOutfitSlots.includes(slot))
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
      const selected = picksFor(picked, archetypeDayFromRequirements(request.requirements));
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
// mid layer was dropped, and the mid layer was promoted to a standalone primary top. Read at
// 4 degrees, where the cold makes a mid layer the best arrangement its body core has, so the
// offer carries these signatures without the alternate-core layering rule choosing them.
test('rebuilds an offered option with its mid layer instead of the simpler arrangement', () => {
  const request = createAiRecommendationRequest(input({ temperatureCelsius: 4 }));
  // Both arrangements are re-read from the offer whenever the offer order changes, and they
  // now carry the coat the thermal ladder's top rung asks 4 degrees for. What they have to
  // keep is the shape: a mid layer whose bare arrangement is valid too, so rebuilding from
  // the garment list alone could drop it or promote it to the primary top.
  const signatures = [
    'primary_top:turtleneck:base bottom:long_skirt:standalone mid_layer:cardigan:mid' +
      ' outer_layer:coat:outer footwear:ankle_boots:null',
    'primary_top:overshirt:standalone bottom:jeans:standalone mid_layer:sweater:mid' +
      ' outer_layer:insulated_jacket:outer footwear:ankle_boots:null',
  ];

  for (const signature of signatures) {
    const index = request.options.findIndex(
      (option) => optionSignature(option) === signature);
    assert.notEqual(index, -1, `the composer no longer offers ${signature}`);
    const option = request.options[index];
    const result = mapWorkerAiRecommendation(request, {
      picks: picksFor(
        triple(request.options, index),
        archetypeDayFromRequirements(request.requirements),
      ),
    });

    assert.equal(result.outfits[0].optionId, option.optionId);
    assert.equal(
      result.outfits[0].midLayer.garment.garmentTypeId,
      option.garments.find(({ slot }) => slot === 'mid_layer').garmentTypeId,
    );
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

// Accessories travel with the option as ordinary garments and come back attached, so the
// round trip has to be read on a day that has them and on a day that has none.
test('accessories survive the option and the stored round trip', () => {
  const cold = createAiRecommendationRequest(input({ temperatureCelsius: -3 }));
  const mild = createAiRecommendationRequest(input({ temperatureCelsius: 24 }));

  const carried = cold.options.map((option) =>
    option.garments.filter(({ slot }) => accessoryOutfitSlots.includes(slot)));
  assert.equal(carried.every((garments) => garments.length > 0), true);
  assert.equal(
    carried.every((garments) => garments.every(({ layerRole }) => layerRole === null)),
    true,
  );
  assert.equal(
    mild.options.every((option) =>
      option.garments.every(({ slot }) => !accessoryOutfitSlots.includes(slot))),
    true,
  );

  const selected = picks(cold);
  const result = mapWorkerAiRecommendation(cold, { picks: selected });
  const attached = result.outfits.map(({ accessories }) =>
    accessoryOutfitSlots.flatMap((slot) =>
      accessories[slot] ? [accessories[slot].garment.garmentTypeId] : []));
  assert.equal(attached.every((slots) => slots.length > 0), true);

  const restored = mapStoredRecommendation(
    createRecommendationContext(input({ temperatureCelsius: -3 }), '2026-08-01'),
    toStoredRecommendationOutfits(result),
    'ai-assisted',
  );
  assert.deepEqual(
    restored.outfits.map(({ accessories }) =>
      accessoryOutfitSlots.flatMap((slot) =>
        accessories[slot] ? [accessories[slot].garment.garmentTypeId] : [])),
    attached,
  );
  assert.deepEqual(
    restored.outfits.map(({ optionId }) => optionId),
    result.outfits.map(({ optionId }) => optionId),
  );
});

// Part 2 of Goal B: a day that derives no requirement is an AI day like any other.
test('a day with no clothing requirement still builds an AI request', () => {
  const context = createRecommendationContext(input({ temperatureCelsius: 20 }), '2026-08-01');
  assert.deepEqual(context.requirements, []);

  const request = aiRequestFromContext(context);
  assert.notEqual(request, null);
  assert.deepEqual(request.requirements, []);
  assert.equal(request.options.length >= 3, true);
});
