import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from './recommend-outfits.ts';
import {
  NO_MANUAL_EDITS,
  withAccessoriesPutBack,
  withAccessory,
  withAccessoryOff,
  withLayerOff,
  withPiece,
} from './manual-edit-state.ts';

function day(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'manual-edit-state' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}
function pick(snapshot, preference) {
  return recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant: 0 }).outfits[0];
}
// 8 degrees, mens: trench coat over a shirt with a beanie, scarf, gloves and an umbrella.
const cold = pick(day(8, 'cloudy', 0.35), 'mens');
// 30 degrees, womens: no layer and no finishing touch.
const hot = pick(day(30, 'clear', 0), 'womens');

test('a layer taken off, and a piece put back, leave only what differs from kuyara\'s pick', () => {
  const off = withLayerOff(cold, NO_MANUAL_EDITS, 'outer_layer');
  assert.deepEqual(off.swaps, { outer_layer: null });
  assert.deepEqual(withPiece(cold, off, 'outer_layer', 'trench_coat').swaps, {}, 'kuyara\'s own piece again');
  assert.deepEqual(withPiece(cold, off, 'outer_layer', 'coat').swaps, { outer_layer: 'coat' });
  assert.deepEqual(withLayerOff(cold, NO_MANUAL_EDITS, 'mid_layer').swaps, {}, 'a layer kuyara did not wear');
  assert.deepEqual(withPiece(hot, NO_MANUAL_EDITS, 'mid_layer', 'sweater').swaps, { mid_layer: 'sweater' });
});

test('taking an accessory off removes kuyara\'s, and taking an added one off is never adding it', () => {
  const off = withAccessoryOff(cold, NO_MANUAL_EDITS, 'head');
  assert.deepEqual(off.accessories, { head: null });
  const added = withAccessory(hot, NO_MANUAL_EDITS, 'head', 'cap');
  assert.deepEqual(added.accessories, { head: 'cap' });
  assert.deepEqual(withAccessoryOff(hot, added, 'head').accessories, {});
  // An added accessory in a slot kuyara filled and the reader emptied goes back to empty, not to kuyara's.
  const replaced = withAccessory(cold, off, 'head', 'cap');
  assert.deepEqual(replaced.accessories, { head: 'cap' });
  assert.deepEqual(withAccessoryOff(cold, replaced, 'head').accessories, { head: null });
});

test('putting back gives kuyara\'s finishing touches again and keeps what the reader added', () => {
  let edits = NO_MANUAL_EDITS;
  edits = withAccessoryOff(cold, edits, 'head');
  edits = withAccessoryOff(cold, edits, 'neck');
  edits = withAccessory(cold, edits, 'neck', 'neck_gaiter');
  assert.deepEqual(edits.accessories, { head: null, neck: 'neck_gaiter' });
  assert.deepEqual(withAccessoriesPutBack(cold, edits).accessories, {});
  const mixed = withAccessory(hot, withAccessoriesPutBack(hot, NO_MANUAL_EDITS), 'hands', 'gloves');
  assert.deepEqual(withAccessoriesPutBack(hot, mixed).accessories, { hands: 'gloves' });
});

test('edits of one kind never disturb the other', () => {
  const edits = withAccessoryOff(cold, withLayerOff(cold, NO_MANUAL_EDITS, 'outer_layer'), 'handheld');
  assert.deepEqual(edits, { swaps: { outer_layer: null }, accessories: { handheld: null } });
  assert.deepEqual(withAccessoriesPutBack(cold, edits).swaps, { outer_layer: null });
});
