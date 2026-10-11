import assert from 'node:assert/strict';
import test from 'node:test';

import { listGarmentTypesForPreference } from '../../catalog/domain/garment-catalog.ts';
import { onboardingPreviewOutfits, onboardingStyledOutfit, onboardingUnisexOutfit } from './onboarding-preview.ts';

const observedAt = '2026-07-15T10:00:00.000Z';

function hour(at, temperatureCelsius, condition, precipitationProbability) {
  return {
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition,
    precipitationProbability,
    windSpeedMetersPerSecond: 2,
    humidity: 0.5,
    uvIndex: 3,
    ...at,
  };
}

function weather(temperature, condition = 'clear', precipitationProbability = 0) {
  const start = Date.parse(observedAt);
  return {
    id: `weather-${temperature}-${condition}`,
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: observedAt,
    origin: { kind: 'sample', sourceId: 'onboarding-preview-test' },
    current: hour({ observedAt }, temperature, condition, precipitationProbability),
    minimumTemperatureCelsius: temperature - 1,
    maximumTemperatureCelsius: temperature + 1,
    hourly: Array.from({ length: 24 }, (_, index) => hour(
      { forecastAt: new Date(start + (index + 1) * 3600000).toISOString() },
      temperature, condition, precipitationProbability)),
  };
}

const hot = weather(32);
const mild = weather(14, 'cloudy');
const cold = weather(-3, 'cloudy');
const rain = weather(12, 'rain', 0.9);
const genders = ['woman', 'man'];
const dressStyles = ['casual', 'smart', 'formal'];

const garments = (pieces) => pieces.map(({ garmentTypeId }) => garmentTypeId);
const outfit = (day, gender, dressStyle) => onboardingPreviewOutfits(day)[gender][dressStyle];
const each = (check) => genders.forEach((gender) => dressStyles.forEach((style) => check(gender, style)));
const warmLayers = ['coat', 'trench_coat', 'insulated_jacket', 'sweater', 'fleece', 'light_jacket', 'rain_jacket'];

test('a hot day draws no warm layer and dresses casual for the heat', () => {
  each((gender, style) => {
    assert.ok(!garments(outfit(hot, gender, style)).some((id) => warmLayers.includes(id)), `${gender} ${style}`);
  });
  assert.deepEqual(garments(outfit(hot, 'woman', 'casual')), ['t_shirt', 'shorts', 'sandals']);
});

test('a cold day puts a warm outer layer and closed footwear on every preview', () => {
  each((gender, style) => {
    const pieces = outfit(cold, gender, style);
    assert.ok(['coat', 'insulated_jacket'].includes(pieces.find(({ slot }) => slot === 'outer_layer')?.garmentTypeId),
      `${gender} ${style}`);
    assert.ok(!['sandals', 'ballet_flats'].includes(pieces.find(({ slot }) => slot === 'footwear').garmentTypeId));
  });
});

test('a rainy day draws a rain shell and rain boots', () => {
  each((gender, style) => {
    const ids = garments(outfit(rain, gender, style));
    assert.ok(ids.includes('rain_jacket') && ids.includes('rain_boots'), `${gender} ${style}`);
  });
});

test('every gender tap and every dress style tap changes the board, whatever the day', () => {
  for (const day of [hot, mild, cold, rain]) {
    for (const style of dressStyles) {
      assert.notDeepEqual(outfit(day, 'woman', style), outfit(day, 'man', style), `${day.id} ${style}`);
    }
    for (const gender of genders) {
      const keys = dressStyles.map((style) => garments(outfit(day, gender, style)).join(','));
      assert.equal(new Set(keys).size, 3, `${day.id} ${gender}`);
    }
  }
});

test('the dress style leads with its own formality where the day offers it', () => {
  assert.deepEqual(garments(outfit(hot, 'woman', 'formal')), ['dress', 'closed_shoes']);
  assert.deepEqual(garments(outfit(mild, 'woman', 'formal')), ['shirt', 'trousers', 'blazer', 'closed_shoes']);
  assert.deepEqual(garments(outfit(cold, 'man', 'smart')).at(-2), 'coat');
});

test('the same weather always draws the same outfits, as board-ready pieces', () => {
  assert.deepEqual(onboardingPreviewOutfits(mild), onboardingPreviewOutfits(mild));
  for (const piece of outfit(mild, 'woman', 'formal')) {
    assert.deepEqual(Object.keys(piece).sort(), ['category', 'garmentTypeId', 'slot']);
  }
});

// Before a gender is chosen the board draws one outfit for anyone: on the place's weather it is
// a casual outfit the rules offer whose every type both catalogs carry, drawn in the men's
// straight cut, so a hot day draws no coat even before the gender question.
test('before a gender is chosen the place draws a rule outfit both catalogs carry', () => {
  const mens = new Set(listGarmentTypesForPreference('mens').map(({ typeId }) => typeId));
  const both = new Set(listGarmentTypesForPreference('womens').map(({ typeId }) => typeId).filter((id) => mens.has(id)));
  for (const day of [hot, mild, cold, rain]) {
    const pieces = onboardingUnisexOutfit(day);
    assert.ok(pieces, day.id);
    assert.ok(pieces.every(({ garmentTypeId }) => both.has(garmentTypeId)), `${day.id} ${garments(pieces)}`);
    assert.deepEqual(pieces, onboardingUnisexOutfit(day));
  }
  assert.ok(!garments(onboardingUnisexOutfit(hot)).some((id) => warmLayers.includes(id)));
});

// The styles step shows what a style choice does: the outfit the rules put first for the chosen
// gender and dress style once the chosen styles reorder them. Styles reorder and never remove,
// so with no style chosen it is the rules' own first outfit, and some style moves another first.
test('chosen styles put the outfit the rules rank first in those styles on the board', () => {
  const styles = ['minimal', 'classic', 'sporty', 'streetwear', 'relaxed'];
  let reordered = 0;
  for (const day of [hot, mild, cold, rain]) {
    for (const gender of genders) {
      for (const dressStyle of dressStyles) {
        const plain = garments(onboardingStyledOutfit(day, gender, dressStyle, [])).join(',');
        for (const style of styles) {
          const styled = onboardingStyledOutfit(day, gender, dressStyle, [style]);
          assert.ok(styled, `${day.id} ${gender} ${dressStyle} ${style}`);
          if (garments(styled).join(',') !== plain) reordered += 1;
        }
      }
    }
  }
  assert.ok(reordered > 0);
  assert.deepEqual(onboardingStyledOutfit(mild, 'man', 'smart', ['sporty']), onboardingStyledOutfit(mild, 'man', 'smart', ['sporty']));
});
