import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiOptionSchema,
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiReadyV1Path,
  aiReadyV1SuccessSchema,
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorCodes,
  aiV1ErrorSchema,
  aiV1OptionLimit,
  clothingRequirementSchema,
  formalityLevels,
  healthV1Path,
  healthV1SuccessSchema,
  outfitArchetypeIds,
} from './ai-v1.ts';

const reasonCodes = ['temperature_low'];

function garment(slot, garmentTypeId, layerRole = 'standalone') {
  return { slot, layerRole, garmentTypeId };
}

function option(optionId = 'option-1', overrides = {}) {
  return {
    optionId,
    formality: 'casual',
    garments: [
      garment('primary_top', 't_shirt'),
      garment('bottom', 'trousers'),
      garment('footwear', 'sneakers', null),
    ],
    traits: {
      hasMidLayer: false,
      hasOuterLayer: false,
      outerThermalHigh: false,
      outerWaterProtective: false,
      windResistant: false,
      tractionEnhanced: false,
      breathabilityHigh: true,
    },
    ...overrides,
  };
}

function validRequest() {
  return {
    clothingPreference: 'womens',
    catalogVersion: 3,
    dayVariant: 0,
    requirements: [{
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes,
    }],
    options: [option()],
  };
}

function validSuccess() {
  return {
    data: {
      picks: [
        { optionId: 'option-1', archetypeId: 'everyday_easy' },
        { optionId: 'option-2', archetypeId: 'smart_casual' },
        { optionId: 'option-3', archetypeId: 'office_ready' },
      ],
    },
  };
}

test('exports the versioned AI route paths', () => {
  assert.equal(aiRecommendV1Path, '/v1/ai/recommend');
  assert.equal(aiProbeV1Path, '/v1/ai/probe');
  assert.equal(healthV1Path, '/v1/health');
  assert.equal(aiReadyV1Path, '/v1/ai/ready');
});

test('exports the closed formality and archetype vocabularies', () => {
  assert.deepEqual(formalityLevels, ['casual', 'smart', 'formal']);
  assert.deepEqual(outfitArchetypeIds, [
    'everyday_easy',
    'smart_casual',
    'office_ready',
    'weekend_relaxed',
    'layered_warmth',
    'cold_shield',
    'rain_ready',
    'snow_day',
    'wind_guard',
    'light_and_airy',
    'on_the_move',
    'in_between',
  ]);
});

test('probe success schema accepts both statuses and rejects malformed payloads', () => {
  const checkedAt = '2026-08-29T12:34:56.000Z';
  for (const status of ['ok', 'unavailable']) {
    assert.equal(aiProbeV1SuccessSchema.safeParse({
      data: { status, checkedAt },
    }).success, true, status);
  }
  for (const payload of [
    { data: { status: 'unknown', checkedAt } },
    { data: { status: 'ok', checkedAt: 'not-a-datetime' } },
    { data: { status: 'ok' } },
    { data: { status: 'ok', checkedAt, unexpected: true } },
    { data: { status: 'ok', checkedAt }, unexpected: true },
  ]) {
    assert.equal(aiProbeV1SuccessSchema.safeParse(payload).success, false);
  }
});

test('error, health, and readiness schemas keep their existing contracts', () => {
  for (const code of aiV1ErrorCodes) {
    assert.equal(aiV1ErrorSchema.safeParse({ error: { code } }).success, true, code);
  }
  assert.equal(aiV1ErrorSchema.safeParse({ error: { code: 'made_up' } }).success, false);
  assert.equal(healthV1SuccessSchema.safeParse({ data: { status: 'ok' } }).success, true);
  assert.equal(healthV1SuccessSchema.safeParse({ data: { status: 'ready' } }).success, false);
  for (const status of ['ready', 'not_configured']) {
    assert.equal(aiReadyV1SuccessSchema.safeParse({ data: { status } }).success, true);
  }
});

test('accepts a valid option request and exactly three distinct picks', () => {
  assert.equal(aiRecommendV1RequestSchema.safeParse(validRequest()).success, true);
  assert.equal(aiRecommendV1SuccessSchema.safeParse(validSuccess()).success, true);
});

test('strict request, option, garment, traits, pick, and response objects reject extra keys', () => {
  const requestWithExtra = { ...validRequest(), unexpected: true };
  assert.equal(aiRecommendV1RequestSchema.safeParse(requestWithExtra).success, false);

  const optionWithExtra = option('extra-option', { unexpected: true });
  assert.equal(aiOptionSchema.safeParse(optionWithExtra).success, false);

  const optionWithExtraGarment = option('extra-garment');
  optionWithExtraGarment.garments[0].unexpected = true;
  assert.equal(aiOptionSchema.safeParse(optionWithExtraGarment).success, false);

  const optionWithExtraTrait = option('extra-trait');
  optionWithExtraTrait.traits.unexpected = true;
  assert.equal(aiOptionSchema.safeParse(optionWithExtraTrait).success, false);

  const successWithExtraPick = validSuccess();
  successWithExtraPick.data.picks[0].unexpected = true;
  assert.equal(aiRecommendV1SuccessSchema.safeParse(successWithExtraPick).success, false);

  assert.equal(aiRecommendV1SuccessSchema.safeParse({
    ...validSuccess(), unexpected: true,
  }).success, false);
});

test('rejects every privacy-forbidden request or option field', () => {
  for (const field of ['localProfileId', 'deviceId', 'latitude', 'longitude']) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), [field]: 'private',
    }).success, false, field);
  }
  for (const field of [
    'reasonCodes',
    'photoRelativePath',
    'photoUri',
    'name',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ]) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), options: [option('private-option', { [field]: 'private' })],
    }).success, false, field);
  }
});

test('option ids enforce the transport format and are unique in a request', () => {
  for (const optionId of ['free form', 'bad.key!', 'x'.repeat(33)]) {
    assert.equal(aiOptionSchema.safeParse(option(optionId)).success, false, optionId);
  }
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(),
    options: [option('duplicate'), option('duplicate')],
  }).success, false);
});

test('option bounds accept 24 and reject zero or 25', () => {
  const options = Array.from(
    { length: aiV1OptionLimit + 1 },
    (_, index) => option(`option-${index}`),
  );
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), options: [],
  }).success, false);
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), options: options.slice(0, aiV1OptionLimit),
  }).success, true);
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), options,
  }).success, false);
});

test('request validates catalog version and seven-slot day variant bounds', () => {
  for (const catalogVersion of [0, 1.5]) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), catalogVersion,
    }).success, false);
  }
  for (const dayVariant of [-1, 7, 1.5]) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), dayVariant,
    }).success, false);
  }
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), dayVariant: 6,
  }).success, true);
});

test('options reject duplicate slots and require exactly one footwear slot', () => {
  assert.equal(aiOptionSchema.safeParse(option('duplicate-slot', {
    garments: [
      garment('primary_top', 't_shirt'),
      garment('primary_top', 'shirt'),
      garment('bottom', 'trousers'),
      garment('footwear', 'sneakers', null),
    ],
  })).success, false);
  assert.equal(aiOptionSchema.safeParse(option('no-footwear', {
    garments: [
      garment('primary_top', 't_shirt'),
      garment('bottom', 'trousers'),
    ],
  })).success, false);
  assert.equal(aiOptionSchema.safeParse(option('two-footwear', {
    garments: [
      garment('primary_top', 't_shirt'),
      garment('bottom', 'trousers'),
      garment('footwear', 'sneakers', null),
      garment('footwear', 'closed_shoes', null),
    ],
  })).success, false);
});

test('options require one exclusive body core and accept one-piece with footwear', () => {
  assert.equal(aiOptionSchema.safeParse(option('mixed-core', {
    garments: [
      garment('primary_top', 't_shirt'),
      garment('bottom', 'trousers'),
      garment('one_piece', 'dress'),
      garment('footwear', 'sneakers', null),
    ],
  })).success, false);
  assert.equal(aiOptionSchema.safeParse(option('one-piece', {
    garments: [
      garment('one_piece', 'dress'),
      garment('footwear', 'closed_shoes', null),
    ],
  })).success, true);
  assert.equal(aiOptionSchema.safeParse(option('missing-core', {
    garments: [
      garment('mid_layer', 'cardigan', 'mid'),
      garment('footwear', 'sneakers', null),
    ],
  })).success, false);
});

test('options enforce two-to-five garments and at most one mid and outer layer', () => {
  assert.equal(aiOptionSchema.safeParse(option('too-many', {
    garments: [
      garment('primary_top', 't_shirt'),
      garment('bottom', 'trousers'),
      garment('mid_layer', 'cardigan', 'mid'),
      garment('outer_layer', 'coat', 'outer'),
      garment('footwear', 'sneakers', null),
      garment('footwear', 'closed_shoes', null),
    ],
  })).success, false);
  assert.equal(aiOptionSchema.safeParse(option('two-mid', {
    garments: [
      garment('one_piece', 'dress'),
      garment('mid_layer', 'cardigan', 'mid'),
      garment('mid_layer', 'sweater', 'mid'),
      garment('footwear', 'sneakers', null),
    ],
  })).success, false);
  assert.equal(aiOptionSchema.safeParse(option('two-outer', {
    garments: [
      garment('one_piece', 'dress'),
      garment('outer_layer', 'coat', 'outer'),
      garment('outer_layer', 'rain_jacket', 'outer'),
      garment('footwear', 'sneakers', null),
    ],
  })).success, false);
});

test('success requires three picks with distinct option and archetype ids', () => {
  const success = validSuccess();
  assert.equal(aiRecommendV1SuccessSchema.safeParse({
    data: { picks: success.data.picks.slice(0, 2) },
  }).success, false);
  assert.equal(aiRecommendV1SuccessSchema.safeParse({
    data: { picks: [...success.data.picks, {
      optionId: 'option-4', archetypeId: 'weekend_relaxed',
    }] },
  }).success, false);

  const duplicateOption = validSuccess();
  duplicateOption.data.picks[1].optionId = duplicateOption.data.picks[0].optionId;
  assert.equal(aiRecommendV1SuccessSchema.safeParse(duplicateOption).success, false);

  const duplicateArchetype = validSuccess();
  duplicateArchetype.data.picks[1].archetypeId = duplicateArchetype.data.picks[0].archetypeId;
  assert.equal(aiRecommendV1SuccessSchema.safeParse(duplicateArchetype).success, false);
});

test('accepts every requirement member and rejects bad kinds and member minimums', () => {
  const base = { priority: 'mandatory', reasonCodes };
  const requirements = [
    { ...base, kind: 'thermal', minimum: 'moderate' },
    { ...base, kind: 'breathability', minimum: 'high' },
    { ...base, kind: 'arm_coverage', minimum: 'full' },
    { ...base, kind: 'leg_coverage', minimum: 'partial' },
    { ...base, kind: 'water_protection', minimum: 'waterproof', target: 'body' },
    { ...base, kind: 'wind_protection', minimum: 'wind_resistant' },
    { ...base, kind: 'traction', minimum: 'enhanced' },
  ];
  for (const requirement of requirements) {
    assert.equal(clothingRequirementSchema.safeParse(requirement).success, true);
  }
  assert.equal(clothingRequirementSchema.safeParse({
    ...base, kind: 'unknown', minimum: 'high',
  }).success, false);
  assert.equal(clothingRequirementSchema.safeParse({
    ...base, kind: 'traction', minimum: 'everyday',
  }).success, false);
});
