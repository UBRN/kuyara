import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../application/recommend-outfits.ts';
import { getGarmentType, listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import {
  applySwaps,
  availableCandidates,
  neighbourCandidate,
  normalizeSwaps,
  outfitCandidateSlots,
  outfitGarments,
  outfitSwappableSlots,
  slotCandidates,
} from './manual-mix.ts';
import { garmentFitsSlot } from './outfit-composition.ts';
import { wornOutfitFrom, wornOutfitSchema } from './outfit-history.ts';

// Phase 7, manual mix. Two days read against the domain: 8 degrees and cloudy with a chance
// of rain, where a T-shirt or sandals make the outfit unusual, and a mild rainy day.
function day(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul', fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'manual-mix' },
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}

function recommended(snapshot, clothingPreference) {
  const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference, dayVariant: 0 });
  assert.equal(result.status, 'recommended');
  return { outfit: result.outfits[0], requirements: result.requirements };
}

const cold = recommended(day(8, 'cloudy', 0.35), 'mens');
const mild = recommended(day(20, 'rain', 0.65), 'womens');
// Layers: a mens 16 degree dry day picks a bare shirt (no layer to take off, two free slots), and
// a womens 3 degree rainy day wears a mid layer and an outer layer with every accessory.
const bare = recommended(day(16, 'clear', 0), 'mens');
function nth(snapshot, preference, index) {
  const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant: 0 });
  return { outfit: result.outfits[index], requirements: result.requirements };
}
const layered = nth(day(3, 'rain', 0.9), 'womens', 1);
// A one-piece pick (a dress under a light jacket) and a warm day whose blazer nothing needs.
const dressed = nth(day(20, 'clear', 0), 'womens', 1);
const warmBlazer = nth(day(26, 'clear', 0), 'womens', 1);

test('every slot lists the catalog pieces that fit it, weather-suitable first, the current piece included', () => {
  for (const { outfit, requirements, preference } of [
    { ...cold, preference: 'mens' }, { ...mild, preference: 'womens' },
  ]) {
    const garments = outfitGarments(outfit);
    for (const slot of outfitSwappableSlots(outfit)) {
      const candidates = slotCandidates(outfit, slot, requirements, preference);
      const ids = candidates.map(({ garmentTypeId }) => garmentTypeId);
      assert.ok(ids.includes(garments[slot]), `${slot} keeps kuyara's own piece`);
      assert.equal(new Set(ids).size, ids.length);
      const firstOther = candidates.findIndex(({ suitable }) => !suitable);
      if (firstOther >= 0) {
        assert.ok(candidates.slice(firstOther).every(({ suitable }) => !suitable), `${slot} groups suitable first`);
      }
      // Computed once, the order is stable: the same inputs give the same order.
      assert.deepEqual(slotCandidates(outfit, slot, requirements, preference), candidates);
    }
  }
});

test('suitability is the domain validator\'s verdict on kuyara\'s pick with that one piece changed', () => {
  const slots = outfitSwappableSlots(cold.outfit);
  let sawOther = false;
  for (const slot of slots) {
    for (const { garmentTypeId, suitable } of slotCandidates(cold.outfit, slot, cold.requirements, 'mens')) {
      const changed = applySwaps(cold.outfit, { [slot]: garmentTypeId }, cold.requirements, 'mens');
      assert.equal(changed.unusual, !suitable, `${slot}=${garmentTypeId}`);
      if (!suitable) sawOther = true;
    }
  }
  assert.ok(sawOther, 'the cold day offers pieces that make the outfit unusual');
  const tops = slotCandidates(cold.outfit, 'primary_top', cold.requirements, 'mens');
  assert.equal(tops.find(({ garmentTypeId }) => garmentTypeId === 't_shirt')?.suitable, false);
  const shoes = slotCandidates(cold.outfit, 'footwear', cold.requirements, 'mens');
  assert.equal(shoes.find(({ garmentTypeId }) => garmentTypeId === 'sandals')?.suitable, false);
});

test('candidates keep the profile\'s gender applicability and come from the catalog only, never the Closet', () => {
  for (const [{ outfit, requirements }, preference] of [[cold, 'mens'], [mild, 'womens']]) {
    const catalog = new Set(listGarmentTypesForPreference(preference).map(({ typeId }) => typeId));
    for (const slot of outfitSwappableSlots(outfit)) {
      const candidates = slotCandidates(outfit, slot, requirements, preference);
      const expected = [...catalog].filter((typeId) => garmentFitsSlot(slot, typeId));
      assert.deepEqual(new Set(candidates.map(({ garmentTypeId }) => garmentTypeId)), new Set(expected), slot);
      for (const { garmentTypeId } of candidates) {
        assert.ok(getGarmentType(garmentTypeId).apparelPreferenceApplicability.includes(preference));
      }
    }
  }
  const menBottoms = slotCandidates(cold.outfit, 'bottom', cold.requirements, 'mens').map(({ garmentTypeId }) => garmentTypeId);
  assert.equal(menBottoms.includes('skirt'), false);
  assert.equal(menBottoms.includes('leggings'), false);
  const womenBottoms = slotCandidates(mild.outfit, 'bottom', mild.requirements, 'womens').map(({ garmentTypeId }) => garmentTypeId);
  assert.ok(womenBottoms.includes('skirt'));
  // Every piece of a changed outfit is a catalog projection.
  const changed = applySwaps(mild.outfit, { footwear: 'sneakers' }, mild.requirements, 'womens').outfit;
  const assigned = [changed.body.primaryTop, changed.body.bottom, changed.outerLayer, changed.footwear]
    .filter((garment) => garment !== null);
  assert.ok(assigned.every(({ garment }) => garment.source === 'catalog'));
});

test('a piece another slot is wearing is skipped, and the order never wraps', () => {
  const garments = { primary_top: 'sweater', mid_layer: 'cardigan', footwear: 'sneakers' };
  const candidates = [
    { garmentTypeId: 'shirt', suitable: true },
    { garmentTypeId: 'cardigan', suitable: true },
    { garmentTypeId: 'sweater', suitable: true },
    { garmentTypeId: 'hoodie', suitable: false },
  ];
  const available = availableCandidates(candidates, 'primary_top', garments);
  assert.deepEqual(available.map(({ garmentTypeId }) => garmentTypeId), ['shirt', 'sweater', 'hoodie']);
  assert.equal(neighbourCandidate(available, 'sweater', 1), 'hoodie');
  assert.equal(neighbourCandidate(available, 'sweater', -1), 'shirt');
  assert.equal(neighbourCandidate(available, 'hoodie', 1), null);
  assert.equal(neighbourCandidate(available, 'shirt', -1), null);
});

test('a changed outfit keeps the pick\'s identity and finishing touches, and the domain re-evaluates the rest', () => {
  const base = outfitGarments(cold.outfit);
  const changed = applySwaps(cold.outfit, { footwear: 'sandals' }, cold.requirements, 'mens');
  assert.deepEqual(changed.changedSlots, ['footwear']);
  assert.equal(changed.unusual, true);
  assert.equal(changed.outfit.optionId, cold.outfit.optionId);
  assert.equal(changed.outfit.archetypeId, cold.outfit.archetypeId);
  assert.equal(changed.outfit.accessories, cold.outfit.accessories);
  assert.deepEqual(outfitGarments(changed.outfit), { ...base, footwear: 'sandals' });
  assert.notDeepEqual(changed.outfit.requirementEvaluations, cold.outfit.requirementEvaluations);
  // Putting kuyara's piece back is no change at all.
  assert.deepEqual(normalizeSwaps(cold.outfit, { footwear: base.footwear }), {});
  const back = applySwaps(cold.outfit, { footwear: base.footwear }, cold.requirements, 'mens');
  assert.equal(back.outfit, cold.outfit);
  assert.deepEqual(back.changedSlots, []);
  assert.equal(back.unusual, false);
});

test('"Wore this today" records a changed outfit as manual under the existing schema', () => {
  const changed = applySwaps(mild.outfit, { footwear: 'sneakers' }, mild.requirements, 'womens').outfit;
  const worn = wornOutfitFrom(changed, 'manual');
  assert.equal(wornOutfitSchema.safeParse(worn).success, true);
  assert.equal(worn.source, 'manual');
  assert.equal(worn.garments.footwear, 'sneakers');
  assert.equal(worn.archetypeId, mild.outfit.archetypeId);
  assert.equal(wornOutfitFrom(mild.outfit).source, 'recommended');
});

// Phase 7b: the board's candidate strip draws as many 44-point tiles a row as the column holds,
// at most seven: two rows of seven on a 390-point phone, three rows of six on a 375-point one
// (vault phase-7b final-spec section 1, ADR 0026). Today the most any slot shows is 13 (the
// women's top), which already takes three rows on the narrower phone; a 15th candidate would
// need a third row on the wider ones too, which must be a decision, not an accident of a
// catalog addition.
const STRIP_TILES = 2 * 7;

test('no slot ever offers more candidates than the strip\'s two rows hold', () => {
  let most = 0;
  for (const preference of ['womens', 'mens']) {
    const types = listGarmentTypesForPreference(preference).map(({ typeId }) => typeId);
    for (const slot of ['primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear']) {
      const ceiling = types.filter((typeId) => garmentFitsSlot(slot, typeId)).length;
      assert.ok(ceiling <= STRIP_TILES, `${preference} ${slot} has ${ceiling} catalog candidates`);
      most = Math.max(most, ceiling);
    }
  }
  assert.equal(most, 13);
  // A small grid of days, both applicabilities: what the picker and the board receive.
  for (const preference of ['womens', 'mens']) {
    for (const temperature of [-10, 4, 10, 20, 32]) {
      for (const [condition, rain] of [['clear', 0], ['rain', 0.8], ['snow', 0.6]]) {
        const snapshot = day(temperature, condition, rain);
        const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: preference, dayVariant: 0 });
        if (result.status !== 'recommended') continue;
        for (const outfit of result.outfits) {
          const garments = outfitGarments(outfit);
          for (const slot of outfitSwappableSlots(outfit)) {
            const shown = availableCandidates(slotCandidates(outfit, slot, result.requirements, preference), slot, garments);
            assert.ok(shown.length <= STRIP_TILES, `${preference} ${slot} at ${temperature} shows ${shown.length}`);
          }
        }
      }
    }
  }
});

test('only a mid layer or an outer layer can be taken off, and only when kuyara wore one', () => {
  assert.deepEqual(normalizeSwaps(cold.outfit, { outer_layer: null }), { outer_layer: null });
  assert.deepEqual(normalizeSwaps(cold.outfit, { mid_layer: null }), {}, 'nothing to take off');
  for (const slot of ['primary_top', 'bottom', 'footwear']) {
    assert.throws(() => normalizeSwaps(cold.outfit, { [slot]: null }), /taken off/, slot);
  }
  assert.throws(() => normalizeSwaps(dressed.outfit, { one_piece: null }), /taken off/);
});

test('taking a layer off leaves the rest of the pick and every finishing touch alone', () => {
  const taken = applySwaps(layered.outfit, { outer_layer: null }, layered.requirements, 'womens');
  assert.equal(taken.outfit.outerLayer, null);
  assert.deepEqual(taken.changedSlots, ['outer_layer']);
  assert.deepEqual(taken.removedSlots, ['outer_layer']);
  assert.deepEqual(taken.addedSlots, []);
  const { outer_layer: gone, ...rest } = outfitGarments(layered.outfit);
  assert.ok(gone);
  assert.deepEqual(outfitGarments(taken.outfit), rest);
  // Nothing is dropped by itself: the neck, hands, head and umbrella stay kuyara's.
  assert.equal(taken.outfit.accessories, layered.outfit.accessories);
  assert.equal(taken.outfit.optionId, layered.outfit.optionId);
  // The weather says what it says: a parka off on a 3 degree rainy day is not suitable.
  assert.equal(taken.unusual, true);
  const both = applySwaps(layered.outfit, { outer_layer: null, mid_layer: null }, layered.requirements, 'womens');
  assert.deepEqual(both.removedSlots, ['mid_layer', 'outer_layer']);
});

test('a layer taken off on a warm day stays suitable', () => {
  assert.equal(outfitGarments(warmBlazer.outfit).outer_layer, 'blazer');
  const off = applySwaps(warmBlazer.outfit, { outer_layer: null }, warmBlazer.requirements, 'womens');
  assert.equal(off.unusual, false);
  assert.deepEqual(off.removedSlots, ['outer_layer']);
  assert.deepEqual(off.changedSlots, ['outer_layer']);
});

test('a free layer slot lists catalog candidates, weather-suitable first, and the none entry is never one', () => {
  assert.deepEqual(outfitSwappableSlots(bare.outfit), ['primary_top', 'bottom', 'footwear']);
  assert.deepEqual(outfitCandidateSlots(bare.outfit), ['primary_top', 'bottom', 'mid_layer', 'outer_layer', 'footwear']);
  for (const slot of ['mid_layer', 'outer_layer']) {
    const candidates = slotCandidates(bare.outfit, slot, bare.requirements, 'mens');
    const expected = listGarmentTypesForPreference('mens').map(({ typeId }) => typeId).filter((typeId) => garmentFitsSlot(slot, typeId));
    assert.deepEqual(new Set(candidates.map(({ garmentTypeId }) => garmentTypeId)), new Set(expected), slot);
    assert.ok(candidates.length > 0 && candidates.length <= STRIP_TILES);
    const firstOther = candidates.findIndex(({ suitable }) => !suitable);
    if (firstOther >= 0) assert.ok(candidates.slice(firstOther).every(({ suitable }) => !suitable));
    assert.deepEqual(slotCandidates(bare.outfit, slot, bare.requirements, 'mens'), candidates);
  }
  // A body slot a one-piece pick does not wear still has none.
  assert.deepEqual(slotCandidates(dressed.outfit, 'primary_top', dressed.requirements, 'womens'), []);
});

test('adding a layer to a free slot changes that slot and is judged by the domain', () => {
  const [first] = slotCandidates(bare.outfit, 'outer_layer', bare.requirements, 'mens');
  const added = applySwaps(bare.outfit, { outer_layer: first.garmentTypeId }, bare.requirements, 'mens');
  assert.deepEqual(added.changedSlots, ['outer_layer']);
  assert.deepEqual(added.addedSlots, ['outer_layer']);
  assert.deepEqual(added.removedSlots, []);
  assert.equal(outfitGarments(added.outfit).outer_layer, first.garmentTypeId);
  assert.equal(added.unusual, !first.suitable);
  assert.equal(added.outfit.outerLayer.garment.source, 'catalog');
  // A swap of a layer kuyara did wear is a change, not an addition.
  const swapped = applySwaps(cold.outfit, { outer_layer: 'coat' }, cold.requirements, 'mens');
  assert.deepEqual(swapped.addedSlots, []);
  assert.deepEqual(swapped.removedSlots, []);
  // An addition on a body slot a one-piece does not wear is refused.
  assert.deepEqual(normalizeSwaps(dressed.outfit, { primary_top: 'shirt' }), {});
});

test('a slot taken off and put back is no change, and a piece worn elsewhere is skipped for the free slot', () => {
  const back = outfitGarments(layered.outfit).outer_layer;
  assert.deepEqual(normalizeSwaps(layered.outfit, { outer_layer: back }), {});
  const garments = { primary_top: 'sweater', footwear: 'sneakers' };
  const candidates = [{ garmentTypeId: 'sweater', suitable: true }, { garmentTypeId: 'cardigan', suitable: true }];
  assert.deepEqual(availableCandidates(candidates, 'mid_layer', garments).map(({ garmentTypeId }) => garmentTypeId), ['cardigan']);
});

test('"Wore this today" records what an edited outfit shows: layers off or added, accessories as they are', () => {
  const taken = applySwaps(layered.outfit, { outer_layer: null, mid_layer: null }, layered.requirements, 'womens').outfit;
  const worn = wornOutfitFrom(taken, 'manual');
  assert.equal(wornOutfitSchema.safeParse(worn).success, true);
  assert.equal(worn.garments.outer_layer, undefined);
  assert.equal(worn.garments.mid_layer, undefined);
  assert.equal(worn.garments.umbrella, undefined);
  assert.equal(worn.garments.handheld, 'umbrella');
  const [first] = slotCandidates(bare.outfit, 'mid_layer', bare.requirements, 'mens');
  const added = wornOutfitFrom(applySwaps(bare.outfit, { mid_layer: first.garmentTypeId }, bare.requirements, 'mens').outfit, 'manual');
  assert.equal(wornOutfitSchema.safeParse(added).success, true);
  assert.equal(added.garments.mid_layer, first.garmentTypeId);
});
