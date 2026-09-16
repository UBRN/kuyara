import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiModelInputFromRequest,
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
// to be told which archetypes an option can carry.
const serializedInput = '{"clothingPreference":"womens","formalityOrder":["formal","smart","casual"],'
  + '"options":[{"optionId":"opt-1","formality":"smart","garments":['
  + '{"slot":"primary_top","garmentTypeId":"blouse"},'
  + '{"slot":"bottom","garmentTypeId":"trousers"},'
  + '{"slot":"footwear","garmentTypeId":"closed_shoes"}],'
  + '"eligibleArchetypeIds":["smart_casual","light_and_airy"]},'
  + '{"optionId":"opt-2","formality":"casual","garments":['
  + '{"slot":"one_piece","garmentTypeId":"dress"},'
  + '{"slot":"outer_layer","garmentTypeId":"coat"},'
  + '{"slot":"footwear","garmentTypeId":"ankle_boots"}],'
  + '"eligibleArchetypeIds":["weekend_relaxed","light_and_airy"]}]}';

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
  parsed.options.forEach((option, index) => {
    assert.deepEqual(
      input.options[index].eligibleArchetypeIds,
      outfitArchetypeIds.filter((id) =>
        id !== 'everyday_easy' && meetsArchetypePrecondition(id, option)),
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
    for (const archetypeId of input.options[index].eligibleArchetypeIds) {
      assert.equal(meetsArchetypePrecondition(archetypeId, option), true);
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
