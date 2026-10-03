import assert from 'node:assert/strict';
import test from 'node:test';

import { gridRecommendationInput } from '../../../test/recommendation-grid.mjs';
import { composeAroundPieces } from '../recommendation/application/compose-around-pieces.ts';
import { recommendOutfits } from '../recommendation/application/recommend-outfits.ts';
import { deriveClothingRequirements } from '../recommendation/domain/weather-to-clothing-requirements.ts';
import { composedDetail, composeInputFor, composePiecesOf } from './application/composed-detail.ts';

const grid = gridRecommendationInput('mild', 'womens', 'smart');
const requirements = deriveClothingRequirements(grid.snapshot, grid.now);
const input = { requirements, clothingPreference: 'womens', dayVariant: 0, dressStyle: 'smart' };
const recommendation = recommendOutfits(grid);
const pick = recommendation.outfits[0];
const snapshot = { clothingPreference: 'womens', dressStyle: 'smart', styleAesthetics: ['minimal'], dayVariant: 0 };

test('compose reads the day Today was built for, or nothing when that day is unknown', () => {
  assert.deepEqual(composeInputFor(snapshot, requirements, 'formal'), {
    requirements, clothingPreference: 'womens', dayVariant: 0, dressStyle: 'formal', styleAesthetics: ['minimal'],
  });
  assert.equal(composeInputFor(snapshot, requirements, null).dressStyle, 'smart');
  assert.equal(composeInputFor(null, requirements, null), null);
  assert.equal(composeInputFor(snapshot, null, null), null);
  assert.equal(composeInputFor({ ...snapshot, dayVariant: null }, requirements, null), null);
  assert.equal(composeInputFor({ ...snapshot, clothingPreference: 'unknown' }, requirements, null), null);
});

test('the sheet lists the pick\'s drawn pieces in slot order', () => {
  const pieces = composePiecesOf(pick);
  assert.ok(pieces.length >= 3);
  assert.ok(pieces.every(({ slot, garmentTypeId }) => typeof slot === 'string' && typeof garmentTypeId === 'string'));
  assert.equal(pieces.at(-1).slot, 'footwear');
});

test('a composed option is changed wherever it differs from the pick, and wherever a colour was chosen', () => {
  const [option] = composeAroundPieces(input, [
    { slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'plum' },
    { slot: 'footwear', garmentTypeId: composePiecesOf(pick).at(-1).garmentTypeId, swatchId: 'black' },
  ]).options;
  const detail = composedDetail(pick, option.outfit, option, []);
  assert.deepEqual(detail.pinnedSlots, ['bottom', 'footwear']);
  assert.deepEqual(detail.pieceColors, { bottom: 'plum', footwear: 'black' });
  // The footwear may be the pick's own, yet its chosen colour makes it the reader's.
  assert.ok(detail.changedSlots.includes('bottom'));
  assert.ok(detail.changedSlots.includes('footwear'));
});

test('a pinned piece the reader then changed is no longer theirs to colour or call "your choice"', () => {
  const [option] = composeAroundPieces(input, [{ slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'plum' }]).options;
  const detail = composedDetail(pick, option.outfit, option, ['bottom']);
  assert.deepEqual(detail.pinnedSlots, []);
  assert.deepEqual(detail.pieceColors, {});
});
