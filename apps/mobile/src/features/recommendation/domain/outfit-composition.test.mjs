import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { aiV1OptionLimit } from '@kuyara/contracts';

import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from './garment-eligibility.ts';
import { listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import {
  assignedOutfitGarments,
  collectValidOutfits,
  composeOutfitOptions,
  evaluateArrangement,
  excludeRecentlyWornOutfits,
  garmentFitsSlot,
  isFormalSuit,
  offeredOutfitLimit,
  onePieceExcludes,
  outfitCompositionFailureCodes,
  outfitCompositionReasonCodes,
  outfitSlots,
} from './outfit-composition.ts';
import { readComposerDay, validDrafts } from './outfit-enumeration.ts';
import { orderForOffer } from './outfit-offer.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';
import { gridRecommendationInput } from '../../../../test/recommendation-grid.mjs';
import { recommendOutfits } from '../application/recommend-outfits.ts';

test('the complete ordered catalog pool stays byte-identical across weather and dress styles', () => {
  const hash = createHash('sha256');
  for (const preference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const weather of ['hot', 'mild', 'cold_rain', 'freezing']) {
        const cell = { preference, dressStyle, weather };
        const input = gridRecommendationInput(weather, preference, dressStyle);
        const requirements = deriveClothingRequirements(input.snapshot, input.now);
        const candidates = listGarmentTypesForPreference(preference).map(({ typeId }) =>
          catalogCandidate(requirements, typeId, preference));
        const result = collectValidOutfits(requirements, candidates);
        const ordered = result.status === 'composed'
          ? result.outfits.map((outfit, order) => ({
              order,
              compositionKey: outfit.compositionKey,
              score: outfit.score,
              formality: outfit.formality,
            }))
          : { failure: result.reasonCodes };
        hash.update(JSON.stringify({ cell, ordered }));
      }
    }
  }
  assert.equal(
    hash.digest('hex'),
    'dc3301bb6c37a5ba60337ae2b74b19bfcca10656d94a0e11a27163e2143df5c7',
  );
});

test('the assigned garments of every outfit follow the outfit slot order without gaps', () => {
  for (const preference of ['womens', 'mens']) {
    for (const weather of ['hot', 'mild', 'cold_rain', 'freezing']) {
      const input = gridRecommendationInput(weather, preference, 'smart');
      const requirements = deriveClothingRequirements(input.snapshot, input.now);
      const candidates = listGarmentTypesForPreference(preference).map(({ typeId }) =>
        catalogCandidate(requirements, typeId, preference));
      const composed = collectValidOutfits(requirements, candidates);
      assert.equal(composed.status, 'composed', `${preference} ${weather}`);

      for (const outfit of composed.outfits) {
        const slots = assignedOutfitGarments(outfit).map(({ slot }) => slot);
        assert.deepEqual(
          slots,
          outfitSlots.filter((slot) => slots.includes(slot)),
          `${preference} ${weather}`,
        );
        assert.ok(slots.includes('footwear'));
      }
    }
  }
});

test('a mild dry Formal day offers a formal outfit for both clothing preferences', () => {
  for (const preference of ['womens', 'mens']) {
    const input = gridRecommendationInput('mild', preference, 'formal');
    const requirements = deriveClothingRequirements(input.snapshot, input.now);
    const candidates = listGarmentTypesForPreference(preference).map(({ typeId }) =>
      catalogCandidate(requirements, typeId, preference));
    const composed = collectValidOutfits(requirements, candidates);
    const offered = composeOutfitOptions(requirements, candidates, input.dayVariant);

    assert.equal(composed.status, 'composed', preference);
    assert.equal(offered.status, 'composed', preference);
    assert.ok(composed.outfits.some(({ formality }) => formality === 'formal'),
      `${preference} composed no formal outfit`);
    assert.ok(offered.outfits.some(({ formality }) => formality === 'formal'),
      `${preference} offered no formal outfit`);
  }
});

test('a dry 30 C Smart or Formal day still shows smart or formal outfits for both clothing preferences', () => {
  for (const preference of ['womens', 'mens']) {
    for (const dressStyle of ['smart', 'formal']) {
      const input = gridRecommendationInput('hot', preference, dressStyle);
      const measurements = { temperatureCelsius: 30, apparentTemperatureCelsius: 30 };
      const snapshot = {
        ...input.snapshot,
        current: { ...input.snapshot.current, ...measurements },
        hourly: input.snapshot.hourly.map((hour) => ({ ...hour, ...measurements })),
        minimumTemperatureCelsius: 30,
        maximumTemperatureCelsius: 30,
      };
      const result = recommendOutfits({ ...input, snapshot });

      assert.equal(result.status, 'recommended', `${preference}/${dressStyle}`);
      assert.ok(result.outfits.every(({ formality }) => formality !== 'casual'),
        `${preference}/${dressStyle} showed a casual outfit at 30 C`);
      assert.ok(result.outfits.some(({ formality }) => formality === dressStyle),
        `${preference}/${dressStyle} showed no ${dressStyle} outfit at 30 C`);
    }
  }
});

// Between the coat rung and 12 C a knit alone is not enough: the day is met with a jacket over
// it, so a dry 6 C day is not dressed in a turtleneck and boots while 4 C wears a coat.
test('a dry day from 5 to 12 C shows every pick with an outer layer', () => {
  for (const preference of ['womens', 'mens']) {
    for (const dressStyle of ['casual', 'smart', 'formal']) {
      for (const temperatureCelsius of [5, 6, 8, 10, 11.5]) {
        const input = gridRecommendationInput('hot', preference, dressStyle);
        const measurements = {
          temperatureCelsius,
          apparentTemperatureCelsius: temperatureCelsius,
          uvIndex: 2,
        };
        const snapshot = {
          ...input.snapshot,
          current: { ...input.snapshot.current, ...measurements },
          hourly: input.snapshot.hourly.map((hour) => ({ ...hour, ...measurements })),
          minimumTemperatureCelsius: temperatureCelsius,
          maximumTemperatureCelsius: temperatureCelsius,
        };
        const result = recommendOutfits({ ...input, snapshot });
        const cell = `${preference}/${dressStyle}/${temperatureCelsius} C`;

        assert.equal(result.status, 'recommended', cell);
        assert.equal(result.outfits.length, 3, cell);
        assert.deepEqual(
          result.outfits.filter(({ outerLayer }) => outerLayer === null)
            .map(({ compositionKey }) => compositionKey),
          [],
          cell,
        );
      }
    }
  }
});

test('recent worn sets exclude by catalog garment IDs and relax oldest first to keep three', () => {
  const make = (id) => ({
    body: { kind: 'separates', primaryTop: { garment: { garmentTypeId: id } },
      bottom: { garment: { garmentTypeId: 'jeans' } } },
    midLayer: null, outerLayer: null,
    footwear: { garment: { garmentTypeId: 'sneakers' } },
    accessories: { head: null, neck: null, hands: null, handheld: null },
  });
  const ids = ['t_shirt', 'shirt', 'blouse', 'sweatshirt', 'hoodie'];
  const options = ids.map(make);
  const worn = ['t_shirt', 'shirt', 'blouse', 'sweatshirt', 'hoodie', 'polo_shirt',
    'sweater', 'cardigan'].map((id) => ({ garments: {
    primary_top: id, bottom: 'jeans', footwear: 'sneakers',
  } }));
  assert.deepEqual(excludeRecentlyWornOutfits(options, worn).map((outfit) =>
    outfit.body.primaryTop.garment.garmentTypeId), ['blouse', 'sweatshirt', 'hoodie']);
  assert.deepEqual(excludeRecentlyWornOutfits(options, worn.slice(0, 1)).map((outfit) =>
    outfit.body.primaryTop.garment.garmentTypeId), ids.slice(1));
  assert.deepEqual(excludeRecentlyWornOutfits(options,
    [...Array(7).fill(worn[5]), worn[0]]).map((outfit) =>
    outfit.body.primaryTop.garment.garmentTypeId), ids);
});

test('recent worn exclusion compares the body core even when accessories change', () => {
  const options = ['t_shirt', 'shirt', 'blouse', 'sweatshirt', 'hoodie'].map((id) => ({
    body: { kind: 'separates', primaryTop: { garment: { garmentTypeId: id } },
      bottom: { garment: { garmentTypeId: 'jeans' } } },
    midLayer: null, outerLayer: null,
    footwear: { garment: { garmentTypeId: 'sneakers' } },
    accessories: { head: null, neck: null, hands: null, handheld: null },
  }));
  const recentWorn = [{ garments: { primary_top: 't_shirt', bottom: 'jeans',
    footwear: 'sneakers', head: 'beanie' } }];
  assert.deepEqual(excludeRecentlyWornOutfits(options, recentWorn).map((outfit) =>
    outfit.body.primaryTop.garment.garmentTypeId),
  ['shirt', 'blouse', 'sweatshirt', 'hoodie']);
});
// Most cases below are about the best arrangement, which is the first one collected.
function composeOutfit(requirements, candidates) {
  const result = collectValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({ status: 'composed', outfit: result.outfits[0] });
}

// Two cases below are about what a full arrangement carries, and the day's best answer is
// not always the one that wears every candidate: a parka alone already answers the coat rung,
// so the arrangement that also wears the sweater sits behind it on layer count.
function composeLayeredOutfit(requirements, candidates) {
  const result = collectValidOutfits(requirements, candidates);
  if (result.status === 'failure') return result;
  const outfit = result.outfits.find(
    (candidate) => candidate.midLayer !== null && candidate.outerLayer !== null,
  );
  assert.ok(outfit, 'no arrangement carried both a mid and an outer layer');
  return Object.freeze({ status: 'composed', outfit });
}

// Some cases below read what the composer's scoring charges for a piece its heat rules keep off
// the day, a high-thermal one on a day that asks for no warmth: they score the arrangement
// itself, which no composition rule touches.
function arrangedOutfit(requirements, { primaryTop, bottom, outerLayer = null, footwear }) {
  const piece = (typeId) => typeId === null ? null : catalogCandidate(requirements, typeId);
  const { outfit } = evaluateArrangement(requirements, {
    body: { kind: 'separates', primaryTop: piece(primaryTop), bottom: piece(bottom) },
    midLayer: null,
    outerLayer: piece(outerLayer),
    footwear: piece(footwear),
  });
  return Object.freeze({ status: 'composed', outfit });
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

test('only the exact shirt, trousers, blazer and closed shoes suit is formal', () => {
  const requirements = clothingRequirements();
  const outfitWith = (top, bottom, outer, footwear, mid = null) => {
    const ids = [top, bottom, mid, outer, footwear].filter(Boolean);
    const result = collectValidOutfits(requirements, ids.map((id) =>
      catalogCandidate(requirements, id, 'mens')));
    assert.equal(result.status, 'composed', ids.join(', '));
    const outfit = result.outfits.find((candidate) =>
      (candidate.midLayer?.garment.garmentTypeId ?? null) === mid &&
      (candidate.outerLayer?.garment.garmentTypeId ?? null) === outer);
    assert.ok(outfit, `${ids.join(', ')} did not compose together`);
    return outfit.formality;
  };

  assert.equal(outfitWith('shirt', 'trousers', 'blazer', 'closed_shoes'), 'formal');
  assert.equal(outfitWith('shirt', 'trousers', null, 'closed_shoes'), 'smart');
  assert.equal(outfitWith('polo_shirt', 'trousers', 'blazer', 'closed_shoes'), 'smart');
  assert.equal(outfitWith('shirt', 'trousers', 'blazer', 'loafers'), 'smart');
  assert.equal(outfitWith('shirt', 'trousers', 'blazer', 'closed_shoes', 'cardigan'), 'smart');
});

test('one-piece replaces separates and may add one mid and one outer layer', () => {
  const requirements = clothingRequirements(
    requirement('thermal', 'high'),
    requirement('water_protection', 'waterproof', {
      target: 'body',
      reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const result = composeLayeredOutfit(requirements, [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'parka'),
    catalogCandidate(requirements, 'weather_boots'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.body.kind, 'one_piece');
  assert.equal(result.outfit.body.onePiece.layerRole, 'standalone');
  assert.equal(result.outfit.midLayer.layerRole, 'mid');
  assert.equal(result.outfit.outerLayer.layerRole, 'outer');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 6);
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
  const result = composeLayeredOutfit(requirements, [
    catalogCandidate(requirements, 'jumpsuit'),
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'parka'),
    catalogCandidate(requirements, 'weather_boots'),
  ]);

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 6);
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
  // Derivation never makes both sides mandatory, and the season rules keep shorts off a day
  // whose warmth is, so this conflict is read without them.
  const result = collectValidOutfits(requirements, [
    catalogCandidate(requirements, 't_shirt'),
    catalogCandidate(requirements, 'shorts'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'sandals'),
  ], { composesNew: false });

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
    catalogCandidate(bodyRequirements, 'sneakers'),
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
    // A snow day asks for warmth, which a high-thermal boot needs before it is worn.
    requirement('thermal', 'light', { priority: 'optional' }),
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

test('candidates are ordered deterministically whatever order they arrive in', () => {
  const requirements = clothingRequirements(requirement('thermal', 'light', { priority: 'optional' }));
  const catalogWarm = catalogCandidate(requirements, 'long_sleeve_t_shirt');
  const catalogCool = catalogCandidate(requirements, 't_shirt');
  const shorts = catalogCandidate(requirements, 'shorts');
  const sandals = catalogCandidate(requirements, 'sandals');

  for (const candidates of [
    [catalogCool, sandals, catalogWarm, shorts],
    [shorts, catalogWarm, sandals, catalogCool],
  ]) {
    const result = composeOutfit(requirements, candidates);
    assert.equal(result.status, 'composed');
    assert.equal(
      result.outfit.body.primaryTop.garment.candidateKey,
      'catalog:long_sleeve_t_shirt',
    );
  }
});

test('outfit over-insulation penalty is bounded and does not count footwear warmth', () => {
  const requirements = clothingRequirements();
  const result = arrangedOutfit(requirements,
    { primaryTop: 'sweater', bottom: 'jeans', footwear: 'weather_boots' });

  assert.equal(result.status, 'composed');
  assert.equal(result.outfit.aggregates.thermal.bodyStrength, 3);
  assert.equal(result.outfit.aggregates.thermal.footwear, 'high');
  assert.equal(result.outfit.penaltyBreakdown.thermalOverProtection, 20);
  // The only high-warmth boot in the catalog is also waterproof, and a day that asked for
  // no water protection now charges that on its own line, so the total carries both.
  assert.equal(result.outfit.penaltyBreakdown.unnecessaryWaterProtection, 10);
  assert.equal(result.outfit.penaltyPoints, 30);
  assert.equal(result.outfit.score, 20);
  assert.deepEqual(result.outfit.reasonCodes, [
    'thermal_over_protection',
    'unnecessary_water_protection',
  ]);
  assert.equal(new Set(outfitCompositionReasonCodes).size,
    outfitCompositionReasonCodes.length);
  assert.equal(new Set(outfitCompositionFailureCodes).size,
    outfitCompositionFailureCodes.length);
});

// With no thermal requirement every rung of warmth is unasked for, and the charge keeps
// growing past a light jacket's: a coat over a shirt and trousers costs more than the light
// jacket, so a mild windy day is not offered a coat for a tie.
// The band below 12 names a jacket the way the coldest band names a coat: a knit with
// nothing over it falls short, and the jacket's own rung is not charged as overshoot.
test('the moderate rung is met only with an outer layer, whose rung costs nothing', () => {
  const requirements = clothingRequirements(requirement('thermal', 'moderate'));
  const bare = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'jeans'),
    catalogCandidate(requirements, 'sneakers'),
  ]);
  assert.equal(bare.status, 'failure');

  const jacketed = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'jeans'),
    catalogCandidate(requirements, 'light_jacket'),
    catalogCandidate(requirements, 'sneakers'),
  ]);
  assert.equal(jacketed.status, 'composed');
  assert.equal(jacketed.outfit.outerLayer.garment.garmentTypeId, 'light_jacket');
  assert.equal(evaluation(jacketed, 'thermal').status, 'met');
  assert.equal(jacketed.outfit.penaltyBreakdown.thermalOverProtection, 0);

  const coated = composeOutfit(requirements, [
    catalogCandidate(requirements, 'sweater'),
    catalogCandidate(requirements, 'jeans'),
    catalogCandidate(requirements, 'parka'),
    catalogCandidate(requirements, 'sneakers'),
  ]);
  assert.equal(coated.outfit.penaltyBreakdown.thermalOverProtection, 10);
});

test('outfit over-insulation starts above body strength one', () => {
  const requirements = clothingRequirements();
  const cases = [
    ['long_sleeve_t_shirt', 'shorts', 1, 0, 50],
    ['sweater', 'shorts', 2, 10, 40],
    ['sweater', 'jeans', 3, 20, 30],
    ['sweater', 'leggings', 4, 25, 25],
    ['fleece', 'leggings', 5, 30, 20],
  ];

  for (const [top, bottom, bodyStrength, penaltyPoints, score] of cases) {
    const result = arrangedOutfit(requirements, { primaryTop: top, bottom, footwear: 'sandals' });

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
  const result = arrangedOutfit(requirements, {
    primaryTop: 'sweatshirt', bottom: 'jeans', outerLayer: 'rain_jacket', footwear: 'weather_boots',
  });

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
    catalogCandidate(requirements, 'loafers'),
    catalogCandidate(requirements, 'ballet_flats'),
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

// The bug: the unnecessary-water-protection penalty applied only once the day asked for
// breathability, so a 12 °C dry day, which asks for neither water protection nor
// breathability, composed half its offer in rain jackets and a casual dress style presented
// three of them. The three a dress style presents are the first three of its formality.
test('a cool dry day does not present its casual three in rain jackets', () => {
  for (const preference of ['womens', 'mens']) {
    const casual = offeredForWeather(clearDay(12), {}, preference)
      .filter(({ formality }) => formality === 'casual')
      .slice(0, 3);
    assert.equal(casual.length, 3, preference);
    const dry = casual.filter(
      ({ outerLayer }) =>
        outerLayer === null || outerLayer.garment.properties.waterProtection === 'none',
    );
    assert.equal(
      dry.length >= 2,
      true,
      `${preference}: ${casual.map(({ outerLayer }) => outerLayer?.garment.garmentTypeId ?? 'none').join(', ')}`,
    );
  }
});

// Part 1 of milestone B: accessories are attached to a finished outfit, never composed into it.
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
    head: 'beanie',
    neck: 'neck_gaiter',
    hands: 'gloves',
  });
  // Cold protection takes priority over matching formality for headwear.
  for (const formality of ['smart', 'formal']) {
    const chosen = byFormality.get(formality);
    if (!chosen) continue;
    assert.notEqual(chosen.head, 'brimmed_hat');
    assert.equal(chosen.neck, 'scarf');
    assert.equal(chosen.hands, 'gloves');
  }
});

// A balaclava covers the face, which only a day below freezing asks for. A cold day above it
// is a beanie day, so 4 C and -10 C no longer finish alike.
test('a balaclava finishes only a day below freezing', () => {
  for (const preference of ['womens', 'mens']) {
    for (const temperatureCelsius of [4, 2, 0]) {
      const heads = new Set(offeredForWeather(clearDay(temperatureCelsius), {}, preference)
        .map((outfit) => outfit.accessories.head?.garment.garmentTypeId));
      assert.deepEqual([...heads], ['beanie'], `${preference} ${temperatureCelsius} C`);
    }
    for (const temperatureCelsius of [-2, -10]) {
      const heads = new Set(offeredForWeather(clearDay(temperatureCelsius), {}, preference)
        .map((outfit) => outfit.accessories.head?.garment.garmentTypeId));
      assert.deepEqual([...heads], ['balaclava'], `${preference} ${temperatureCelsius} C`);
    }
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

// An umbrella keeps no rain off in strong wind and is not carried into a thunderstorm; the
// waterproof outer layer answers those days alone. Snow keeps it: the carried slot answers
// the body's water requirement, which a snow day derives like a rainy one.
test('strong wind and a thunderstorm carry no umbrella, and a calm snow day still does', () => {
  const day = (temperatureCelsius, condition, windSpeedMetersPerSecond) => ({
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition,
    precipitationProbability: 0.8,
    windSpeedMetersPerSecond,
  });
  const handhelds = (weather, preference) => new Set(offeredForWeather(weather, {}, preference)
    .map((outfit) => outfit.accessories.handheld?.garment.garmentTypeId ?? null));

  for (const preference of ['womens', 'mens']) {
    for (const [weather, expected] of [
      [day(12, 'rain', 10), [null]],
      [day(12, 'rain', 8), [null]],
      [day(-2, 'snow', 9), [null]],
      [day(22, 'thunderstorm', 3), [null]],
      [day(12, 'rain', 7.9), ['umbrella']],
      [day(-2, 'snow', 3), ['umbrella']],
      [day(2, 'sleet', 3), ['umbrella']],
    ]) {
      assert.deepEqual([...handhelds(weather, preference)], expected,
        `${preference} ${weather.condition} ${weather.temperatureCelsius} C ${weather.windSpeedMetersPerSecond} m/s`);
    }
  }
});

// Strong wind on a hot day is no reason for a wind jacket, and on a mild one no reason for a
// coat. The light, unsealed layers a calm hot day may offer (a blazer, an overshirt) stay.
test('strong wind puts no wind jacket on a hot day and no coat on a mild one', () => {
  const windy = (temperatureCelsius) => ({
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 10,
  });
  for (const preference of ['womens', 'mens']) {
    for (const temperatureCelsius of [28, 32, 38]) {
      const sealed = offeredForWeather(windy(temperatureCelsius), {}, preference)
        .flatMap(({ outerLayer }) => outerLayer?.garment.properties.windProtection === 'wind_resistant'
          ? [outerLayer.garment.garmentTypeId] : []);
      assert.deepEqual(sealed, [], `${preference} ${temperatureCelsius} C`);
    }
    for (const temperatureCelsius of [18, 20, 22]) {
      const heavy = offeredForWeather(windy(temperatureCelsius), {}, preference)
        .flatMap(({ outerLayer }) => outerLayer?.garment.properties.thermalLevel === 'high'
          ? [outerLayer.garment.garmentTypeId] : []);
      assert.deepEqual(heavy, [], `${preference} ${temperatureCelsius} C`);
    }
  }
});

test('accessories reach the composition key and never the body slots or the distinctness rule', () => {
  const cold = offeredForWeather(clearDay(2));
  const [first] = cold;
  assert.equal(
    first.compositionKey.endsWith('|catalog:beanie|catalog:neck_gaiter|catalog:gloves|-'),
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
      // One body core per formality, not one per offer: the layer decides an outfit's
      // formality, so the same core reaches the offer twice when two layers put it in two
      // formalities, which is how 26 C offers a long skirt under a blazer and under a
      // bomber jacket. Inside one formality's share a core still leads once, unless the
      // formality composes fewer cores than its layered options: a dry 20 C day dresses
      // formal only in a shirt and trousers or a dress, so the suit comes under a blazer and
      // under a rain trench.
      const { requirements, candidates } = composableForWeather(clearDay(temperatureCelsius), {}, preference);
      const valid = collectValidOutfits(requirements, candidates).outfits;
      for (const formality of new Set(layered.map((outfit) => outfit.formality))) {
        const share = layered.filter((outfit) => outfit.formality === formality);
        const composedCores = new Set(valid.filter((outfit) => outfit.formality === formality).map(bodyCoreOf));
        assert.equal(
          new Set(share.map(bodyCoreOf)).size,
          Math.min(share.length, composedCores.size),
          `${where} repeated a ${formality} body core among its layered options`,
        );
      }
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

test('a hot day retains smart and formal options, including light layers', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(clearDay(32), {}, preference);
    const valid = collectValidOutfits(requirements, candidates);
    assert.equal(valid.status, 'composed', preference);
    assert.equal(valid.outfits.some((outfit) => layerCount(outfit) > 0), true, preference);
    const offered = offeredForWeather(clearDay(32), {}, preference);
    assert.ok(offered.some(({ formality }) => formality === 'smart'), preference);
    assert.ok(offered.some(({ formality }) => formality === 'formal'), preference);
  }
});

test('the offered order repeats exactly for the same input', () => {
  const keys = () =>
    offeredForWeather(clearDay(20)).map(({ compositionKey }) => compositionKey);
  assert.deepEqual(keys(), keys());
});

test('a one-piece excludes a top and a bottom and nothing else', () => {
  const excluded = [];
  for (const left of outfitSlots) for (const right of outfitSlots) {
    if (onePieceExcludes(left, right)) excluded.push(`${left}|${right}`);
  }
  assert.deepEqual(excluded.sort(), [
    'bottom|one_piece', 'one_piece|bottom', 'one_piece|primary_top', 'primary_top|one_piece',
  ]);
});

test('Today offers at most as many outfits as one AI request carries', () => {
  assert.equal(offeredOutfitLimit, aiV1OptionLimit);
});

// A stylist never sends some garments together: a summer piece with a winter one, track pants
// with tailoring, a fleece with a skirt or a dress, shorts with boots, and a hoodie pulled over
// a knit or a fleece. These are the pairs the weather grid kept showing; the list names them
// here so that the composer's own table cannot quietly lose one.
const incompatiblePairs = [
  ['shorts', 'rain_boots'], ['shorts', 'weather_boots'], ['shorts', 'ankle_boots'],
  ['sandals', 'parka'], ['sleeveless_top', 'coat'], ['shorts', 'fleece'],
  ['fleece', 'long_skirt'], ['fleece', 'skirt'], ['fleece', 'dress'],
  ['track_pants', 'shirt'], ['track_pants', 'blazer'], ['track_pants', 'loafers'],
];
const hoodieNeverOver = ['fleece', 'sweatshirt', 'sweater', 'cardigan'];

function clashesOf(outfit) {
  const ids = assignedOutfitGarments(outfit).map(({ garment }) => garment.garmentTypeId);
  const clashes = incompatiblePairs
    .filter(([left, right]) => ids.includes(left) && ids.includes(right))
    .map((pair) => pair.join('+'));
  const primary = outfit.body.kind === 'separates' ? outfit.body.primaryTop.garment.garmentTypeId : null;
  if (outfit.midLayer?.garment.garmentTypeId === 'hoodie' && hoodieNeverOver.includes(primary)) {
    clashes.push(`hoodie over ${primary}`);
  }
  return clashes;
}

const clashDays = {
  freezing: { temperatureCelsius: -10, apparentTemperatureCelsius: -10, condition: 'clear',
    precipitationProbability: 0, windSpeedMetersPerSecond: 2 },
  warm_rain: { temperatureCelsius: 24, apparentTemperatureCelsius: 24, condition: 'rain',
    precipitationProbability: 0.8, windSpeedMetersPerSecond: 2 },
  hot_rain: { temperatureCelsius: 26, apparentTemperatureCelsius: 26, condition: 'rain',
    precipitationProbability: 0.8, windSpeedMetersPerSecond: 2 },
  cold_rain: { temperatureCelsius: 2, apparentTemperatureCelsius: 0, condition: 'rain',
    precipitationProbability: 0.8, windSpeedMetersPerSecond: 6 },
};

test('no composed outfit wears an incompatible pair while three clean ones remain', () => {
  for (const preference of ['womens', 'mens']) {
    for (const [name, weather] of Object.entries(clashDays)) {
      const { requirements, candidates } = composableForWeather(weather, {}, preference);
      const valid = collectValidOutfits(requirements, candidates);
      assert.equal(valid.status, 'composed', `${preference} ${name}`);
      assert.ok(valid.outfits.length >= 3, `${preference} ${name}`);
      assert.deepEqual([...new Set(valid.outfits.flatMap(clashesOf))], [], `${preference} ${name}`);
    }
  }
});

test('a day that dresses only in incompatible pairs keeps them rather than failing', () => {
  // At 30 C in a thunderstorm the feet must stay dry and the legs must breathe. Without chinos
  // and the rain trench the only men's bottom that goes with the one waterproof outer, a casual
  // rain jacket, and breathes is shorts, so every men's outfit wears shorts with rain boots.
  const weather = { temperatureCelsius: 30, apparentTemperatureCelsius: 30, condition: 'thunderstorm',
    precipitationProbability: 0.9, windSpeedMetersPerSecond: 2 };
  const { requirements, candidates: all } = composableForWeather(weather, {}, 'mens');
  const candidates = all.filter(({ candidateKey }) =>
    candidateKey !== 'catalog:chinos' && candidateKey !== 'catalog:rain_trench');
  const offered = composeOutfitOptions(requirements, candidates, 0);
  assert.equal(offered.status, 'composed');
  assert.ok(offered.outfits.length >= 3);
  assert.ok(offered.outfits.every((outfit) => clashesOf(outfit).length > 0));
});

test('a saved outfit wearing a pair the composer now keeps out still reads back', () => {
  const { requirements, candidates } = composableForWeather(clashDays.freezing, {}, 'womens');
  const saved = collectValidOutfits(requirements, candidates, { composesNew: false });
  assert.equal(saved.status, 'composed');
  assert.ok(saved.outfits.some((outfit) => clashesOf(outfit).includes('fleece+long_skirt')));
});

// Heat rules. A 30 C day makes breathability mandatory, and on it nothing high-thermal is worn,
// no mid layer is added, and no shoe warmer than light is worn while the feet only wish to stay
// dry; a thunderstorm, which makes dry feet mandatory, keeps its rain boots. A day that asks for
// no warmth at all, from 18 C up, wears nothing high-thermal either.
const heatDay = (temperatureCelsius, condition, precipitationProbability) => ({
  temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
  precipitationProbability, windSpeedMetersPerSecond: 2,
});
const highThermal = ['parka', 'insulated_jacket', 'coat', 'fleece', 'weather_boots'];
const typesOf = (outfits) => [...new Set(outfits.flatMap((outfit) =>
  assignedOutfitGarments(outfit).map(({ garment }) => garment.garmentTypeId)))].sort();

test('a day whose heat is mandatory wears nothing high-thermal and no mid layer', () => {
  for (const preference of ['womens', 'mens']) {
    for (const [condition, probability] of [['clear', 0], ['rain', 0.8], ['thunderstorm', 0.9]]) {
      const { requirements, candidates } = composableForWeather(heatDay(30, condition, probability), {}, preference);
      const valid = collectValidOutfits(requirements, candidates);
      const cell = `${preference} 30 C ${condition}`;
      assert.equal(valid.status, 'composed', cell);
      assert.deepEqual(typesOf(valid.outfits).filter((id) => highThermal.includes(id)), [], cell);
      assert.equal(valid.outfits.some((outfit) => outfit.midLayer !== null), false, cell);
    }
  }
});

test('hot plain rain wears no warm shoe, and its casual shoes are sandals and sneakers', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(heatDay(30, 'rain', 0.8), {}, preference);
    const valid = collectValidOutfits(requirements, candidates);
    const shoes = [...new Set(valid.outfits.map(({ footwear }) => footwear.garment.garmentTypeId))];
    assert.deepEqual(shoes.filter((id) => ['rain_boots', 'ankle_boots', 'weather_boots'].includes(id)), [], preference);
    assert.ok(shoes.includes('sandals') && shoes.includes('sneakers'), preference);
  }
});

test('a hot thunderstorm keeps the rain boots its mandatory dry feet ask for, or formal rain-ready shoes', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(heatDay(30, 'thunderstorm', 0.9), {}, preference);
    const offered = composeOutfitOptions(requirements, candidates, 0);
    assert.equal(offered.status, 'composed', preference);
    assert.ok(offered.outfits.length >= 3, preference);
    assert.ok(offered.outfits.every(({ footwear, formality }) => footwear.garment.garmentTypeId === 'rain_boots'
      || (footwear.garment.garmentTypeId === 'rain_dress_shoes' && formality === 'formal')), preference);
  }
});

test('a day that asks for no warmth wears nothing high-thermal, and a cool one still may', () => {
  for (const preference of ['womens', 'mens']) {
    for (const condition of ['clear', 'rain']) {
      const mild = composableForWeather(heatDay(20, condition, condition === 'rain' ? 0.8 : 0), {}, preference);
      const valid = collectValidOutfits(mild.requirements, mild.candidates);
      assert.equal(valid.status, 'composed', `${preference} 20 C ${condition}`);
      assert.deepEqual(typesOf(valid.outfits).filter((id) => highThermal.includes(id)), [],
        `${preference} 20 C ${condition}`);
    }
    const cool = composableForWeather(heatDay(4, 'rain', 0.8), {}, preference);
    assert.ok(typesOf(collectValidOutfits(cool.requirements, cool.candidates).outfits).includes('parka'), preference);
  }
});

test('a saved hot-day outfit in a parka over a fleece still reads back', () => {
  const { requirements, candidates } = composableForWeather(heatDay(30, 'rain', 0.8), {}, 'mens');
  const saved = collectValidOutfits(requirements, candidates, { composesNew: false });
  assert.equal(saved.status, 'composed');
  assert.ok(typesOf(saved.outfits).includes('parka'));
  assert.ok(saved.outfits.some((outfit) => outfit.midLayer !== null));
});

// The day's rotation runs only through each formality's best: whatever the seed, the offer order
// leads each formality with a draft within five points of its best. A seven-slot rotation of the
// whole list once put rain boots at the head of a dry 18 C smart offer.
test('the offer order leads each formality with a draft within five points of its best, whatever the seed', () => {
  for (const preference of ['womens', 'mens']) {
    for (const weather of [clearDay(18), clearDay(12), heatDay(4, 'rain', 0.8), heatDay(24, 'drizzle', 0.6)]) {
      const { requirements, candidates } = composableForWeather(weather, {}, preference);
      const drafts = validDrafts(readComposerDay(requirements, candidates, true));
      const best = new Map();
      for (const { formality, score } of drafts) {
        best.set(formality, Math.max(best.get(formality) ?? 0, score.score));
      }
      for (let seed = 0; seed < 40; seed += 1) {
        const order = orderForOffer(drafts, seed);
        for (const [formality, score] of best) {
          const lead = order.find((draft) => draft.formality === formality);
          assert.ok(lead.score.score >= score - 5,
            `${preference} ${weather.temperatureCelsius} C seed ${seed}: ${formality} led at ${lead.score.score}, best ${score}`);
        }
      }
    }
  }
});

// The rotation and the trio choice reach past the day's single best answer, and the band they
// reach into holds summer pieces on days that are not summer: sandals with a sweater under a
// rain jacket, a sleeveless top under a cardigan at 16 C. A day whose insulation is mandatory
// wears no sleeveless top, shorts or sandals, and a day whose body must stay dry wears no
// sandals below the 23 C rung, where warm light rain keeps them.
const summerPieces = ['sleeveless_top', 'shorts', 'sandals'];

test('a day whose warmth is mandatory wears no sleeveless top, shorts or sandals', () => {
  for (const preference of ['womens', 'mens']) {
    for (const weather of [clearDay(15), clearDay(17), heatDay(16, 'drizzle', 0.6), heatDay(10, 'rain', 0.8)]) {
      const { requirements, candidates } = composableForWeather(weather, {}, preference);
      const valid = collectValidOutfits(requirements, candidates);
      const cell = `${preference} ${weather.temperatureCelsius} C ${weather.condition}`;
      assert.equal(valid.status, 'composed', cell);
      assert.deepEqual(typesOf(valid.outfits).filter((id) => summerPieces.includes(id)), [], cell);
    }
  }
});

test('a cool wet day wears no sandals, and a warm wet or mild dry day still may', () => {
  for (const preference of ['womens', 'mens']) {
    for (const temperature of [19, 22]) {
      const { requirements, candidates } = composableForWeather(heatDay(temperature, 'rain', 0.8), {}, preference);
      const valid = collectValidOutfits(requirements, candidates);
      assert.equal(typesOf(valid.outfits).includes('sandals'), false, `${preference} ${temperature} C rain`);
    }
    for (const weather of [heatDay(24, 'rain', 0.8), heatDay(26, 'drizzle', 0.6), clearDay(22)]) {
      const { requirements, candidates } = composableForWeather(weather, {}, preference);
      assert.ok(typesOf(collectValidOutfits(requirements, candidates).outfits).includes('sandals'),
        `${preference} ${weather.temperatureCelsius} C ${weather.condition}`);
    }
  }
});

// The pair fallback lets the least bad in, so the clean drafts stay ahead of the clashing ones
// whatever they score, and it counts outfits that differ rather than drafts: three clean drafts
// that only swap a shoe would otherwise keep the clashing ones out and leave one outfit.
test('a day with too few clean drafts keeps them ahead of the clashing ones', () => {
  const requirements = clothingRequirements(
    requirement('water_protection', 'water_resistant', {
      target: 'feet', priority: 'optional', reasonCodes: Object.freeze(['condition_rain']),
    }),
  );
  const result = collectValidOutfits(requirements, ['t_shirt', 'shorts', 'rain_boots', 'sneakers']
    .map((typeId) => catalogCandidate(requirements, typeId)));
  assert.equal(result.status, 'composed');
  assert.deepEqual(result.outfits.map(({ footwear }) => footwear.garment.garmentTypeId), ['sneakers', 'rain_boots']);
});

test('clean drafts that only swap a shoe do not keep the clashing ones out of the offer', () => {
  const requirements = clothingRequirements(requirement('thermal', 'light', { priority: 'optional' }));
  const offered = composeOutfitOptions(requirements, ['t_shirt', 'fleece', 'shorts', 'sneakers', 'sandals', 'loafers']
    .map((typeId) => catalogCandidate(requirements, typeId)), 0);
  assert.equal(offered.status, 'composed');
  assert.equal(offered.outfits.length, 3);
});

// Catalog version 7 closes the rain gap of smart and formal dressers: a waterproof formal rain
// trench, a lined waterproof storm coat for cold rain and a water-resistant dress shoe, all in
// both cuts, plus chinos as a smart bottom in both cuts and knee boots for women. A wet day used
// to offer a smart or formal dresser nothing but casual outfits.
const rainDay = (temperatureCelsius, condition = 'rain', windSpeedMetersPerSecond = 3) => ({
  temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
  precipitationProbability: 0.8, windSpeedMetersPerSecond,
});

test('a rainy day offers smart and formal outfits in the rain trench and the rain-ready dress shoes', () => {
  for (const preference of ['womens', 'mens']) {
    for (const temperature of [8, 15]) {
      const cell = `${preference} ${temperature} C rain`;
      const offered = offeredForWeather(rainDay(temperature), {}, preference);
      const formalities = new Set(offered.map(({ formality }) => formality));
      assert.ok(formalities.has('smart') && formalities.has('formal'), cell);
      const { requirements, candidates } = composableForWeather(rainDay(temperature), {}, preference);
      const worn = typesOf(collectValidOutfits(requirements, candidates).outfits);
      assert.ok(worn.includes('rain_trench') && worn.includes('rain_dress_shoes'), cell);
    }
  }
});

test('cold rain wears the storm coat, and a mild day that asks no warmth never does', () => {
  for (const preference of ['womens', 'mens']) {
    const cold = composableForWeather(rainDay(4, 'rain', 9), {}, preference);
    assert.ok(typesOf(collectValidOutfits(cold.requirements, cold.candidates).outfits).includes('storm_coat'), preference);
    const mild = composableForWeather(heatDay(20, 'rain', 0.8), {}, preference);
    assert.equal(typesOf(collectValidOutfits(mild.requirements, mild.candidates).outfits).includes('storm_coat'), false, preference);
  }
});

test('chinos dress both cuts as a smart bottom, and knee boots only the women\'s', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(clearDay(15), {}, preference);
    const outfits = collectValidOutfits(requirements, candidates).outfits;
    const chinos = outfits.filter((outfit) => typesOf([outfit]).includes('chinos'));
    assert.ok(chinos.length > 0, preference);
    assert.ok(chinos.every(({ formality }) => formality !== 'formal'), preference);
    assert.equal(typesOf(outfits).includes('knee_boots'), preference === 'womens', preference);
  }
});

test('a leather jacket keeps no rain off', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(heatDay(12, 'drizzle', 0.5), {}, preference);
    assert.equal(typesOf(collectValidOutfits(requirements, candidates).outfits).includes('leather_jacket'), false, preference);
  }
});

// A suit is worn under a formal coat in the rain: the blazer is also a mid layer, but only under
// a formal outer layer, which keeps the rain off for it. Shirt, trousers, the blazer and formal
// shoes read formal as a suit, with the blazer as the outer layer or under a formal one.
const worn = (garmentTypeId) => garmentTypeId === null ? null : { garment: { garmentTypeId } };
const suit = ({ midLayer = null, outerLayer, footwear = 'closed_shoes', bottom = 'trousers' }) => ({
  body: { kind: 'separates', primaryTop: worn('shirt'), bottom: worn(bottom) },
  midLayer: worn(midLayer), outerLayer: worn(outerLayer), footwear: worn(footwear),
});

test('a suit reads formal with the blazer as the outer layer or under a formal one, in formal shoes', () => {
  for (const footwear of ['closed_shoes', 'rain_dress_shoes']) {
    assert.ok(isFormalSuit(suit({ outerLayer: 'blazer', footwear })), footwear);
    for (const outerLayer of ['coat', 'trench_coat', 'rain_trench', 'storm_coat']) {
      assert.ok(isFormalSuit(suit({ midLayer: 'blazer', outerLayer, footwear })), `${outerLayer} ${footwear}`);
    }
  }
  assert.equal(isFormalSuit(suit({ midLayer: 'blazer', outerLayer: 'rain_jacket' })), false);
  assert.equal(isFormalSuit(suit({ midLayer: 'blazer', outerLayer: null })), false);
  assert.equal(isFormalSuit(suit({ midLayer: 'blazer', outerLayer: 'coat', footwear: 'loafers' })), false);
  assert.equal(isFormalSuit(suit({ midLayer: 'blazer', outerLayer: 'coat', bottom: 'chinos' })), false);
  assert.ok(garmentFitsSlot('mid_layer', 'blazer'));
});

test('a rainy day dresses a suit under the rain trench', () => {
  for (const preference of ['womens', 'mens']) {
    const { requirements, candidates } = composableForWeather(rainDay(15), {}, preference);
    const outfits = collectValidOutfits(requirements, candidates).outfits;
    assert.ok(outfits.some((outfit) => outfit.formality === 'formal'
      && outfit.midLayer?.garment.garmentTypeId === 'blazer'
      && outfit.outerLayer?.garment.garmentTypeId === 'rain_trench'), preference);
  }
});

test('the blazer is a mid layer only under a formal outer layer', () => {
  const formalOuter = new Set(['coat', 'trench_coat', 'rain_trench', 'storm_coat']);
  for (const preference of ['womens', 'mens']) {
    for (const weather of [clearDay(10), clearDay(18), rainDay(8), rainDay(15), rainDay(4, 'rain', 9), heatDay(24, 'drizzle', 0.6)]) {
      const { requirements, candidates } = composableForWeather(weather, {}, preference);
      const cell = `${preference} ${weather.temperatureCelsius} C ${weather.condition}`;
      for (const outfit of collectValidOutfits(requirements, candidates).outfits) {
        if (outfit.midLayer?.garment.garmentTypeId === 'blazer') {
          assert.ok(formalOuter.has(outfit.outerLayer?.garment.garmentTypeId), `${cell} ${outfit.compositionKey}`);
        }
      }
    }
  }
});

// Knee boots go best with a skirt or a dress: over trousers, jeans or chinos they score three
// points less than the same outfit in ankle boots, a small preference that still leaves them
// possible there.
test('knee boots score a little less without a skirt or a dress, and stay possible with trousers', () => {
  const { requirements, candidates } = composableForWeather(clearDay(15), {}, 'womens');
  const score = (bottom, footwear) => arrangedOutfit(requirements, { primaryTop: 'blouse', bottom, footwear }).outfit.score;
  for (const bottom of ['jeans', 'trousers', 'chinos']) {
    assert.equal(score(bottom, 'ankle_boots') - score(bottom, 'knee_boots'), 3, bottom);
  }
  for (const bottom of ['skirt', 'long_skirt']) {
    assert.equal(score(bottom, 'ankle_boots'), score(bottom, 'knee_boots'), bottom);
  }
  const legs = (outfit) => outfit.body.kind === 'separates' ? outfit.body.bottom.garment.garmentTypeId : null;
  const booted = collectValidOutfits(requirements, candidates).outfits
    .filter(({ footwear }) => footwear.garment.garmentTypeId === 'knee_boots');
  assert.ok(booted.some((outfit) => ['jeans', 'trousers', 'chinos'].includes(legs(outfit))));
});

// The rain-ready dress shoes are a rainy day's dress shoes: on a day that asks no water
// protection of the feet, the ordinary dress shoes lead by more than the five-point band the
// day's rotation and Today's other two picks reach into, so a dry formal day wears them.
test('a dry day prefers the ordinary dress shoes to the rain-ready ones beyond the five-point band', () => {
  for (const weather of [clearDay(8), clearDay(14), clearDay(24)]) {
    const { requirements } = composableForWeather(weather, {}, 'mens');
    const score = (footwear) => arrangedOutfit(requirements,
      { primaryTop: 'shirt', bottom: 'trousers', outerLayer: 'blazer', footwear }).outfit.score;
    assert.ok(score('closed_shoes') - score('rain_dress_shoes') > 5, `${weather.temperatureCelsius} C`);
  }
  const { requirements } = composableForWeather(rainDay(14), {}, 'mens');
  const score = (footwear) => arrangedOutfit(requirements,
    { primaryTop: 'shirt', bottom: 'trousers', outerLayer: 'rain_trench', footwear }).outfit.score;
  assert.ok(score('rain_dress_shoes') > score('closed_shoes'));
});

// The outer layer the day's rain requires is the weather's own answer, so on a mild wet day
// that asks no warmth a light rain trench over chinos is not warmth the day did not ask for:
// every smart outfit of a 20 C rainy day carried "more warmth than the day calls for". The same
// layers on a dry day still are.
test('a mild or cool rainy day charges no over-warmth for the light outer layer its rain requires', () => {
  const layers = { primaryTop: 'blouse', bottom: 'chinos', footwear: 'loafers' };
  const wet = composableForWeather(heatDay(20, 'rain', 0.8));
  assert.equal(arrangedOutfit(wet.requirements, { ...layers, outerLayer: 'rain_trench' })
    .outfit.penaltyBreakdown.thermalOverProtection, 0);
  const dry = composableForWeather(clearDay(20));
  assert.ok(arrangedOutfit(dry.requirements, { ...layers, outerLayer: 'light_jacket' })
    .outfit.penaltyBreakdown.thermalOverProtection > 0);  // The light rung counts it the same way: a 14 C rainy day asks a little warmth, and the shirt
  // gives it.
  const shirt = { primaryTop: 'shirt', bottom: 'chinos', footwear: 'loafers' };
  const cool = composableForWeather(heatDay(14, 'rain', 0.8));
  assert.equal(arrangedOutfit(cool.requirements, { ...shirt, outerLayer: 'rain_trench' })
    .outfit.penaltyBreakdown.thermalOverProtection, 0);
  const coolDry = composableForWeather(clearDay(14));
  assert.ok(arrangedOutfit(coolDry.requirements, { ...shirt, outerLayer: 'light_jacket' })
    .outfit.penaltyBreakdown.thermalOverProtection > 0);  // Only a light layer's worth is forgiven: a parka or a storm coat is still warmth a 16 C
  // rainy day did not ask for, which kept them off it.
  const mildRain = composableForWeather(heatDay(16, 'rain', 0.8));
  for (const outerLayer of ['parka', 'storm_coat']) {
    assert.ok(arrangedOutfit(mildRain.requirements, { ...shirt, outerLayer })
      .outfit.penaltyBreakdown.thermalOverProtection > 0, outerLayer);
  }
});
