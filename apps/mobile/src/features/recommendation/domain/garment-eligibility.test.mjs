import assert from 'node:assert/strict';
import test from 'node:test';

import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  compareGarmentEligibilityResults,
  evaluateGarmentEligibility,
  garmentEligibilityReasonCodes,
  projectCatalogEffectiveGarment,
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

// A ready projection of one catalog type with chosen actual-item properties, for
// evaluation cases the catalog defaults alone do not reach.
function projectionWith(typeId, overrides = {}, lookup = getGarmentType) {
  const type = lookup(typeId);
  return Object.freeze({
    status: 'ready',
    garment: Object.freeze({
      candidateKey: `test:${typeId}`,
      source: 'catalog',
      garmentTypeId: type.typeId,
      properties: Object.freeze({
        category: type.structuralCategory,
        bodyRegion: type.bodyRegion,
        supportedLayerRoles: Object.freeze([...type.supportedLayerRoles]),
        thermalLevel: type.defaultThermalLevel,
        waterProtection: type.defaultWaterProtection,
        windProtection: type.defaultWindProtection,
        breathability: type.defaultBreathability,
        armCoverage: type.defaultArmCoverage,
        legCoverage: type.defaultLegCoverage,
        tractionSuitability: type.defaultTractionSuitability,
        ...overrides,
      }),
    }),
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

test('catalog defaults project to effective properties', () => {
  const catalog = projectCatalogEffectiveGarment('t_shirt', 'womens');

  assert.equal(catalog.status, 'ready');
  assert.equal(catalog.garment.properties.thermalLevel, 'none');
  assert.equal(catalog.garment.properties.breathability, 'high');
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
    projectionWith('insulated_jacket', { thermalLevel: 'high', armCoverage: 'none' }),
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
      projectionWith('coat', { windProtection: 'none' }),
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

test('catalog preference rejects a type made for another preference', () => {
  const catalog = evaluateGarmentEligibility(
    clothingRequirements(),
    projectCatalogEffectiveGarment('blouse', 'mens'),
  );
  assert.equal(catalog.status, 'ineligible');
  assert.deepEqual(catalog.reasonCodes, ['catalog_preference_mismatch']);
});

test('unavailable catalog types and accessories fail explicitly', () => {
  const unavailable = projectCatalogEffectiveGarment(
    'future_unknown_type',
    'womens',
  );
  const rejected = evaluateGarmentEligibility(clothingRequirements(), unavailable);

  assert.deepEqual(rejected.reasonCodes, ['catalog_type_unavailable']);
  assert.equal(rejected.garment, null);

  const umbrella = evaluateGarmentEligibility(
    clothingRequirements(
      requirement('water_protection', 'waterproof', {
        target: 'body',
        reasonCodes: Object.freeze(['condition_rain']),
      }),
    ),
    projectCatalogEffectiveGarment('umbrella', 'womens'),
  );
  assert.equal(umbrella.status, 'eligible');
  assert.equal(
    umbrella.evaluations.find(({ requirement: { kind } }) => kind === 'water_protection')
      ?.status,
    'met',
  );

  const dryUmbrella = evaluateGarmentEligibility(
    clothingRequirements(),
    projectCatalogEffectiveGarment('umbrella', 'womens'),
  );
  assert.deepEqual(dryUmbrella.reasonCodes, ['no_applicable_requirements']);
});

test('deprecated catalog candidates are unavailable', () => {
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

  assert.equal(catalog.status, 'ineligible');
  assert.deepEqual(catalog.reasonCodes, ['catalog_type_unavailable']);
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
