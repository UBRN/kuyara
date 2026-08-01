import assert from 'node:assert/strict';
import test from 'node:test';

import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  compareGarmentEligibilityResults,
  evaluateGarmentEligibility,
  garmentEligibilityReasonCodes,
  projectCatalogEffectiveGarment,
  projectWardrobeEffectiveGarment,
} from './garment-eligibility.ts';

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

function wardrobeItem(overrides = {}) {
  return Object.freeze({
    id: 'wardrobe-one',
    localProfileId: 'profile-one',
    name: null,
    category: 'top',
    garmentTypeId: 't_shirt',
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
}

function evaluation(result, kind, target) {
  return result.evaluations.find(
    ({ requirement: candidate }) =>
      candidate.kind === kind &&
      (target === undefined || candidate.target === target),
  );
}

function candidateKey(projection) {
  return projection.status === 'ready'
    ? projection.garment.candidateKey
    : projection.candidateKey;
}

test('catalog defaults and Wardrobe overrides converge on effective properties', () => {
  const catalog = projectCatalogEffectiveGarment('t_shirt', 'womens');
  const owned = projectWardrobeEffectiveGarment(wardrobeItem({
    thermalLevelOverride: 'moderate',
    breathabilityOverride: 'low',
  }));

  assert.equal(catalog.status, 'ready');
  assert.equal(catalog.garment.properties.thermalLevel, 'none');
  assert.equal(catalog.garment.properties.breathability, 'high');
  assert.equal(owned.status, 'ready');
  assert.equal(owned.garment.properties.thermalLevel, 'moderate');
  assert.equal(owned.garment.properties.breathability, 'low');
});

test('mandatory thermal and coverage shortfalls remain composition-aware', () => {
  const thermalResult = evaluateGarmentEligibility(
    clothingRequirements(requirement('thermal', 'high')),
    projectCatalogEffectiveGarment('long_sleeve_t_shirt', 'womens'),
  );
  assert.equal(thermalResult.status, 'eligible');
  assert.equal(thermalResult.garment.candidateKey,
    'catalog:long_sleeve_t_shirt');
  assert.equal(Object.isFrozen(thermalResult.garment), true);
  assert.equal(evaluation(thermalResult, 'thermal').status, 'shortfall');
  assert.equal(evaluation(thermalResult, 'thermal').contribution, 33);
  assert.equal(evaluation(thermalResult, 'thermal').hardFailure, false);

  const vestResult = evaluateGarmentEligibility(
    clothingRequirements(requirement('arm_coverage', 'full')),
    projectWardrobeEffectiveGarment(wardrobeItem({
      category: 'outerwear',
      garmentTypeId: 'insulated_jacket',
      thermalLevelOverride: 'high',
      armCoverageOverride: 'none',
    })),
  );
  assert.equal(vestResult.status, 'eligible');
  assert.equal(evaluation(vestResult, 'arm_coverage').status, 'shortfall');
  assert.equal(evaluation(vestResult, 'arm_coverage').hardFailure, false);

  const legsResult = evaluateGarmentEligibility(
    clothingRequirements(requirement('leg_coverage', 'full')),
    projectCatalogEffectiveGarment('shorts', 'womens'),
  );
  assert.equal(legsResult.status, 'eligible');
  assert.equal(evaluation(legsResult, 'leg_coverage').status, 'shortfall');
  assert.equal(evaluation(legsResult, 'leg_coverage').contribution, 50);

  for (const result of [thermalResult, vestResult, legsResult]) {
    assert.equal(
      result.reasonCodes.includes('composition_requirement_shortfall'),
      true,
    );
  }
});

test('mandatory breathability shortfall does not reject required waterproof candidates', () => {
  const hotRain = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const shell = evaluateGarmentEligibility(
    hotRain,
    projectCatalogEffectiveGarment('rain_jacket', 'womens'),
  );

  assert.equal(shell.status, 'eligible');
  assert.equal(evaluation(shell, 'breathability').status, 'shortfall');
  assert.equal(evaluation(shell, 'breathability').hardFailure, false);
  assert.deepEqual(evaluation(shell, 'breathability').reasonCodes, [
    'temperature_high',
  ]);
  assert.equal(evaluation(shell, 'water_protection', 'body').status, 'met');

  const hotSnow = clothingRequirements(
    requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    }),
    requirement('water_protection', 'waterproof', {
      target: 'feet',
      reasonCodes: Object.freeze(['condition_snow']),
    }),
  );
  const boots = evaluateGarmentEligibility(
    hotSnow,
    projectCatalogEffectiveGarment('weather_boots', 'womens'),
  );

  assert.equal(boots.status, 'eligible');
  assert.equal(evaluation(boots, 'breathability').status, 'shortfall');
  assert.equal(evaluation(boots, 'water_protection', 'feet').status, 'met');
});

test('directly targeted mandatory water, wind, and traction failures reject', () => {
  const cases = [
    [
      projectCatalogEffectiveGarment('light_jacket', 'womens'),
      requirement('water_protection', 'waterproof', {
        target: 'body',
        reasonCodes: Object.freeze(['condition_rain']),
      }),
      'mandatory_body_water_shortfall',
    ],
    [
      projectWardrobeEffectiveGarment(wardrobeItem({
        category: 'outerwear',
        garmentTypeId: 'coat',
        windProtectionOverride: 'none',
      })),
      requirement('wind_protection', 'wind_resistant', {
        reasonCodes: Object.freeze(['wind_strong']),
      }),
      'mandatory_wind_shortfall',
    ],
    [
      projectCatalogEffectiveGarment('sneakers', 'womens'),
      requirement('water_protection', 'waterproof', {
        target: 'feet',
        reasonCodes: Object.freeze(['condition_snow']),
      }),
      'mandatory_feet_water_shortfall',
    ],
    [
      projectCatalogEffectiveGarment('sneakers', 'womens'),
      requirement('traction', 'enhanced', {
        reasonCodes: Object.freeze(['condition_snow']),
      }),
      'mandatory_traction_shortfall',
    ],
  ];

  for (const [projection, targetRequirement, expectedReason] of cases) {
    const result = evaluateGarmentEligibility(
      clothingRequirements(targetRequirement),
      projection,
    );
    assert.equal(result.status, 'ineligible', candidateKey(projection));
    assert.equal(result.garment.candidateKey, candidateKey(projection));
    assert.equal(result.score, null, candidateKey(projection));
    assert.deepEqual(
      result.reasonCodes,
      [expectedReason],
      candidateKey(projection),
    );
    assert.equal(
      result.evaluations[0].hardFailure,
      true,
      candidateKey(projection),
    );
  }
});

test('optional failures never reject and incompatible targets are not applicable', () => {
  const optionalWater = requirement('water_protection', 'waterproof', {
    target: 'body',
    priority: 'optional',
    reasonCodes: Object.freeze(['precipitation_possible']),
  });
  const outerwear = evaluateGarmentEligibility(
    clothingRequirements(optionalWater),
    projectCatalogEffectiveGarment('light_jacket', 'womens'),
  );
  assert.equal(outerwear.status, 'eligible');
  assert.equal(evaluation(outerwear, 'water_protection', 'body').hardFailure, false);
  assert.equal(
    outerwear.reasonCodes.includes('optional_requirement_shortfall'),
    true,
  );

  const missingBreathability = evaluateGarmentEligibility(
    clothingRequirements(requirement('breathability', 'moderate', {
      priority: 'optional',
      reasonCodes: Object.freeze(['temperature_high']),
    })),
    {
      status: 'ready',
      garment: {
        candidateKey: 'catalog:incomplete-top',
        source: 'catalog',
        garmentTypeId: 't_shirt',
        properties: {
          category: 'top',
          bodyRegion: 'upper_body',
          supportedLayerRoles: ['base'],
          thermalLevel: 'none',
          waterProtection: null,
          windProtection: null,
          breathability: null,
          armCoverage: 'partial',
          legCoverage: null,
          tractionSuitability: null,
        },
      },
    },
  );
  assert.equal(missingBreathability.status, 'eligible');
  assert.equal(
    evaluation(missingBreathability, 'breathability').status,
    'missing',
  );
  assert.equal(
    evaluation(missingBreathability, 'breathability').contribution,
    0,
  );

  const footwearRequirement = requirement(
    'water_protection',
    'waterproof',
    {
      target: 'feet',
      reasonCodes: Object.freeze(['condition_snow']),
    },
  );
  const top = evaluateGarmentEligibility(
    clothingRequirements(footwearRequirement),
    projectCatalogEffectiveGarment('t_shirt', 'womens'),
  );
  assert.equal(top.status, 'eligible');
  assert.equal(evaluation(top, 'water_protection', 'feet').status, 'not_applicable');
  assert.equal(evaluation(top, 'water_protection', 'feet').contribution, null);
  assert.equal(top.score, 50);
});

test('catalog preference applies only to bundled candidates', () => {
  const catalog = evaluateGarmentEligibility(
    clothingRequirements(),
    projectCatalogEffectiveGarment('blouse', 'mens'),
  );
  assert.equal(catalog.status, 'ineligible');
  assert.deepEqual(catalog.reasonCodes, ['catalog_preference_mismatch']);

  const owned = evaluateGarmentEligibility(
    clothingRequirements(),
    projectWardrobeEffectiveGarment(wardrobeItem({
      garmentTypeId: 'blouse',
    })),
  );
  assert.equal(owned.status, 'eligible');
});

test('lifecycle, invalid data, unavailable catalog, and accessories fail explicitly', () => {
  const deleted = projectWardrobeEffectiveGarment(wardrobeItem({
    deletedAt: '2026-08-01T12:00:00.000Z',
  }));
  const legacy = projectWardrobeEffectiveGarment(wardrobeItem({
    garmentTypeId: null,
  }));
  const invalid = projectWardrobeEffectiveGarment(wardrobeItem({
    category: 'bottom',
  }));
  const unavailable = projectCatalogEffectiveGarment(
    'future_unknown_type',
    'womens',
  );

  assert.deepEqual(
    [deleted, legacy, invalid, unavailable].map((projection) =>
      evaluateGarmentEligibility(clothingRequirements(), projection).reasonCodes[0]
    ),
    [
      'wardrobe_garment_deleted',
      'wardrobe_garment_legacy',
      'wardrobe_garment_invalid',
      'catalog_type_unavailable',
    ],
  );

  assert.deepEqual(
    [deleted, legacy, invalid, unavailable].map((projection) =>
      evaluateGarmentEligibility(clothingRequirements(), projection).garment
    ),
    [null, null, null, null],
  );

  const umbrella = evaluateGarmentEligibility(
    clothingRequirements(
      requirement('water_protection', 'waterproof', {
        target: 'body',
        reasonCodes: Object.freeze(['condition_rain']),
      }),
    ),
    projectCatalogEffectiveGarment('umbrella', 'womens'),
  );
  assert.equal(umbrella.status, 'ineligible');
  assert.deepEqual(umbrella.reasonCodes, ['unsupported_category']);
});

test('deprecated catalog candidates are unavailable while deprecated owned garments resolve', () => {
  const sweater = getGarmentType('sweater');
  const deprecatedSweater = {
    ...sweater,
    status: 'deprecated',
    replacedByTypeId: 'cardigan',
  };
  const lookup = (typeId) => typeId === 'sweater' ? deprecatedSweater : null;

  const catalog = evaluateGarmentEligibility(
    clothingRequirements(),
    projectCatalogEffectiveGarment('sweater', 'womens', lookup),
  );
  const owned = evaluateGarmentEligibility(
    clothingRequirements(),
    projectWardrobeEffectiveGarment(wardrobeItem({
      garmentTypeId: 'sweater',
    }), lookup),
  );

  assert.equal(catalog.status, 'ineligible');
  assert.deepEqual(catalog.reasonCodes, ['catalog_type_unavailable']);
  assert.equal(owned.status, 'eligible');
});

test('stronger values are capped and over-protection penalties are exact and bounded', () => {
  const noNeeds = evaluateGarmentEligibility(
    clothingRequirements(),
    projectCatalogEffectiveGarment('insulated_jacket', 'womens'),
  );
  assert.equal(noNeeds.status, 'eligible');
  assert.equal(noNeeds.scoreBeforePenalties, 50);
  assert.equal(noNeeds.penaltyPoints, 20);
  assert.equal(noNeeds.score, 30);

  const excessiveThermal = evaluateGarmentEligibility(
    clothingRequirements(requirement('thermal', 'light')),
    projectCatalogEffectiveGarment('insulated_jacket', 'womens'),
  );
  assert.equal(evaluation(excessiveThermal, 'thermal').contribution, 100);
  assert.equal(excessiveThermal.scoreBeforePenalties, 100);
  assert.equal(excessiveThermal.penaltyPoints, 10);
  assert.equal(excessiveThermal.score, 90);

  const hotWeatherBoots = evaluateGarmentEligibility(
    clothingRequirements(requirement('breathability', 'high', {
      reasonCodes: Object.freeze(['temperature_high']),
    })),
    projectCatalogEffectiveGarment('weather_boots', 'womens'),
  );
  assert.equal(hotWeatherBoots.status, 'eligible');
  assert.equal(hotWeatherBoots.scoreBeforePenalties, 33);
  assert.equal(hotWeatherBoots.penaltyPoints, 30);
  assert.equal(hotWeatherBoots.score, 3);
  assert.deepEqual(hotWeatherBoots.reasonCodes, [
    'composition_requirement_shortfall',
    'thermal_over_protection',
    'unnecessary_water_protection',
  ]);
});

test('repeated evaluation and equal-score ordering are stable', () => {
  const needs = clothingRequirements(requirement('thermal', 'moderate'));
  const first = evaluateGarmentEligibility(
    needs,
    projectCatalogEffectiveGarment('sweater', 'womens'),
  );
  const repeated = evaluateGarmentEligibility(
    needs,
    projectCatalogEffectiveGarment('sweater', 'womens'),
  );
  assert.deepEqual(first, repeated);

  const cardigan = evaluateGarmentEligibility(
    needs,
    projectCatalogEffectiveGarment('cardigan', 'womens'),
  );
  const sorted = [first, cardigan].sort(compareGarmentEligibilityResults);
  assert.equal(first.score, cardigan.score);
  assert.deepEqual(sorted.map(({ candidateKey }) => candidateKey), [
    'catalog:cardigan',
    'catalog:sweater',
  ]);
  assert.equal(new Set(garmentEligibilityReasonCodes).size,
    garmentEligibilityReasonCodes.length);
});
