import assert from 'node:assert/strict';
import test from 'node:test';

import { aiModelInputFromRequest, picksAreMeaningfullyDifferent } from './ai-model-input.ts';
import { aiRecommendV1RequestSchema } from './ai-v1.ts';

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

// Captured from the Worker's pre-refactor inline assembly in buildMessages. The model
// input is a serialized payload, so field order is part of the behaviour being preserved.
const serializedBeforeRefactor = '{"clothingPreference":"womens","formalityOrder":["formal","smart","casual"],'
  + '"options":[{"optionId":"opt-1","formality":"smart","garments":['
  + '{"slot":"primary_top","garmentTypeId":"blouse"},'
  + '{"slot":"bottom","garmentTypeId":"trousers"},'
  + '{"slot":"footwear","garmentTypeId":"closed_shoes"}]},'
  + '{"optionId":"opt-2","formality":"casual","garments":['
  + '{"slot":"one_piece","garmentTypeId":"dress"},'
  + '{"slot":"outer_layer","garmentTypeId":"coat"},'
  + '{"slot":"footwear","garmentTypeId":"ankle_boots"}]}]}';

test('a request the wire schema accepts projects to the same serialized input', () => {
  const parsed = aiRecommendV1RequestSchema.parse(fixtureRequest);
  assert.equal(JSON.stringify(aiModelInputFromRequest(parsed)), serializedBeforeRefactor);
});

test('the serialized model input is unchanged by the move into contracts', () => {
  assert.equal(
    JSON.stringify(aiModelInputFromRequest(fixtureRequest)),
    serializedBeforeRefactor,
  );
});

test('the projection carries only the approved fields', () => {
  const input = aiModelInputFromRequest(fixtureRequest);
  assert.deepEqual(Object.keys(input), ['clothingPreference', 'formalityOrder', 'options']);
  for (const projected of input.options) {
    assert.deepEqual(Object.keys(projected), ['optionId', 'formality', 'garments']);
    for (const projectedGarment of projected.garments) {
      assert.deepEqual(Object.keys(projectedGarment), ['slot', 'garmentTypeId']);
    }
  }
  for (const withheld of ['requirements', 'catalogVersion', 'dayVariant', 'dressStyle', 'traits', 'layerRole']) {
    assert.equal(JSON.stringify(input).includes(withheld), false);
  }
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
