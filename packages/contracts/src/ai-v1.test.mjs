import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiReadyV1Path,
  aiReadyV1SuccessSchema,
  aiOutfitSchema,
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1CandidateLimit,
  aiV1ErrorCodes,
  aiV1ErrorSchema,
  clothingRequirementReasonCodes,
  clothingRequirementSchema,
  healthV1Path,
  healthV1SuccessSchema,
} from './ai-v1.ts';

const reasonCodes = ['temperature_low'];

function candidate(candidateKey = 'catalog:top', overrides = {}) {
  return {
    candidateKey,
    source: 'catalog',
    garmentTypeId: 't_shirt',
    colorFamily: 'blue',
    properties: {
      category: 'top',
      bodyRegion: 'upper_body',
      supportedLayerRoles: ['standalone'],
      thermalLevel: 'light',
      waterProtection: 'none',
      windProtection: 'none',
      breathability: 'high',
      armCoverage: 'partial',
      legCoverage: null,
      tractionSuitability: null,
    },
    ...overrides,
  };
}

function validRequest() {
  return {
    clothingPreference: 'womens',
    requirements: [{
      kind: 'thermal',
      minimum: 'light',
      priority: 'mandatory',
      reasonCodes,
    }],
    candidates: [candidate()],
  };
}

function garment(slot, candidateKey, layerRole = 'standalone') {
  return { slot, layerRole, candidateKey };
}

function separatesOutfit(suffix = '1') {
  return [
    garment('primary_top', `top:${suffix}`),
    garment('bottom', `bottom:${suffix}`),
    garment('footwear', `shoe:${suffix}`, null),
  ];
}

function validSuccess() {
  return { data: { outfits: ['1', '2', '3'].map(separatesOutfit) } };
}

test('exports the versioned AI route paths', () => {
  assert.equal(aiRecommendV1Path, '/v1/ai/recommend');
  assert.equal(aiProbeV1Path, '/v1/ai/probe');
  assert.equal(healthV1Path, '/v1/health');
  assert.equal(aiReadyV1Path, '/v1/ai/ready');
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

test('AI error schema accepts rate limiting', () => {
  assert.equal(aiV1ErrorSchema.safeParse({
    error: { code: 'rate_limited' },
  }).success, true);
});

test('error schema accepts every declared code and rejects unknown codes', () => {
  for (const code of aiV1ErrorCodes) {
    assert.equal(aiV1ErrorSchema.safeParse({ error: { code } }).success, true, code);
  }
  assert.equal(aiV1ErrorSchema.safeParse({
    error: { code: 'made_up' },
  }).success, false);
});

test('health and readiness schemas accept valid payloads and reject malformed ones', () => {
  assert.equal(healthV1SuccessSchema.safeParse({ data: { status: 'ok' } }).success, true);
  assert.equal(healthV1SuccessSchema.safeParse({ data: { status: 'ready' } }).success, false);
  for (const status of ['ready', 'not_configured']) {
    assert.equal(aiReadyV1SuccessSchema.safeParse({ data: { status } }).success, true);
  }
  assert.equal(aiReadyV1SuccessSchema.safeParse({ data: { status: 'ok' } }).success, false);
});

test('accepts a valid request and an exactly three-outfit success', () => {
  assert.equal(aiRecommendV1RequestSchema.safeParse(validRequest()).success, true);
  assert.equal(aiRecommendV1SuccessSchema.safeParse(validSuccess()).success, true);
});

test('accepts footwear with no layer roles and rejects more than four roles', () => {
  const sneakers = candidate('catalog:sneakers', {
    garmentTypeId: 'sneakers',
    colorFamily: 'white',
    properties: {
      category: 'footwear',
      bodyRegion: 'feet',
      supportedLayerRoles: [],
      thermalLevel: 'light',
      waterProtection: 'none',
      windProtection: null,
      breathability: 'moderate',
      armCoverage: null,
      legCoverage: null,
      tractionSuitability: 'everyday',
    },
  });
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: [sneakers],
  }).success, true);

  const tooManyRoles = candidate('catalog:too-many-roles', {
    properties: {
      ...candidate().properties,
      supportedLayerRoles: ['base', 'mid', 'outer', 'standalone', 'base'],
    },
  });
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: [tooManyRoles],
  }).success, false);
});

test('strict schemas reject unknown request, candidate, properties, and outfit-garment keys', () => {
  const requestWithExtra = { ...validRequest(), unexpected: true };
  assert.equal(aiRecommendV1RequestSchema.safeParse(requestWithExtra).success, false);

  const candidateWithExtra = candidate('catalog:extra', { unexpected: true });
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: [candidateWithExtra],
  }).success, false);

  const candidateWithExtraProperty = candidate('catalog:properties', {
    properties: { ...candidate().properties, unexpected: true },
  });
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: [candidateWithExtraProperty],
  }).success, false);

  const success = validSuccess();
  success.data.outfits[0][0].unexpected = true;
  assert.equal(aiRecommendV1SuccessSchema.safeParse(success).success, false);
});

test('rejects every privacy-forbidden request or candidate field', () => {
  for (const field of ['localProfileId', 'deviceId', 'latitude', 'longitude']) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), [field]: 'private',
    }).success, false, field);
  }

  for (const field of [
    'photoRelativePath',
    'photoUri',
    'name',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ]) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), candidates: [candidate('catalog:private', { [field]: 'private' })],
    }).success, false, field);
  }
});

test('candidate keys reject free-form text, punctuation, and more than 64 characters', () => {
  for (const candidateKey of ['free form', 'bad.key!', 'x'.repeat(65)]) {
    assert.equal(aiRecommendV1RequestSchema.safeParse({
      ...validRequest(), candidates: [candidate(candidateKey)],
    }).success, false);
  }
});

test('candidate bounds accept the measured limit and reject zero or one over it', () => {
  const candidates = Array.from(
    { length: aiV1CandidateLimit + 1 },
    (_, index) => candidate(`catalog:${index}`),
  );
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: [],
  }).success, false);
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates: candidates.slice(0, aiV1CandidateLimit),
  }).success, true);
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(), candidates,
  }).success, false);
});

test('rejects duplicate candidate keys in a request', () => {
  assert.equal(aiRecommendV1RequestSchema.safeParse({
    ...validRequest(),
    candidates: [candidate('duplicate'), candidate('duplicate')],
  }).success, false);
});

test('measured worst-case request stays within the 64 KiB serialized budget', () => {
  const worstCaseCandidate = (index) => ({
    candidateKey: `${String(index).padStart(3, '0')}:${'x'.repeat(60)}`,
    source: 'wardrobe',
    garmentTypeId: 'long_sleeve_t_shirt',
    colorFamily: 'multicolor',
    properties: {
      category: 'one_piece',
      bodyRegion: 'upper_body',
      supportedLayerRoles: ['base', 'mid', 'outer', 'standalone'],
      thermalLevel: 'moderate',
      waterProtection: 'water_resistant',
      windProtection: 'wind_resistant',
      breathability: 'moderate',
      armCoverage: 'partial',
      legCoverage: 'partial',
      tractionSuitability: 'enhanced',
    },
  });
  const worstCaseRequirement = {
    kind: 'water_protection',
    minimum: 'water_resistant',
    target: 'body',
    priority: 'mandatory',
    reasonCodes: [...clothingRequirementReasonCodes],
  };
  const worstCase = {
    clothingPreference: 'womens',
    requirements: Array.from({ length: 8 }, () => worstCaseRequirement),
    candidates: Array.from({ length: aiV1CandidateLimit }, (_, index) =>
      worstCaseCandidate(index)),
  };

  assert.equal(aiRecommendV1RequestSchema.safeParse(worstCase).success, true);
  assert.equal(Buffer.byteLength(JSON.stringify(worstCase)), 65_498);
  assert.ok(Buffer.byteLength(JSON.stringify(worstCase)) <= 65_536);
});

test('success requires exactly three outfits', () => {
  const success = validSuccess();
  assert.equal(aiRecommendV1SuccessSchema.safeParse({
    data: { outfits: success.data.outfits.slice(0, 2) },
  }).success, false);
  assert.equal(aiRecommendV1SuccessSchema.safeParse(success).success, true);
  assert.equal(aiRecommendV1SuccessSchema.safeParse({
    data: { outfits: [...success.data.outfits, separatesOutfit('4')] },
  }).success, false);
});

test('success rejects an invalid candidate key', () => {
  const success = validSuccess();
  success.data.outfits[0][0].candidateKey = 'free form';
  assert.equal(aiRecommendV1SuccessSchema.safeParse(success).success, false);
});

test('outfits reject duplicate candidate keys and duplicate slots', () => {
  assert.equal(aiOutfitSchema.safeParse([
    garment('primary_top', 'same'),
    garment('bottom', 'same'),
    garment('footwear', 'shoe', null),
  ]).success, false);
  assert.equal(aiOutfitSchema.safeParse([
    garment('primary_top', 'top:1'),
    garment('primary_top', 'top:2'),
    garment('bottom', 'bottom'),
    garment('footwear', 'shoe', null),
  ]).success, false);
});

test('outfits require exactly one footwear slot', () => {
  assert.equal(aiOutfitSchema.safeParse([
    garment('primary_top', 'top'),
    garment('bottom', 'bottom'),
  ]).success, false);
  assert.equal(aiOutfitSchema.safeParse([
    garment('primary_top', 'top'),
    garment('bottom', 'bottom'),
    garment('footwear', 'shoe:1', null),
    garment('footwear', 'shoe:2', null),
  ]).success, false);
});

test('outfits require one exclusive body core and accept one-piece with footwear', () => {
  assert.equal(aiOutfitSchema.safeParse([
    garment('primary_top', 'top'),
    garment('bottom', 'bottom'),
    garment('one_piece', 'dress'),
    garment('footwear', 'shoe', null),
  ]).success, false);
  assert.equal(aiOutfitSchema.safeParse([
    garment('one_piece', 'dress'),
    garment('footwear', 'shoe', null),
  ]).success, true);
  assert.equal(aiOutfitSchema.safeParse([
    garment('mid_layer', 'mid', 'mid'),
    garment('footwear', 'shoe', null),
  ]).success, false);
});

test('outfits reject more than one mid or outer layer', () => {
  assert.equal(aiOutfitSchema.safeParse([
    garment('one_piece', 'dress'),
    garment('mid_layer', 'mid:1', 'mid'),
    garment('mid_layer', 'mid:2', 'mid'),
    garment('footwear', 'shoe', null),
  ]).success, false);
  assert.equal(aiOutfitSchema.safeParse([
    garment('one_piece', 'dress'),
    garment('outer_layer', 'outer:1', 'outer'),
    garment('outer_layer', 'outer:2', 'outer'),
    garment('footwear', 'shoe', null),
  ]).success, false);
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
