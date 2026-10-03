import assert from 'node:assert/strict';
import test from 'node:test';

import { gridRecommendationInput } from '../../../../test/recommendation-grid.mjs';
import { outfitGarments } from '../domain/manual-mix.ts';
import { wornOutfitFrom, wornOutfitSchema } from '../domain/outfit-history.ts';
import { deriveClothingRequirements } from '../domain/weather-to-clothing-requirements.ts';
import { composeAroundPieces } from './compose-around-pieces.ts';
import { useComposeAroundPieces } from './use-compose-around-pieces.ts';
import { assignComposedArchetypes, assignFallbackArchetypes, composeOutfitPool } from './recommend-outfits.ts';

// Detail: "build an outfit around a piece". Deterministic, transient, and honest about how
// many picks there are and when a chosen piece does not suit the weather.
function context(weather, preference, dressStyle = 'smart') {
  const grid = gridRecommendationInput(weather, preference, dressStyle);
  const requirements = deriveClothingRequirements(grid.snapshot, grid.now);
  return { requirements, clothingPreference: preference, dayVariant: 0, dressStyle };
}
const pin = (slot, garmentTypeId, swatchId) => ({ slot, garmentTypeId, ...(swatchId ? { swatchId } : {}) });
const worn = (option) => wornOutfitFrom(option.outfit, 'manual');

test('pieces that suit the day: every pick wears them all, each with its own label, none unusual', () => {
  const input = context('mild', 'womens');
  const result = composeAroundPieces(input, [pin('bottom', 'skirt', 'plum')]);
  assert.equal(result.status, 'composed');
  assert.ok(result.options.length >= 1 && result.options.length <= 3);
  for (const option of result.options) {
    assert.equal(outfitGarments(option.outfit).bottom, 'skirt');
    assert.equal(option.unusual, false);
    assert.deepEqual(option.pinnedSlots, ['bottom']);
    assert.deepEqual(option.pieceColors, { bottom: 'plum' });
    assert.equal(wornOutfitSchema.safeParse(worn(option)).success, true);
    assert.equal(typeof option.outfit.optionId, 'string');
  }
  assert.equal(new Set(result.options.map(({ outfit }) => outfit.archetypeId)).size, result.options.length);
});

test('a colour only paints: the same pieces choose the same outfits whatever the colour', () => {
  const input = context('mild', 'womens');
  const plain = composeAroundPieces(input, [pin('primary_top', 'sweater')]);
  const painted = composeAroundPieces(input, [pin('primary_top', 'sweater', 'lavender')]);
  assert.deepEqual(painted.options.map(({ outfit }) => outfit.optionId), plain.options.map(({ outfit }) => outfit.optionId));
  assert.deepEqual(plain.options[0].pieceColors, {});
});

test('one or two picks are labelled and returned honestly', () => {
  const input = context('mild', 'womens');
  const pins = [pin('primary_top', 'sweater'), pin('bottom', 'skirt'), pin('footwear', 'sneakers')];
  const result = composeAroundPieces(input, pins);
  assert.equal(result.status, 'composed');
  assert.ok(result.options.length >= 1 && result.options.length <= 3);
  for (const option of result.options) assert.ok(option.outfit.archetypeId);
});

test('a chosen piece the weather cannot take is swapped into the best pick, which is unusual', () => {
  const input = context('hot', 'womens');
  const result = composeAroundPieces(input, [pin('primary_top', 'sweater', 'burgundy')]);
  assert.equal(result.status, 'composed');
  assert.equal(result.options.length, 1);
  const [option] = result.options;
  assert.equal(outfitGarments(option.outfit).primary_top, 'sweater');
  assert.equal(option.unusual, true);
  assert.deepEqual(option.pinnedSlots, ['primary_top']);
  assert.deepEqual(option.pieceColors, { primary_top: 'burgundy' });
  assert.equal(wornOutfitSchema.safeParse(worn(option)).success, true);
});

test('with some pieces satisfiable the rest are swapped in and the others still hold', () => {
  const input = context('hot', 'womens');
  const result = composeAroundPieces(input, [pin('primary_top', 'sweater'), pin('bottom', 'skirt')]);
  const [option] = result.options;
  const garments = outfitGarments(option.outfit);
  assert.equal(garments.bottom, 'skirt');
  assert.equal(garments.primary_top, 'sweater');
  assert.deepEqual([...option.pinnedSlots].sort(), ['bottom', 'primary_top']);
  assert.equal(option.unusual, true);
});

test('one piece to a slot and three pieces at most', () => {
  const input = context('mild', 'womens');
  assert.throws(() => composeAroundPieces(input, [pin('bottom', 'skirt'), pin('bottom', 'jeans')]), /slot/);
  assert.throws(() => composeAroundPieces(input, [
    pin('bottom', 'skirt'), pin('primary_top', 'sweater'), pin('footwear', 'sneakers'), pin('outer_layer', 'coat'),
  ]), /three|3/);
});

test('compose never touches Today: the pool Today reads is the same before and after', () => {
  const input = context('mild', 'womens');
  const before = composeOutfitPool(input.requirements, 'womens', 0);
  composeAroundPieces(input, [pin('bottom', 'skirt')]);
  assert.deepEqual(composeOutfitPool(input.requirements, 'womens', 0), before);
});

test('labelling tolerates what Today\'s three-pick path refuses', () => {
  const input = context('mild', 'womens');
  const pool = composeOutfitPool(input.requirements, 'womens', 0);
  const [first] = pool.outfits;
  const many = Array.from({ length: 14 }, () => first);
  assert.throws(() => assignFallbackArchetypes(many, input.requirements), /Distinct/);
  const labelled = assignComposedArchetypes(many, input.requirements);
  assert.equal(labelled.length, 14);
  assert.ok(labelled.every(({ archetypeId }) => typeof archetypeId === 'string'));
  assert.equal(assignComposedArchetypes([first], input.requirements).length, 1);
  assert.deepEqual(assignComposedArchetypes([], input.requirements), []);
  // Today's own path keeps its labels.
  assert.deepEqual(
    assignFallbackArchetypes(pool.outfits.slice(0, 3), input.requirements).map(({ archetypeId }) => archetypeId),
    assignComposedArchetypes(pool.outfits.slice(0, 3), input.requirements).map(({ archetypeId }) => archetypeId));
});

test('the detail hook is exported for the route to call', () => {
  assert.equal(typeof useComposeAroundPieces, 'function');
});
