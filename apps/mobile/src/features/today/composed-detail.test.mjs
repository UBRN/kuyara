import assert from 'node:assert/strict';
import test from 'node:test';

import { gridRecommendationInput } from '../../../test/recommendation-grid.mjs';
import { composeAroundPieces } from '../recommendation/application/compose-around-pieces.ts';
import { recommendOutfits } from '../recommendation/application/recommend-outfits.ts';
import { deriveClothingRequirements } from '../recommendation/domain/weather-to-clothing-requirements.ts';
import { composedDetail, composeInputFor, composePiecesOf, detailShowing } from './application/composed-detail.ts';

const grid = gridRecommendationInput('mild', 'womens', 'smart');
const requirements = deriveClothingRequirements(grid.snapshot, grid.now);
const input = { requirements, clothingPreference: 'womens', dayVariant: 0, dressStyle: 'smart' };
const recommendation = recommendOutfits(grid);
const pick = recommendation.outfits[0];
const snapshot = { clothingPreference: 'womens', dressStyle: 'smart', styleAesthetics: ['minimal'], dayVariant: 0 };

// A Thursday and a Saturday in UTC, the zone these tests run in.
const thursday = Date.parse('2026-08-13T09:00:00.000Z');
const saturday = Date.parse('2026-08-15T09:00:00.000Z');

test('compose reads the day Today was built for, or nothing when that day is unknown', () => {
  assert.deepEqual(composeInputFor(snapshot, requirements, 'formal', thursday), {
    requirements, clothingPreference: 'womens', dayVariant: 0, dressStyle: 'formal', styleAesthetics: ['minimal'],
    dayKind: 'weekday',
  });
  assert.equal(composeInputFor(snapshot, requirements, null, thursday).dressStyle, 'smart');
  assert.equal(composeInputFor(null, requirements, null, thursday), null);
  assert.equal(composeInputFor(snapshot, null, null, thursday), null);
  assert.equal(composeInputFor({ ...snapshot, dayVariant: null }, requirements, null, thursday), null);
});

test('compose labels its picks for the day the reader is on, as Today does', () => {
  assert.equal(composeInputFor(snapshot, requirements, null, saturday).dayKind, 'weekend');
  assert.equal(composeInputFor(snapshot, requirements, null, thursday).dayKind, 'weekday');
});

test('the sheet lists the pick\'s drawn pieces in slot order', () => {
  const pieces = composePiecesOf(pick);
  assert.ok(pieces.length >= 3);
  assert.ok(pieces.every(({ slot, garmentTypeId }) => typeof slot === 'string' && typeof garmentTypeId === 'string'));
  assert.equal(pieces.at(-1).slot, 'footwear');
});

test('a composed option counts changes against itself: an unpinned piece is not "changed" for differing from the pick', () => {
  const [option] = composeAroundPieces(input, [
    { slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'plum' },
    { slot: 'footwear', garmentTypeId: composePiecesOf(pick).at(-1).garmentTypeId, swatchId: 'black' },
  ]).options;
  const detail = composedDetail(option, [], []);
  assert.equal(detail.outfit, option.outfit);
  assert.deepEqual(detail.pinnedSlots, ['bottom', 'footwear']);
  assert.deepEqual(detail.pieceColors, { bottom: 'plum', footwear: 'black' });
  assert.deepEqual(detail.changedSlots, []);
});

test('the reader\'s later edits are the changes, a pinned piece changed there losing its colour and "your choice"', () => {
  const [option] = composeAroundPieces(input, [{ slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'plum' }]).options;
  const detail = composedDetail(option, ['bottom'], ['neck']);
  assert.deepEqual(detail.changedSlots, ['bottom', 'neck']);
  assert.deepEqual(detail.pinnedSlots, []);
  assert.deepEqual(detail.pieceColors, {});
});

const composedOption = composeAroundPieces(input, [{ slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'plum' }]).options[0];
const mixOf = (outfit, parts = {}) => ({ outfit, edited: false, changedSlots: [], changedAccessorySlots: [], ...parts });

test('kuyara\'s pick shows as recommended until the reader changes it', () => {
  const showing = detailShowing(pick, null, mixOf(pick), pick.optionId);
  assert.equal(showing.composed, null);
  assert.equal(showing.manual, null);
  assert.equal(showing.changedOutfit, null);
  assert.equal(showing.worn.source, 'recommended');
  assert.equal(detailShowing(null, null, null, undefined).worn, null);
});

test('a composed result with no edits is the reader\'s own and records as manual', () => {
  const showing = detailShowing(pick, composedOption, mixOf(composedOption.outfit), pick.optionId);
  assert.equal(showing.changedOutfit, composedOption.outfit);
  assert.equal(showing.worn.source, 'manual');
  assert.deepEqual(showing.manual, {
    optionId: pick.optionId,
    outfit: composedOption.outfit,
    original: composedOption.outfit,
    changedSlots: [],
    pieceColors: composedOption.pieceColors,
  });
  assert.deepEqual(showing.composed.pinnedSlots, ['bottom']);
});

test('a finishing touch alone makes the outfit the reader\'s, counted against kuyara\'s pick', () => {
  const showing = detailShowing(pick, null, mixOf(pick, { edited: true, changedAccessorySlots: ['neck'] }), pick.optionId);
  assert.equal(showing.changedOutfit, pick);
  assert.equal(showing.worn.source, 'manual');
  assert.deepEqual(showing.manual.changedSlots, ['neck']);
  assert.equal(showing.manual.original, undefined);
  assert.equal(showing.composed, null);
});

test('a reset keeps the pick as the worn source and draws nothing changed', () => {
  const reset = detailShowing(pick, null, mixOf(pick, { changedSlots: ['bottom'] }), pick.optionId);
  assert.equal(reset.manual, null);
  assert.equal(reset.worn.source, 'recommended');
  assert.equal(detailShowing(pick, null, mixOf(pick, { edited: true }), undefined).manual, null);
});
