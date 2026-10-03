import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../application/recommend-outfits.ts';
import { accessoryCandidates, accessoryChanges, normalizeAccessoryEdits } from './manual-accessories.ts';
import { applySwaps } from './manual-mix.ts';
import { wornOutfitFrom, wornOutfitSchema } from './outfit-history.ts';

// Detail edit: the finishing touches become the reader's to change. A removed one leaves, an
// added one is any of the eight catalog accessories, one per accessory slot, and neither ever
// changes the outfit's weather verdict.
function day(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'manual-accessories' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}
function pick(snapshot, preference) {
  const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant: 0 });
  assert.equal(result.status, 'recommended');
  return { outfit: result.outfits[0], requirements: result.requirements };
}
const cold = pick(day(8, 'cloudy', 0.35), 'mens');
const hot = pick(day(30, 'clear', 0), 'womens');
const ids = (candidates) => candidates.map(({ garmentTypeId }) => garmentTypeId);

test('the eight catalog accessories sit in their own slots, the ones that answer the weather first', () => {
  const candidates = accessoryCandidates(cold.requirements, 'mens');
  assert.deepEqual(ids(candidates.head).sort(), ['balaclava', 'beanie', 'brimmed_hat', 'cap']);
  assert.deepEqual(ids(candidates.neck).sort(), ['neck_gaiter', 'scarf']);
  assert.deepEqual(ids(candidates.hands), ['gloves']);
  assert.deepEqual(ids(candidates.handheld), ['umbrella']);
  for (const slot of Object.keys(candidates)) {
    const flags = candidates[slot].map(({ answersToday }) => answersToday);
    assert.deepEqual(flags, [...flags].sort((left, right) => Number(right) - Number(left)), `${slot} groups answers first`);
  }
  assert.ok(candidates.head.some(({ answersToday }) => answersToday));
  assert.equal(candidates.hands[0].answersToday, true);
  assert.deepEqual(accessoryCandidates(cold.requirements, 'mens'), candidates, 'stable order');
});

test('a day that asks nothing of the head, neck, hands or rain has no group that answers it', () => {
  const candidates = accessoryCandidates(hot.requirements, 'womens');
  assert.ok(Object.values(candidates).flat().every(({ answersToday }) => !answersToday));
  assert.equal(Object.values(candidates).flat().length, 8);
});

test('taking an accessory off drops it from the outfit and leaves the rest of the pick alone', () => {
  const { outfit, requirements } = cold;
  const taken = applySwaps(outfit, {}, requirements, 'mens', { accessories: { head: null, hands: null } });
  assert.equal(taken.outfit.accessories.head, null);
  assert.equal(taken.outfit.accessories.hands, null);
  assert.equal(taken.outfit.accessories.neck, outfit.accessories.neck);
  assert.equal(taken.outfit.accessories.handheld, outfit.accessories.handheld);
  assert.deepEqual(taken.removedAccessorySlots, ['head', 'hands']);
  assert.deepEqual(taken.addedAccessorySlots, []);
  assert.deepEqual(taken.changedAccessorySlots, ['head', 'hands']);
  assert.deepEqual(taken.changedSlots, []);
  assert.equal(taken.edited, true);
  assert.equal(taken.unusual, false, 'accessories never count against the verdict');
  assert.equal(taken.outfit.body, outfit.body);
  const worn = wornOutfitFrom(taken.outfit, 'manual');
  assert.equal(wornOutfitSchema.safeParse(worn).success, true);
  assert.equal(worn.garments.head, undefined);
  assert.equal(worn.garments.hands, undefined);
  assert.equal(worn.garments.neck, 'scarf');
});

test('an accessory the reader adds is one of the catalog accessories, built like the composer builds one, and never makes the outfit unusual', () => {
  const { outfit, requirements } = hot;
  assert.ok(Object.values(outfit.accessories).every((accessory) => accessory === null));
  const added = applySwaps(outfit, {}, requirements, 'womens', { accessories: { hands: 'gloves', head: 'beanie' } });
  assert.equal(added.outfit.accessories.hands.garment.garmentTypeId, 'gloves');
  assert.equal(added.outfit.accessories.hands.slot, 'hands');
  assert.equal(added.outfit.accessories.hands.garment.source, 'catalog');
  assert.ok(Array.isArray(added.outfit.accessories.hands.evaluations));
  assert.deepEqual(added.addedAccessorySlots, ['head', 'hands']);
  assert.deepEqual(added.removedAccessorySlots, []);
  assert.equal(added.unusual, false, 'gloves and a beanie on a 30 degree day are allowed and not unusual');
  const worn = wornOutfitFrom(added.outfit, 'manual');
  assert.equal(wornOutfitSchema.safeParse(worn).success, true);
  assert.equal(worn.garments.hands, 'gloves');
  assert.equal(worn.garments.head, 'beanie');
});

test('an accessory put in place of kuyara\'s counts as one taken off and one added', () => {
  const { outfit, requirements } = cold;
  assert.equal(outfit.accessories.head.garment.garmentTypeId, 'beanie');
  const swapped = applySwaps(outfit, {}, requirements, 'mens', { accessories: { head: 'cap' } });
  assert.equal(swapped.outfit.accessories.head.garment.garmentTypeId, 'cap');
  assert.deepEqual(swapped.removedAccessorySlots, ['head']);
  assert.deepEqual(swapped.addedAccessorySlots, ['head']);
});

test('edits that change nothing are dropped, and a piece that does not fit its slot is refused', () => {
  const { outfit } = cold;
  assert.deepEqual(normalizeAccessoryEdits(outfit, { head: 'beanie' }), {}, 'kuyara\'s own piece');
  assert.deepEqual(normalizeAccessoryEdits(hot.outfit, { head: null }), {}, 'nothing to take off');
  assert.deepEqual(normalizeAccessoryEdits(outfit, { head: null, neck: 'scarf' }), { head: null });
  assert.throws(() => normalizeAccessoryEdits(outfit, { head: 'scarf' }), /slot/);
  assert.throws(() => normalizeAccessoryEdits(outfit, { handheld: 'sweater' }), /slot/);
  const same = applySwaps(outfit, {}, cold.requirements, 'mens', { accessories: { head: 'beanie', neck: 'scarf' } });
  assert.equal(same.outfit, outfit);
  assert.equal(same.edited, false);
});

test('accessory changes read the same from the outfit alone', () => {
  assert.deepEqual(accessoryChanges(cold.outfit, { head: null, handheld: 'umbrella' }), { removed: ['head'], added: [] });
  assert.deepEqual(accessoryChanges(hot.outfit, { neck: 'scarf' }), { removed: [], added: ['neck'] });
});

test('a layer edit and an accessory edit together keep the pick\'s verdict from the layers only', () => {
  const both = applySwaps(cold.outfit, { outer_layer: null }, cold.requirements, 'mens', { accessories: { neck: null } });
  const layersOnly = applySwaps(cold.outfit, { outer_layer: null }, cold.requirements, 'mens');
  assert.equal(both.unusual, layersOnly.unusual);
  assert.deepEqual(both.changedSlots, ['outer_layer']);
  assert.deepEqual(both.changedAccessorySlots, ['neck']);
});

test('a base that is already unusual stays unusual under an accessory-only edit', () => {
  const edited = applySwaps(cold.outfit, {}, cold.requirements, 'mens', { accessories: { head: null }, baseUnusual: true });
  assert.equal(edited.unusual, true);
  const none = applySwaps(cold.outfit, {}, cold.requirements, 'mens', { baseUnusual: true });
  assert.equal(none.unusual, true);
  assert.equal(none.outfit, cold.outfit);
});
