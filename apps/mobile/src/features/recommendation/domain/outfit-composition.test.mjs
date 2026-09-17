import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  projectWardrobeEffectiveGarment,
} from './garment-eligibility.ts';
import { listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import {
  collectValidOutfits,
  composeOutfitOptions,
  outfitCompositionFailureCodes,
  outfitCompositionReasonCodes,
} from './outfit-composition.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';

// Most cases below are about the best arrangement, which is the first one collected.
function composeOutfit(requirements, candidates) {
  const result = collectValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({ status: 'composed', outfit: result.outfits[0] });
}

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

function catalogCandidate(requirements, typeId, preference = 'womens') {
  return evaluateGarmentEligibility(
    requirements,
    projectCatalogEffectiveGarment(typeId, preference),
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

test('rejects an outfit whose slot garments span casual through formal', () => {
  const requirements = clothingRequirements();
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'trousers'),
    catalogCandidate(requirements, 'sneakers'),
  ]);

  assert.equal(result.status, 'failure');
  assert.deepEqual(result.reasonCodes, ['no_valid_composition']);
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
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 3);
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
    catalogCandidate(requirements, 'light_jacket'),
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
    catalogCandidate(feetRequirements, 'shorts'),
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
    catalogCandidate(requirements, 'jeans'),
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

test('outfit over-insulation starts above body strength one', () => {
  const requirements = clothingRequirements();
  const cases = [
    ['long_sleeve_t_shirt', 1, 0, 50],
    ['sweater', 2, 10, 40],
  ];

  for (const [top, bodyStrength, penaltyPoints, score] of cases) {
    const result = composeOutfit(requirements, [
      catalogCandidate(requirements, top),
      catalogCandidate(requirements, 'shorts'),
      catalogCandidate(requirements, 'sandals'),
    ]);

    assert.equal(result.status, 'composed');
    assert.equal(result.outfit.aggregates.thermal.bodyStrength, bodyStrength);
    assert.equal(result.outfit.penaltyBreakdown.thermalOverProtection,
      penaltyPoints);
    assert.equal(result.outfit.penaltyPoints, penaltyPoints);
    assert.equal(result.outfit.score, score);
  }
});

test('aggregate outfit penalties are capped at thirty points', () => {
  const requirements = clothingRequirements(
    requirement('breathability', 'high', {
      priority: 'optional',
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('wind_protection', 'wind_resistant', {
      reasonCodes: Object.freeze(['wind_strong']),
    }),
  );
  const result = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweatshirt'),
    catalogCandidate(requirements, 'jeans'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'weather_boots'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 3);
  assert.equal(result.outfit.penaltyBreakdown.thermalOverProtection, 20);
  assert.equal(result.outfit.penaltyBreakdown.unnecessaryWaterProtection, 20);
  assert.equal(result.outfit.penaltyBreakdown.breathabilityProtectionTradeoff, 0);
  assert.equal(result.outfit.penaltyPoints, 30);
});

test('returns three pairwise meaningfully different outfits with the best outfit first', () => {
  const requirements = clothingRequirements();
  const candidates = [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'cardigan'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ];
  const result = composeOutfitOptions(requirements, candidates, 0);
  const best = composeOutfit(requirements, candidates);

  assert.equal(result.status, 'composed');
  assert.equal(best.status, 'composed');
  assert.equal(result.outfits.length, 3);
  assert.deepEqual(result.outfits[0], best.outfit);
  assert.equal(Object.isFrozen(result.outfits), true);

  for (let leftIndex = 0; leftIndex < result.outfits.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < result.outfits.length;
      rightIndex += 1
    ) {
      const left = result.outfits[leftIndex];
      const right = result.outfits[rightIndex];
      const leftCore = left.body.kind === 'separates'
        ? [
            left.body.primaryTop.garment.candidateKey,
            left.body.bottom.garment.candidateKey,
          ].sort()
        : [left.body.onePiece.garment.candidateKey];
      const rightCore = right.body.kind === 'separates'
        ? [
            right.body.primaryTop.garment.candidateKey,
            right.body.bottom.garment.candidateKey,
          ].sort()
        : [right.body.onePiece.garment.candidateKey];
      const differentBodyCore = left.body.kind !== right.body.kind ||
        leftCore.length !== rightCore.length ||
        leftCore.some((key, index) => key !== rightCore[index]);
      const leftOnly = left.candidateKeys.filter(
        (key) => !right.candidateKeys.includes(key),
      );
      const rightOnly = right.candidateKeys.filter(
        (key) => !left.candidateKeys.includes(key),
      );

      assert.equal(
        differentBodyCore || leftOnly.length >= 2 || rightOnly.length >= 2,
        true,
      );
    }
  }
});

test('catalog keeps at least three AI options across cold-wet and hot buckets for both preferences', () => {
  const buckets = [
    ['cold-wet', clothingRequirements(
      requirement('thermal', 'high'),
      requirement('water_protection', 'waterproof', {
        target: 'body',
        reasonCodes: Object.freeze(['condition_rain']),
      }),
    )],
    ['hot', clothingRequirements(
      requirement('breathability', 'high', {
        reasonCodes: Object.freeze(['temperature_high']),
      }),
    )],
  ];

  for (const preference of ['womens', 'mens']) {
    for (const [bucket, requirements] of buckets) {
      const result = composeOutfitOptions(
        requirements,
        listGarmentTypesForPreference(preference).map(({ typeId }) =>
          catalogCandidate(requirements, typeId, preference)),
        0,
      );
      const optionCount = result.status === 'composed' ? result.outfits.length : 0;

      assert.equal(
        optionCount >= 3,
        true,
        `${preference} ${bucket} returned ${optionCount} options`,
      );
    }
  }
});

// This pins an explicit two-top candidate list to check that footwear-only swaps
// are rejected as near-duplicates, so two is correct here. The full catalog now
// reaches three high-breathability body cores at catalog version 3, because
// `sleeveless_top` closed the gap this case was originally written against.
test('returns two high-heat outfits instead of footwear-only near-duplicates', () => {
  const requirements = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
  );
  const tops = [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'long_sleeve_t_shirt'),
  ];
  const bottom = catalogCandidate(requirements, 'shorts');
  const footwear = [
    catalogCandidate(requirements, 'sneakers'),
    catalogCandidate(requirements, 'ankle_boots'),
    catalogCandidate(requirements, 'weather_boots'),
    catalogCandidate(requirements, 'sandals'),
  ];
  const validCompositions = tops.flatMap((top) =>
    footwear.map((shoes) =>
      composeOutfit(requirements, [top, bottom, shoes]),
    ),
  );
  const result = composeOutfitOptions(requirements, [...tops, bottom, ...footwear], 0);

  assert.equal(validCompositions.length, 8);
  assert.equal(
    validCompositions.every(({ status }) => status === 'composed'),
    true,
  );
  assert.equal(result.status, 'composed');
  assert.equal(result.outfits.length, 2);
  assert.equal(
    result.outfits.every(({ body }) => body.kind === 'separates'),
    true,
  );
  assert.deepEqual(
    result.outfits
      .map(({ body }) => body.primaryTop.garment.candidateKey)
      .sort(),
    ['catalog:long_sleeve_t_shirt', 'catalog:t_shirt'],
  );
});

test('returns exactly two outfits when only two meaningful options exist', () => {
  const requirements = clothingRequirements();
  const result = composeOutfitOptions(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'jeans'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ], 0);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfits.length, 2);
});

test('returns exactly one outfit when only one option exists', () => {
  const requirements = clothingRequirements();
  const result = composeOutfitOptions(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ], 0);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfits.length, 1);
});

test('returns the same failure as the collected compositions when none is valid', () => {
  const requirements = clothingRequirements(requirement('thermal', 'high'));
  const candidates = [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'sandals'),
  ];

  assert.deepEqual(
    composeOutfitOptions(requirements, candidates, 0),
    collectValidOutfits(requirements, candidates),
  );
});

test('returns the same outfits for a fixed candidate reordering', () => {
  const requirements = clothingRequirements();
  const candidates = [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'cardigan'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'rain_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ];
  const reordered = [
    candidates[5],
    candidates[2],
    candidates[0],
    candidates[4],
    candidates[1],
    candidates[3],
  ];

  assert.deepEqual(
    composeOutfitOptions(requirements, reordered, 0),
    composeOutfitOptions(requirements, candidates, 0),
  );
});

// Catalog version 5 put several garments in the same thermal band, and score order alone
// then let the single best-scoring shoe and the single best-scoring formality fill all 24
// offered options: a formal dress style saw no formal outfit at all on a mild day. The offer
// is now taken one outfit per formality and one per body core in turn.
test('the offered options keep every composable formality and more than one shoe', () => {
  const observedAt = '2026-08-01T12:00:00.000Z';
  const offeredAt = (temperatureCelsius) => {
    const measurements = Object.freeze({
      temperatureCelsius,
      apparentTemperatureCelsius: temperatureCelsius,
      condition: 'clear',
      precipitationProbability: 0,
      windSpeedMetersPerSecond: 0,
      humidity: 0.5,
      uvIndex: 0,
    });
    const requirements = deriveClothingRequirements(
      Object.freeze({
        id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
        localProfileId: 'profile-one',
        locationKey: 'manual:sample.istanbul',
        timeZone: 'UTC',
        fetchedAt: observedAt,
        origin: Object.freeze({ kind: 'sample', sourceId: 'composition-test' }),
        current: Object.freeze({ observedAt, ...measurements }),
        minimumTemperatureCelsius: temperatureCelsius,
        maximumTemperatureCelsius: temperatureCelsius + 1,
        hourly: Object.freeze([
          Object.freeze({ forecastAt: '2026-08-01T13:00:00.000Z', ...measurements }),
        ]),
      }),
      observedAt,
    );
    const result = composeOutfitOptions(
      requirements,
      listGarmentTypesForPreference('womens').map(({ typeId }) =>
        catalogCandidate(requirements, typeId, 'womens')),
      0,
    );
    assert.equal(result.status, 'composed', `${temperatureCelsius} C composed nothing`);
    return result.outfits;
  };

  const mild = offeredAt(20);
  assert.equal(
    mild.some(({ formality }) => formality === 'formal'),
    true,
    'a mild day offers no formal option, so a formal dress style has none to prefer',
  );

  const shoes = new Set(
    offeredAt(24).map(({ footwear }) => footwear.garment.garmentTypeId),
  );
  assert.equal(shoes.size >= 2, true, `a warm day offers only ${[...shoes].join(', ')}`);
});

// Part 1 of Goal B: accessories are attached to a finished outfit, never composed into it.
// The five profiles below are the ones the recommendation grid already uses, read here for
// what each of them finishes with rather than for what it composes.
function composableForWeather(measurements, overrides = {}, preference = 'womens') {
  const observedAt = '2026-08-01T12:00:00.000Z';
  const full = Object.freeze({ humidity: 0.5, uvIndex: 0, ...measurements });
  const requirements = deriveClothingRequirements(
    Object.freeze({
      id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
      localProfileId: 'profile-one',
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: Object.freeze({ kind: 'sample', sourceId: 'composition-test' }),
      current: Object.freeze({ observedAt, ...full }),
      minimumTemperatureCelsius: full.temperatureCelsius - 1,
      maximumTemperatureCelsius: full.temperatureCelsius + 1,
      hourly: Object.freeze([
        Object.freeze({ forecastAt: '2026-08-01T13:00:00.000Z', ...full }),
      ]),
      ...overrides,
    }),
    observedAt,
  );
  return {
    requirements,
    candidates: listGarmentTypesForPreference(preference).map(({ typeId }) =>
      catalogCandidate(requirements, typeId, preference)),
  };
}

function offeredForWeather(measurements, overrides = {}, preference = 'womens') {
  const { requirements, candidates } = composableForWeather(measurements, overrides, preference);
  const result = composeOutfitOptions(requirements, candidates, 0);
  assert.equal(result.status, 'composed', 'the profile composed nothing');
  return result.outfits;
}

function accessoryTypes(outfit) {
  return Object.fromEntries(
    ['head', 'neck', 'hands', 'handheld'].flatMap((slot) => {
      const accessory = outfit.accessories[slot];
      return accessory ? [[slot, accessory.garment.garmentTypeId]] : [];
    }),
  );
}

const clearDay = (temperatureCelsius) => ({
  temperatureCelsius,
  apparentTemperatureCelsius: temperatureCelsius,
  condition: 'clear',
  precipitationProbability: 0,
  windSpeedMetersPerSecond: 0,
});

test('a mild and a hot day finish with no accessory at all', () => {
  for (const temperatureCelsius of [20, 32]) {
    for (const outfit of offeredForWeather(clearDay(temperatureCelsius))) {
      assert.deepEqual(
        accessoryTypes(outfit),
        {},
        `${temperatureCelsius} C attached an accessory nobody asked for`,
      );
      // No accessory, no accessory segment: the key an accessory-free day writes is the
      // key it wrote before the four slots existed.
      assert.equal(
        outfit.compositionKey.split('|').length,
        outfit.body.kind === 'separates' ? 6 : 5,
        outfit.compositionKey,
      );
    }
  }
});

test('a cold day covers head, neck and hands, and each slot holds exactly one garment', () => {
  const offered = offeredForWeather(clearDay(2));
  const byFormality = new Map();
  for (const outfit of offered) {
    for (const slot of ['head', 'neck', 'hands', 'handheld']) {
      const accessory = outfit.accessories[slot];
      if (accessory) {
        assert.equal(accessory.slot, slot);
        assert.equal(accessory.layerRole, null);
        assert.equal(accessory.garment.properties.category, 'accessory');
      }
    }
    assert.equal(outfit.accessories.handheld, null, 'a dry day carries nothing');
    byFormality.set(outfit.formality, accessoryTypes(outfit));
  }

  assert.deepEqual(byFormality.get('casual'), {
    head: 'balaclava',
    neck: 'neck_gaiter',
    hands: 'gloves',
  });
  // Formality consistency: a smart or formal outfit finishes with the smart hat and scarf,
  // and the one garment its slot offers reaches every outfit whatever the formality.
  for (const formality of ['smart', 'formal']) {
    const chosen = byFormality.get(formality);
    if (!chosen) continue;
    assert.deepEqual(chosen, {
      head: 'brimmed_hat',
      neck: 'scarf',
      hands: 'gloves',
    });
  }
});

test('a cold rainy day carries an umbrella and a mild rainy day carries one without covering anything', () => {
  const rain = (temperatureCelsius) => ({
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition: 'rain',
    precipitationProbability: 0.75,
    windSpeedMetersPerSecond: 4,
  });

  for (const outfit of offeredForWeather(rain(5))) {
    assert.equal(outfit.accessories.handheld?.garment.garmentTypeId, 'umbrella');
    assert.notEqual(outfit.accessories.head, null);
  }
  for (const outfit of offeredForWeather(rain(19))) {
    assert.equal(outfit.accessories.handheld?.garment.garmentTypeId, 'umbrella');
    assert.equal(outfit.accessories.head, null);
    assert.equal(outfit.accessories.neck, null);
    assert.equal(outfit.accessories.hands, null);
  }
});

test('accessories reach the composition key and never the body slots or the distinctness rule', () => {
  const cold = offeredForWeather(clearDay(2));
  const [first] = cold;
  assert.equal(
    first.compositionKey.endsWith('|catalog:balaclava|catalog:neck_gaiter|catalog:gloves|-'),
    true,
    first.compositionKey,
  );
  // The six body slots never see an accessory, whatever the day asked for.
  for (const outfit of cold) {
    const body = [
      ...(outfit.body.kind === 'separates'
        ? [outfit.body.primaryTop, outfit.body.bottom]
        : [outfit.body.onePiece]),
      outfit.midLayer,
      outfit.outerLayer,
      outfit.footwear,
    ].filter((garment) => garment !== null);
    assert.equal(
      body.some(({ garment }) => garment.properties.category === 'accessory'),
      false,
    );
    assert.equal(
      outfit.candidateKeys.some((key) => key.endsWith(':gloves')),
      false,
      'an accessory reached the keys distinctness counts',
    );
  }
});

// A day that requires no layer scored every arrangement alike, and the comparator then read
// layer count ascending: every body core led with its bare variant, and the pool, being one
// outfit per core, carried no layer at all. Every second core now leads with its best
// layered arrangement.
function layerCount(outfit) {
  return Number(outfit.midLayer !== null) + Number(outfit.outerLayer !== null);
}

function bodyCoreOf(outfit) {
  return outfit.body.kind === 'one_piece'
    ? `one_piece|${outfit.body.onePiece.garment.candidateKey}`
    : `separates|${outfit.body.primaryTop.garment.candidateKey}` +
      `|${outfit.body.bottom.garment.candidateKey}`;
}

test('a day that asks for no layer still offers layered options, each from its own body core', () => {
  for (const preference of ['womens', 'mens']) {
    // 20 °C derives no thermal requirement at all; 26 °C derives optional breathability only.
    for (const temperatureCelsius of [20, 26]) {
      const where = `${temperatureCelsius} °C ${preference}`;
      const offered = offeredForWeather(clearDay(temperatureCelsius), {}, preference);
      const layered = offered.filter((outfit) => layerCount(outfit) > 0);
      assert.equal(offered.length, 24, where);
      assert.ok(layered.length >= 8, `${where} offered ${layered.length} layered options`);
      assert.equal(
        new Set(layered.map(bodyCoreOf)).size,
        layered.length,
        `${where} repeated a body core among its layered options`,
      );
    }
  }
});

test('a cold rainy day composes no bare arrangement, so the alternating core moves nothing', () => {
  const coldRain = {
    temperatureCelsius: 6,
    apparentTemperatureCelsius: 4,
    condition: 'rain',
    precipitationProbability: 0.75,
    windSpeedMetersPerSecond: 6,
  };
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(coldRain, {}, preference);
    const valid = collectValidOutfits(requirements, candidates);
    assert.equal(valid.status, 'composed', preference);
    // Every member of every body core group already layers, so the first layered member of
    // a group is its head and the offer is exactly what it was before the rule.
    assert.equal(valid.outfits.every((outfit) => layerCount(outfit) > 0), true, preference);
    assert.equal(offeredForWeather(coldRain, {}, preference).length, 24, preference);
  }
});

test('a hot day composes no layered arrangement, so the pool stays at four', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(clearDay(32), {}, preference);
    const valid = collectValidOutfits(requirements, candidates);
    assert.equal(valid.status, 'composed', preference);
    // No group holds a layered member, so the rule finds nothing to move.
    assert.equal(valid.outfits.some((outfit) => layerCount(outfit) > 0), false, preference);
    assert.equal(offeredForWeather(clearDay(32), {}, preference).length, 4, preference);
  }
});

test('the offered order repeats exactly for the same input', () => {
  const keys = () =>
    offeredForWeather(clearDay(20)).map(({ compositionKey }) => compositionKey);
  assert.deepEqual(keys(), keys());
});
