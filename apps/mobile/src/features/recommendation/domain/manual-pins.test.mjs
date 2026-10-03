import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../application/recommend-outfits.ts';
import { outfitGarments, pinPieces } from './manual-mix.ts';
import { garmentFitsSlot, wornOutfitFrom, wornOutfitSchema } from './outfit-history.ts';

// Pins that fit no valid outfit are swapped into the best pick: the weather judges the result
// (unusual) and the worn record still has to accept it, so every garment appears once and the
// body is either one piece or a top with a bottom.
function day(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'manual-pins' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}
function nth(snapshot, preference, index) {
  const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant: 0 });
  return { outfit: { ...result.outfits[index] }, requirements: result.requirements };
}
const pin = (slot, garmentTypeId) => ({ slot, garmentTypeId });
const worn = (outfit) => wornOutfitFrom(outfit, 'manual');

const separates = nth(day(28, 'clear', 0), 'womens', 0);
const dressed = nth(day(20, 'clear', 0), 'womens', 1);
const bare = nth(day(16, 'clear', 0), 'mens', 0);

test('a top pin in a one-piece pick takes the one piece out and finds the best bottom', () => {
  const result = pinPieces(dressed.outfit, [pin('primary_top', 'sweater')], dressed.requirements, 'womens');
  const garments = outfitGarments(result.outfit);
  assert.equal(garments.one_piece, undefined);
  assert.equal(garments.primary_top, 'sweater');
  assert.ok(garments.bottom, 'the missing half of the body is filled from the catalog');
  assert.deepEqual(result.appliedPins, [pin('primary_top', 'sweater')]);
  assert.equal(typeof result.unusual, 'boolean');
  assert.equal(wornOutfitSchema.safeParse(worn(result.outfit)).success, true);
  assert.equal(result.outfit.optionId, dressed.outfit.optionId);
});

test('a bottom pin in a one-piece pick fills the top', () => {
  const result = pinPieces(dressed.outfit, [pin('bottom', 'jeans')], dressed.requirements, 'womens');
  const garments = outfitGarments(result.outfit);
  assert.equal(garments.one_piece, undefined);
  assert.equal(garments.bottom, 'jeans');
  assert.ok(garments.primary_top);
  assert.equal(wornOutfitSchema.safeParse(worn(result.outfit)).success, true);
});

test('a one-piece pin takes the top and the bottom out', () => {
  const result = pinPieces(separates.outfit, [pin('one_piece', 'knit_dress')], separates.requirements, 'womens');
  const garments = outfitGarments(result.outfit);
  assert.equal(garments.one_piece, 'knit_dress');
  assert.equal(garments.primary_top, undefined);
  assert.equal(garments.bottom, undefined);
  assert.equal(result.unusual, true, 'a knit dress at 28 degrees is not what the day asks for');
  assert.equal(wornOutfitSchema.safeParse(worn(result.outfit)).success, true);
});

test('a layer pin takes the free layer slot, the addition path', () => {
  const result = pinPieces(bare.outfit, [pin('outer_layer', 'coat')], bare.requirements, 'mens');
  assert.equal(outfitGarments(result.outfit).outer_layer, 'coat');
  assert.equal(result.outfit.outerLayer.garment.source, 'catalog');
  assert.deepEqual(result.appliedPins, [pin('outer_layer', 'coat')]);
});

test('a pin whose garment another slot wears moves that slot on, so no garment is worn twice', () => {
  let found = null;
  for (const [temperature, condition, rain] of [[14, 'clear', 0], [10, 'clear', 0], [6, 'rain', 0.8], [18, 'clear', 0]]) {
    const snapshot = day(temperature, condition, rain);
    const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: 'womens', dayVariant: 0 });
    const outfit = result.outfits.find((candidate) => candidate.body.kind === 'separates'
      && garmentFitsSlot('mid_layer', candidate.body.primaryTop.garment.garmentTypeId));
    if (outfit) { found = { outfit, requirements: result.requirements }; break; }
  }
  assert.ok(found, 'a pick whose top could also be a mid layer');
  const target = outfitGarments(found.outfit).primary_top;
  const result = pinPieces(found.outfit, [pin('mid_layer', target)], found.requirements, 'womens');
  const after = outfitGarments(result.outfit);
  assert.equal(after.mid_layer, target);
  assert.notEqual(after.primary_top, target);
  const ids = Object.values(after);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(wornOutfitSchema.safeParse(worn(result.outfit)).success, true);
});

test('an earlier pin wins over a later one that cannot sit with it, and only applied pins are reported', () => {
  const result = pinPieces(separates.outfit, [pin('one_piece', 'dress'), pin('primary_top', 'sweater')],
    separates.requirements, 'womens');
  const garments = outfitGarments(result.outfit);
  assert.equal(garments.one_piece, 'dress');
  assert.equal(garments.primary_top, undefined);
  assert.deepEqual(result.appliedPins, [pin('one_piece', 'dress')]);
});

test('pins the pick already wears are applied as they are', () => {
  const garments = outfitGarments(separates.outfit);
  const pins = [pin('primary_top', garments.primary_top), pin('footwear', garments.footwear)];
  const result = pinPieces(separates.outfit, pins, separates.requirements, 'womens');
  assert.deepEqual(outfitGarments(result.outfit), garments);
  assert.deepEqual(result.appliedPins, pins);
  assert.equal(result.unusual, false);
});

test('the pick\'s finishing touches stay', () => {
  const cold = nth(day(3, 'rain', 0.9), 'womens', 0);
  const result = pinPieces(cold.outfit, [pin('bottom', 'shorts')], cold.requirements, 'womens');
  assert.equal(result.outfit.accessories, cold.outfit.accessories);
  assert.equal(result.unusual, true);
});
