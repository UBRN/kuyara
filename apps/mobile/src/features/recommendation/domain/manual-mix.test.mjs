import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../application/recommend-outfits.ts';
import { getGarmentType, listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import {
  applySwaps,
  availableCandidates,
  neighbourCandidate,
  normalizeSwaps,
  outfitGarments,
  outfitSwappableSlots,
  slotCandidates,
} from './manual-mix.ts';
import { garmentFitsSlot, wornOutfitFrom, wornOutfitSchema } from './outfit-history.ts';

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
