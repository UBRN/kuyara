import assert from 'node:assert/strict';
import test from 'node:test';

import { gridRecommendationInput } from '../../../../test/recommendation-grid.mjs';
import { listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import { evaluateGarmentEligibility, projectCatalogEffectiveGarment } from './garment-eligibility.ts';
import {
  assignedOutfitGarments,
  composeOutfitOptions,
  composeOutfitsAroundPins,
  composedOptionLimit,
  offeredAccessoriesBySlot,
  outfitWearsPins,
} from './outfit-composition.ts';
import { wornOutfitFrom } from './outfit-history.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';

// Compose around the pieces a person chose (detail edit). The pin is a
// predicate on the full valid set, slot-bound, and the offer is three at the most.
function day(weather, preference) {
  const input = gridRecommendationInput(weather, preference, 'smart');
  const requirements = deriveClothingRequirements(input.snapshot, input.now);
  const candidates = listGarmentTypesForPreference(preference).map(({ typeId }) =>
    evaluateGarmentEligibility(requirements, projectCatalogEffectiveGarment(typeId, preference)));
  return { requirements, candidates };
}
const pin = (slot, garmentTypeId) => ({ slot, garmentTypeId });
const wearing = (outfit, slot) => assignedOutfitGarments(outfit).find((piece) => piece.slot === slot)?.garment.garmentTypeId;

test('no pin leaves the offer exactly as Today composes it', () => {
  const { requirements, candidates } = day('mild', 'womens');
  assert.deepEqual(composeOutfitOptions(requirements, candidates, 0, [], []),
    composeOutfitOptions(requirements, candidates, 0));
});

test('a pin is a predicate on the full valid set, not on the 24 Today offers', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const today = composeOutfitOptions(requirements, candidates, 0);
  const pinned = composeOutfitOptions(requirements, candidates, 0, [], [pin('bottom', 'skirt')]);
  assert.equal(pinned.status, 'composed');
  assert.ok(pinned.outfits.length >= 1 && pinned.outfits.length <= composedOptionLimit);
  assert.ok(pinned.outfits.every((outfit) => wearing(outfit, 'bottom') === 'skirt'));
  const offered = new Set(today.outfits.map(({ compositionKey }) => compositionKey));
  assert.ok(pinned.outfits.some(({ compositionKey }) => !offered.has(compositionKey)),
    'filtering the 24 would have missed some of these');
});

test('a pin is bound to its slot: a sweater is a top pin or a mid layer pin, never both readings', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const top = composeOutfitOptions(requirements, candidates, 0, [], [pin('primary_top', 'sweater')]);
  const mid = composeOutfitOptions(requirements, candidates, 0, [], [pin('mid_layer', 'sweater')]);
  assert.ok(top.outfits.length > 0 && top.outfits.every((outfit) => wearing(outfit, 'primary_top') === 'sweater'));
  assert.ok(mid.outfits.length > 0 && mid.outfits.every((outfit) => wearing(outfit, 'mid_layer') === 'sweater'));
  assert.ok(mid.outfits.every((outfit) => wearing(outfit, 'primary_top') !== 'sweater'));
});

test('several pins are all worn together, three picks at most, each meaningfully different', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const pins = [pin('primary_top', 'sweater'), pin('bottom', 'skirt'), pin('footwear', 'sneakers')];
  const result = composeOutfitOptions(requirements, candidates, 0, [], pins);
  assert.ok(result.outfits.length >= 1 && result.outfits.length <= 3);
  assert.ok(result.outfits.every((outfit) => outfitWearsPins(outfit, pins)));
  assert.equal(new Set(result.outfits.map(({ compositionKey }) => compositionKey)).size, result.outfits.length);
});

test('the reader\'s pieces always show: the recently worn exclusion does not apply', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const pins = [pin('bottom', 'skirt')];
  const first = composeOutfitOptions(requirements, candidates, 0, [], pins).outfits;
  const recentWorn = first.map((outfit) => wornOutfitFrom({ ...outfit, archetypeId: 'everyday_easy' }));
  const again = composeOutfitOptions(requirements, candidates, 0, recentWorn, pins).outfits;
  assert.deepEqual(again.map(({ compositionKey }) => compositionKey), first.map(({ compositionKey }) => compositionKey));
});

test('the picks carry the day\'s accessories like any offered outfit', () => {
  const { requirements, candidates } = day('cold_rain', 'womens');
  const result = composeOutfitOptions(requirements, candidates, 0, [], [pin('primary_top', 'sweater')]);
  assert.ok(result.outfits.every((outfit) => outfit.accessories.handheld?.garment.garmentTypeId === 'umbrella'));
});

test('fewer than three are returned honestly when that is all that differs', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const pins = [pin('primary_top', 'sweater'), pin('bottom', 'skirt'), pin('footwear', 'sneakers'), pin('outer_layer', 'light_jacket')];
  const result = composeOutfitOptions(requirements, candidates, 0, [], pins);
  assert.equal(result.status, 'composed');
  assert.ok(result.outfits.length <= 2, `${result.outfits.length} picks`);
});

test('pins no valid outfit wears together fall back to the largest satisfiable set, earlier pins first', () => {
  const { requirements, candidates } = day('hot', 'womens');
  const sweater = pin('primary_top', 'sweater');
  const skirt = pin('bottom', 'skirt');
  const around = composeOutfitsAroundPins(requirements, candidates, 0, [sweater, skirt]);
  assert.equal(around.status, 'composed');
  assert.deepEqual(around.satisfiedPins, [skirt]);
  assert.deepEqual(around.unsatisfiedPins, [sweater]);
  assert.ok(around.outfits.length >= 1 && around.outfits.length <= 3);
  assert.ok(around.outfits.every((outfit) => wearing(outfit, 'bottom') === 'skirt'));

  const sweaterOnly = composeOutfitsAroundPins(requirements, candidates, 0, [sweater]);
  assert.deepEqual(sweaterOnly.satisfiedPins, []);
  assert.deepEqual(sweaterOnly.unsatisfiedPins, [sweater]);
});

test('two pins that fit alone but never together keep the earlier one', () => {
  const { requirements, candidates } = day('mild', 'womens');
  const dress = pin('one_piece', 'dress');
  const sweater = pin('primary_top', 'sweater');
  for (const [first, second] of [[dress, sweater], [sweater, dress]]) {
    const around = composeOutfitsAroundPins(requirements, candidates, 0, [first, second]);
    assert.deepEqual(around.satisfiedPins, [first]);
    assert.deepEqual(around.unsatisfiedPins, [second]);
  }
});

test('with every pin met nothing is left over', () => {
  const { requirements, candidates } = day('mild', 'mens');
  const pins = [pin('primary_top', 'sweater'), pin('bottom', 'jeans')];
  const around = composeOutfitsAroundPins(requirements, candidates, 0, pins);
  assert.deepEqual(around.satisfiedPins, pins);
  assert.deepEqual(around.unsatisfiedPins, []);
});

test('a day that composes nothing fails as it does for Today, pins or not', () => {
  const { requirements } = day('mild', 'womens');
  const failure = composeOutfitsAroundPins(requirements, [], 0, [pin('bottom', 'skirt')]);
  assert.equal(failure.status, 'failure');
  assert.deepEqual(composeOutfitOptions(requirements, [], 0, [], [pin('bottom', 'skirt')]), failure);
});

test('the accessories that answer today are offered per slot, and none on a day that asks nothing', () => {
  const cold = day('freezing', 'womens');
  const coldOffered = offeredAccessoriesBySlot(cold.candidates);
  assert.deepEqual(Object.keys(coldOffered).sort(), ['handheld', 'hands', 'head', 'neck']);
  assert.ok(coldOffered.head.length > 0 && coldOffered.hands.length > 0);
  for (const [slot, results] of Object.entries(coldOffered)) {
    for (const { garment } of results) {
      assert.equal(garment.properties.category, 'accessory');
      assert.equal(garment.properties.bodyRegion, { head: 'head', neck: 'neck', hands: 'hands', handheld: null }[slot]);
    }
  }
  const mild = offeredAccessoriesBySlot(day('mild', 'womens').candidates);
  assert.ok(Object.values(mild).every((results) => results.length === 0));
});
