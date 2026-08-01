import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  projectWardrobeEffectiveGarment,
} from './garment-eligibility.ts';
import {
  composeOutfit,
  outfitCompositionFailureCodes,
  outfitCompositionReasonCodes,
} from './outfit-composition.ts';

function clothingRequirements(...requirements) {
  return Object.freeze({
    requirements: Object.freeze(requirements),
    reasonCodes: Object.freeze([
      ...new Set(requirements.flatMap(({ reasonCodes }) => reasonCodes)),
    ]),
  });
}

function requirement(kind, minimum, overrides = {}) {
  return Object.freeze({
    kind,
    minimum,
    priority: 'mandatory',
    reasonCodes: Object.freeze(['temperature_low']),
    ...overrides,
  });
}

function catalogCandidate(requirements, typeId) {
  return evaluateGarmentEligibility(
    requirements,
    projectCatalogEffectiveGarment(typeId, 'womens'),
  );
}

function wardrobeCandidate(requirements, id, garmentTypeId, category, overrides = {}) {
  const item = Object.freeze({
    id,
    localProfileId: 'profile-one',
    name: null,
    category,
    garmentTypeId,
    color: null,
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  });

  return evaluateGarmentEligibility(
    requirements,
    projectWardrobeEffectiveGarment(item),
  );
}

function evaluation(result, kind, target) {
  return result.outfit.requirementEvaluations.find(
    ({ requirement: candidate }) =>
      candidate.kind === kind &&
      (target === undefined || candidate.target === target),
  );
}

test('composes the minimum separates outfit with runtime roles and immutable evidence', () => {
  const requirements = clothingRequirements();
  const candidates = [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'sandals'),
  ];
  const before = structuredClone(candidates);
  const result = composeOutfit(requirements, candidates);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.body.kind, 'separates');
  assert.equal(result.outfit.body.primaryTop.layerRole, 'standalone');
  assert.equal(result.outfit.body.bottom.layerRole, 'standalone');
  assert.equal(result.outfit.footwear.layerRole, null);
  assert.equal(result.outfit.midLayer, null);
  assert.equal(result.outfit.outerLayer, null);
  assert.deepEqual(result.outfit.candidateKeys, [
    'catalog:sandals',
    'catalog:shorts',
    'catalog:t_shirt',
  ]);
  assert.equal(result.outfit.score, 50);
  assert.deepEqual(candidates, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.outfit), true);
  assert.equal(Object.isFrozen(result.outfit.body.primaryTop.garment), true);
  assert.equal(Object.isFrozen(result.outfit.requirementEvaluations), true);
});

test('one-piece replaces separates and may add one mid and one outer layer', () => {
  const requirements = clothingRequirements(
    requirement('thermal', 'high'),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.body.kind, 'one_piece');
  assert.equal(result.outfit.body.onePiece.layerRole, 'standalone');
  assert.equal(result.outfit.midLayer.layerRole, 'mid');
  assert.equal(result.outfit.outerLayer.layerRole, 'outer');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 4);
  assert.equal(evaluation(result, 'thermal').status, 'met');
  assert.equal(evaluation(result, 'water_protection', 'body').status, 'met');
  assert.equal(new Set(result.outfit.candidateKeys).size,
    result.outfit.candidateKeys.length);
});

test('collectively aggregates thermal and coverage while retaining footwear evidence separately', () => {
  const requirements = clothingRequirements(
    requirement('thermal', 'high'),
    requirement('arm_coverage', 'full'),
    requirement('leg_coverage', 'full'),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'weather_boots'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 3);
  assert.equal(result.outfit.aggregates.thermal.footwear, 'high');
  assert.equal(result.outfit.aggregates.armCoverage, 'full');
  assert.equal(result.outfit.aggregates.legCoverage, 'full');
  assert.equal(evaluation(result, 'thermal').contribution, 100);
  assert.equal(evaluation(result, 'arm_coverage').contribution, 100);
  assert.equal(evaluation(result, 'leg_coverage').contribution, 100);
});

test('resolves mandatory waterproofing versus breathability as an explicit penalized trade-off', () => {
  const requirements = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const candidates = [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ];
  const first = composeOutfit(requirements, candidates);
  const repeated = composeOutfit(requirements, [...candidates].reverse());

  assert.equal(first.status, 'composed');
  assert.equal(first.outfit.outerLayer.garment.garmentTypeId, 'rain_jacket');
  assert.equal(first.outfit.aggregates.breathability.body, 'moderate');
  assert.equal(first.outfit.aggregates.breathability.coreAndMid, 'high');
  assert.equal(evaluation(first, 'breathability').status, 'tradeoff');
  assert.equal(evaluation(first, 'breathability').observedContribution, 67);
  assert.equal(evaluation(first, 'breathability').contribution, 100);
  assert.deepEqual(evaluation(first, 'breathability').tradeoffCandidateKeys, [
    'catalog:rain_jacket',
  ]);
  assert.equal(evaluation(first, 'water_protection', 'body').status, 'met');
  assert.equal(first.outfit.penaltyBreakdown.breathabilityProtectionTradeoff, 10);
  assert.equal(first.outfit.penaltyPoints, 10);
  assert.deepEqual(first.outfit.reasonCodes, [
    'breathability_protection_tradeoff',
  ]);
  assert.deepEqual(first, repeated);
});

test('mandatory wind protection uses the same explicit breathability trade-off without weakening wind', () => {
  const requirements = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('wind_protection', 'wind_resistant', {
      reasonCodes: Object.freeze(['wind_strong']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(evaluation(result, 'breathability').status, 'tradeoff');
  assert.equal(evaluation(result, 'wind_protection').status, 'met');
  assert.equal(result.outfit.outerLayer.garment.garmentTypeId, 'light_jacket');
  assert.equal(
    result.outfit.reasonCodes.includes('breathability_protection_tradeoff'),
    true,
  );
});

test('a non-breathable body core still fails mandatory breathability', () => {
  const requirements = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ]);

  assert.equal(result.status, 'failure');
  assert.equal(result.reasonCodes.includes('mandatory_breathability_unmet'), true);
  const breathability = result.bestObservedEvidence.find(
    ({ requirement: candidate }) => candidate.kind === 'breathability',
  );
  assert.equal(breathability.bestContribution, 67);
  assert.deepEqual(breathability.reasonCodes, ['temperature_high']);
});

test('without mandatory water or wind, normal bottleneck breathability is restored', () => {
  const requirements = clothingRequirements(
    requirement('thermal', 'light'),
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ]);

  assert.equal(result.status, 'failure');
  assert.deepEqual(result.reasonCodes, [
    'mandatory_requirements_conflict',
    'no_valid_composition',
  ]);
  assert.equal(
    result.bestObservedEvidence.every(({ bestContribution }) =>
      bestContribution === 100),
    true,
  );
});

test('authoritative slots reject a top outer for body water but accept footwear protection and traction', () => {
  const bodyRequirements = clothingRequirements(
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const bodyResult = composeOutfit(bodyRequirements, [
    catalogCandidate(bodyRequirements, 't_shirt'),
    catalogCandidate(bodyRequirements, 'shorts'),
    catalogCandidate(bodyRequirements, 'hoodie'),
    catalogCandidate(bodyRequirements, 'sandals'),
  ]);
  assert.equal(bodyResult.status, 'failure');
  assert.equal(bodyResult.reasonCodes.includes('mandatory_body_water_unmet'), true);
  assert.deepEqual(bodyResult.missingSlots, ['outer_layer']);

  const feetRequirements = clothingRequirements(
    requirement('water_protection', 'waterproof', {
      target: 'feet',
      reasonCodes: Object.freeze(['condition_snow']),
    }),
    requirement('traction', 'enhanced', {
      reasonCodes: Object.freeze(['condition_snow']),
    }),
  );
  const feetResult = composeOutfit(feetRequirements, [
    catalogCandidate(feetRequirements, 't_shirt'),
    catalogCandidate(feetRequirements, 'trousers'),
    catalogCandidate(feetRequirements, 'weather_boots'),
  ]);
  assert.equal(feetResult.status, 'composed');
  assert.equal(evaluation(feetResult, 'water_protection', 'feet').status, 'met');
  assert.equal(evaluation(feetResult, 'traction').status, 'met');
});

test('optional requirements never block composition and one candidate never fills multiple supported roles', () => {
  const requirements = clothingRequirements(
    requirement('thermal', 'high', {
      priority: 'optional',
    }),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      priority: 'optional',
      reasonCodes: Object.freeze(['precipitation_possible']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'overshirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'sandals'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.body.kind, 'separates');
  assert.equal(
    result.outfit.body.primaryTop.garment.garmentTypeId,
    'overshirt',
  );
  assert.equal(result.outfit.midLayer, null);
  assert.equal(result.outfit.outerLayer, null);
  assert.equal(evaluation(result, 'thermal').status, 'shortfall');
  assert.equal(evaluation(result, 'water_protection', 'body').status, 'missing');
  assert.equal(new Set(result.outfit.candidateKeys).size,
    result.outfit.candidateKeys.length);
});

test('fails structurally for missing slots and duplicate input keys', () => {
  const requirements = clothingRequirements();
  const top = catalogCandidate(requirements, 't_shirt');
  const missing = composeOutfit(requirements, [top]);
  assert.equal(missing.status, 'failure');
  assert.deepEqual(missing.reasonCodes, [
    'no_complete_body_core',
    'no_eligible_footwear',
    'no_valid_composition',
  ]);
  assert.deepEqual(missing.missingSlots, ['bottom', 'footwear']);

  const duplicate = composeOutfit(requirements, [top, top]);
  assert.equal(duplicate.status, 'failure');
  assert.deepEqual(duplicate.reasonCodes, [
    'conflicting_candidate_key',
    'no_valid_composition',
  ]);
});

test('catalog and owned candidates remain ownership-neutral and deterministically ordered', () => {
  const requirements = clothingRequirements(requirement('thermal', 'light'));
  const catalogWarm = catalogCandidate(requirements, 'long_sleeve_t_shirt');
  const ownedCool = wardrobeCandidate(
    requirements,
    'owned-cool',
    't_shirt',
    'top',
  );
  const shorts = catalogCandidate(requirements, 'shorts');
  const sandals = catalogCandidate(requirements, 'sandals');
  const catalogWins = composeOutfit(requirements, [
    ownedCool,
    sandals,
    catalogWarm,
    shorts,
  ]);
  assert.equal(catalogWins.status, 'composed');
  assert.equal(
    catalogWins.outfit.body.primaryTop.garment.candidateKey,
    'catalog:long_sleeve_t_shirt',
  );

  const ownedWarm = wardrobeCandidate(
    requirements,
    'owned-warm',
    'long_sleeve_t_shirt',
    'top',
  );
  const catalogCool = catalogCandidate(requirements, 't_shirt');
  const ownedWins = composeOutfit(requirements, [
    catalogCool,
    sandals,
    ownedWarm,
    shorts,
  ]);
  assert.equal(ownedWins.status, 'composed');
  assert.equal(
    ownedWins.outfit.body.primaryTop.garment.candidateKey,
    'wardrobe:owned-warm',
  );
});

test('outfit over-insulation penalty is bounded and does not count footwear warmth', () => {
  const requirements = clothingRequirements();
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'trousers'),
    catalogCandidate(requirements, 'weather_boots'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 3);
  assert.equal(result.outfit.aggregates.thermal.footwear, 'high');
  assert.equal(result.outfit.penaltyBreakdown.thermalOverProtection, 20);
  assert.equal(result.outfit.penaltyPoints, 20);
  assert.equal(result.outfit.score, 30);
  assert.deepEqual(result.outfit.reasonCodes, ['thermal_over_protection']);
  assert.equal(new Set(outfitCompositionReasonCodes).size,
    outfitCompositionReasonCodes.length);
  assert.equal(new Set(outfitCompositionFailureCodes).size,
    outfitCompositionFailureCodes.length);
});
