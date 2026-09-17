import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiModelInputFromRequest,
  archetypeDayFromRequirements,
  meetsArchetypePrecondition,
  picksAreMeaningfullyDifferent,
} from './ai-model-input.ts';
import { aiRecommendV1RequestSchema, outfitArchetypeIds } from './ai-v1.ts';

function garment(slot, garmentTypeId, layerRole = 'standalone') {
  return { slot, layerRole, garmentTypeId };
}

const traits = {
  hasMidLayer: false,
  hasOuterLayer: false,
  outerThermalHigh: false,
  outerWaterProtective: false,
  windResistant: false,
  tractionEnhanced: false,
  breathabilityHigh: true,
};

function option(optionId, garments, formality = 'casual') {
  return { optionId, formality, garments, traits };
}

const fixtureRequest = Object.freeze({
  clothingPreference: 'womens',
  dressStyle: 'formal',
  catalogVersion: 7,
  dayVariant: 4,
  requirements: [{
    kind: 'thermal',
    minimum: 'moderate',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  options: [
    option('opt-1', [
      garment('primary_top', 'blouse', 'base'),
      garment('bottom', 'trousers'),
      garment('footwear', 'closed_shoes', null),
    ], 'smart'),
    option('opt-2', [
      garment('one_piece', 'dress', 'standalone'),
      garment('outer_layer', 'coat', 'outer'),
      garment('footwear', 'ankle_boots', null),
    ]),
  ],
});

// The model input is a serialized payload, so field order is part of the behaviour.
// eligibleArchetypeIds is the one addition to the Worker's original inline assembly:
// the caller rejects a pick whose archetype fails its precondition, so the model has
// to be told which archetypes an option can carry. The fixture's day asks for moderate
// insulation, so neither option is offered `light_and_airy` on it.
const serializedInput = '{"clothingPreference":"womens","formalityOrder":["formal","smart","casual"],'
  + '"options":[{"optionId":"opt-1","formality":"smart","garments":['
  + '{"slot":"primary_top","garmentTypeId":"blouse"},'
  + '{"slot":"bottom","garmentTypeId":"trousers"},'
  + '{"slot":"footwear","garmentTypeId":"closed_shoes"}],'
  + '"eligibleArchetypeIds":["smart_casual"]},'
  + '{"optionId":"opt-2","formality":"casual","garments":['
  + '{"slot":"one_piece","garmentTypeId":"dress"},'
  + '{"slot":"outer_layer","garmentTypeId":"coat"},'
  + '{"slot":"footwear","garmentTypeId":"ankle_boots"}],'
  + '"eligibleArchetypeIds":["weekend_relaxed"]}]}';

test('a request the wire schema accepts projects to the same serialized input', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  assert.equal(JSON.stringify(aiModelInputFromRequest(parsed)), serializedInput);
});

test('the projection carries only the approved fields', () => {
  const input = aiModelInputFromRequest(fixtureRequest);
  assert.deepEqual(Object.keys(input), ['clothingPreference', 'formalityOrder', 'options']);
  for (const projected of input.options) {
    assert.deepEqual(
      Object.keys(projected),
      ['optionId', 'formality', 'garments', 'eligibleArchetypeIds'],
    );
    for (const projectedGarment of projected.garments) {
      assert.deepEqual(Object.keys(projectedGarment), ['slot', 'garmentTypeId']);
    }
  }
  for (const withheld of ['requirements', 'catalogVersion', 'dayVariant', 'dressStyle', 'traits', 'layerRole']) {
    assert.equal(JSON.stringify(input).includes(withheld), false);
  }
});

// The regression: the handler rejected every reply whose archetype failed a
// precondition the model was never shown, so a healthy provider still produced
// ai_unavailable. The offered list and the enforced rule must be the same set.
test('every option is offered exactly the conditional archetypes it qualifies for', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  const input = aiModelInputFromRequest(parsed);
  const day = archetypeDayFromRequirements(parsed.requirements);
  parsed.options.forEach((option, index) => {
    assert.deepEqual(
      input.options[index].eligibleArchetypeIds,
      outfitArchetypeIds.filter((id) =>
        id !== 'everyday_easy' && meetsArchetypePrecondition(id, option, undefined, day)),
    );
  });
});

// The one archetype the projection leaves out costs bytes under every option and
// discriminates nothing, so the prompts state it. The gate must still take it.
test('everyday_easy is withheld from the projection and still accepted by the gate', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  const input = aiModelInputFromRequest(parsed);
  parsed.options.forEach((option, index) => {
    assert.equal(meetsArchetypePrecondition('everyday_easy', option), true);
    assert.equal(
      input.options[index].eligibleArchetypeIds.includes('everyday_easy'),
      false,
    );
  });
});

test('no option is offered an archetype whose precondition it fails', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  const input = aiModelInputFromRequest(parsed);
  parsed.options.forEach((option, index) => {
    assert.notEqual(input.options[index].eligibleArchetypeIds.length, 0);
    const day = archetypeDayFromRequirements(parsed.requirements);
    for (const archetypeId of input.options[index].eligibleArchetypeIds) {
      assert.equal(meetsArchetypePrecondition(archetypeId, option, undefined, day), true);
    }
  });
});

// The regression this closes: nothing in the pipeline knew the weekday, so a Tuesday could
// be labelled Weekend Relaxed.
test('a weekday withholds weekend_relaxed from the projection and from the gate', () => {
  const weekday = aiRecommendV1RequestSchema.parse({ ...fixtureRequest, dayKind: 'weekday' });
  const input = aiModelInputFromRequest(weekday);
  assert.equal(input.dayKind, 'weekday');
  for (const projected of input.options) {
    assert.equal(projected.eligibleArchetypeIds.includes('weekend_relaxed'), false);
  }
  const casual = weekday.options[1];
  assert.equal(meetsArchetypePrecondition('weekend_relaxed', casual, 'weekday'), false);
  assert.equal(meetsArchetypePrecondition('weekend_relaxed', casual, 'weekend'), true);
  assert.equal(meetsArchetypePrecondition('weekend_relaxed', casual), true);
  assert.equal(meetsArchetypePrecondition('everyday_easy', casual, 'weekday'), true);
});

// The regression this closes: the three weather archetypes read the garment and never the
// day, so a waterproof shell was Rain Ready on a dry freezing day, a rain boot was Snow Day
// in the rain, and a breathable outfit was Light and Airy at 5 C.
test('the three weather archetypes are withheld on a day that contradicts them', () => {
  const wearing = {
    ...option('opt-3', [
      garment('primary_top', 'blouse', 'base'),
      garment('bottom', 'trousers'),
      garment('outer_layer', 'rain_jacket', 'outer'),
      garment('footwear', 'weather_boots', null),
    ]),
    traits: {
      ...traits,
      hasOuterLayer: true,
      outerWaterProtective: true,
      tractionEnhanced: true,
    },
  };
  const requirementsFor = (kind, minimum, reasonCodes) =>
    [{ kind, minimum, priority: 'mandatory', reasonCodes }];
  const days = {
    dry: archetypeDayFromRequirements([]),
    rain: archetypeDayFromRequirements(
      requirementsFor('water_protection', 'waterproof', ['condition_rain']),
    ),
    snow: archetypeDayFromRequirements(
      requirementsFor('traction', 'enhanced', ['condition_snow']),
    ),
    cold: archetypeDayFromRequirements(
      requirementsFor('thermal', 'moderate', ['temperature_low']),
    ),
  };

  assert.deepEqual(days.rain, { frozen: false, wet: true, cold: false });
  assert.deepEqual(days.snow, { frozen: true, wet: false, cold: false });
  assert.deepEqual(days.dry, { frozen: false, wet: false, cold: false });

  assert.equal(meetsArchetypePrecondition('rain_ready', wearing, undefined, days.rain), true);
  assert.equal(meetsArchetypePrecondition('rain_ready', wearing, undefined, days.dry), false);
  assert.equal(meetsArchetypePrecondition('rain_ready', wearing, undefined, days.snow), false);
  assert.equal(meetsArchetypePrecondition('snow_day', wearing, undefined, days.snow), true);
  assert.equal(meetsArchetypePrecondition('snow_day', wearing, undefined, days.rain), false);
  assert.equal(meetsArchetypePrecondition('snow_day', wearing, undefined, days.dry), false);

  // An option with no shell, so the airy branch is about the day alone.
  const airy = parsedFixtureOption();
  assert.equal(meetsArchetypePrecondition('light_and_airy', airy, undefined, days.dry), true);
  assert.equal(meetsArchetypePrecondition('light_and_airy', airy, undefined, days.cold), false);

  // A caller that passes no day keeps the day-blind answer builds 8 and 9 expect, which is
  // also why knowing the day can only ever withdraw a label, never add one.
  assert.equal(meetsArchetypePrecondition('rain_ready', wearing), true);
  assert.equal(meetsArchetypePrecondition('snow_day', wearing), true);
  assert.equal(meetsArchetypePrecondition('light_and_airy', airy), true);
});

function parsedFixtureOption() {
  return aiRecommendV1RequestSchema.parse(fixtureRequest).options[0];
}

test('office_ready admits smart only for callers that send a day kind', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  const smart = parsed.options[0];
  const formal = { ...smart, formality: 'formal' };

  assert.equal(meetsArchetypePrecondition('office_ready', smart), false);
  assert.equal(meetsArchetypePrecondition('office_ready', smart, 'weekday'), true);
  assert.equal(meetsArchetypePrecondition('office_ready', smart, 'weekend'), true);
  assert.equal(meetsArchetypePrecondition('office_ready', formal), true);
  assert.equal(
    aiModelInputFromRequest({ ...parsed, dayKind: 'weekday' })
      .options[0].eligibleArchetypeIds.includes('office_ready'),
    true,
  );
});

test('on_the_move admits any casual outfit only for callers that send a day kind', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  const smart = parsed.options[0];
  const casual = parsed.options[1];

  // Without a day kind the two widened archetypes stay where builds 8 and 9 left them:
  // office_ready formal only, on_the_move sneakers only, and this option wears boots.
  assert.equal(meetsArchetypePrecondition('office_ready', smart), false);
  assert.equal(meetsArchetypePrecondition('on_the_move', casual), false);
  assert.equal(meetsArchetypePrecondition('office_ready', smart, 'weekday'), true);
  assert.equal(meetsArchetypePrecondition('on_the_move', casual, 'weekday'), true);
  assert.equal(
    aiModelInputFromRequest({ ...parsed, dayKind: 'weekday' })
      .options[1].eligibleArchetypeIds.includes('on_the_move'),
    true,
  );
});

test('an absent day kind is left out of the projection', () => {
  assert.equal(
    JSON.stringify(aiModelInputFromRequest(fixtureRequest)).includes('dayKind'),
    false,
  );
});

test('an absent dress style projects the smart formality order', () => {
  const { dressStyle: _dropped, ...withoutDressStyle } = fixtureRequest;
  assert.deepEqual(
    aiModelInputFromRequest(withoutDressStyle).formalityOrder,
    ['smart', 'casual', 'formal'],
  );
});

const topAndBottom = (top, bottom, extra = []) => option('x', [
  garment('primary_top', top),
  garment('bottom', bottom),
  garment('footwear', 'sneakers', null),
  ...extra,
]);

test('a different body core alone makes two picks different', () => {
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans'),
      topAndBottom('shirt', 'jeans'),
    ]),
    true,
  );
  assert.equal(
    picksAreMeaningfullyDifferent([
      option('a', [
        garment('one_piece', 'dress'),
        garment('footwear', 'sneakers', null),
      ]),
      topAndBottom('t_shirt', 'jeans'),
    ]),
    true,
  );
  assert.equal(
    picksAreMeaningfullyDifferent([
      option('a', [garment('one_piece', 'dress'), garment('footwear', 'sneakers', null)]),
      option('b', [garment('one_piece', 'jumpsuit'), garment('footwear', 'sneakers', null)]),
    ]),
    true,
  );
});

test('a shared body core needs two differing garments', () => {
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans'),
      topAndBottom('t_shirt', 'jeans', [garment('mid_layer', 'cardigan', 'mid')]),
    ]),
    false,
  );
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans'),
      topAndBottom('t_shirt', 'jeans', [
        garment('mid_layer', 'cardigan', 'mid'),
        garment('outer_layer', 'coat', 'outer'),
      ]),
    ]),
    true,
  );
});

test('one repeated pair in a trio fails the whole set', () => {
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans'),
      topAndBottom('shirt', 'trousers'),
      topAndBottom('t_shirt', 'jeans', [garment('mid_layer', 'cardigan', 'mid')]),
    ]),
    false,
  );
  assert.equal(picksAreMeaningfullyDifferent([]), true);
});

// Accessories follow from the weather and the option's formality alone, so two options that
// differ in one shoe would otherwise look three pairs apart the moment that shoe moved them
// to another formality and changed the hat and the scarf with it.
test('accessories never make two picks different', () => {
  const casual = [
    garment('head', 'beanie', null),
    garment('neck', 'neck_gaiter', null),
  ];
  const smart = [
    garment('head', 'brimmed_hat', null),
    garment('neck', 'scarf', null),
  ];

  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans', casual),
      topAndBottom('t_shirt', 'jeans', smart),
    ]),
    false,
  );
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans', [garment('mid_layer', 'cardigan', 'mid'), ...casual]),
      topAndBottom('t_shirt', 'jeans', [garment('mid_layer', 'sweater', 'mid'), ...smart]),
    ]),
    false,
  );
  // The body still decides: two differing body garments are two differing body garments.
  assert.equal(
    picksAreMeaningfullyDifferent([
      topAndBottom('t_shirt', 'jeans', casual),
      topAndBottom('t_shirt', 'trousers', [garment('outer_layer', 'coat', 'outer'), ...smart]),
    ]),
    true,
  );
});
