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

test('a rainy day draws a rain shell and waterproof boots', () => {
  each((gender, style) => {
    const ids = garments(outfit(rain, gender, style));
    assert.ok(['rain_jacket', 'parka'].some((shell) => ids.includes(shell)) &&
      ['rain_boots', 'weather_boots'].some((boots) => ids.includes(boots)), `${gender} ${style}`);
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

// Styles reorder outfits within the dress style's formality and never remove one, so the rules'
// first outfit rarely moves when a style is tapped. The styles step shows what a tap does
// instead: an outfit in the chosen styles, the first in the order they give, that is not the one
// already on the plate. With no style chosen, or none of the day's outfits in those styles,
// nothing replaces the plate's outfit.
test('a style tap shows an outfit in the chosen styles that is not the one on the plate', () => {
  const styles = ['minimal', 'classic', 'sporty', 'streetwear', 'relaxed'];
  const partlyCloudy = weather(22, 'partly_cloudy', 0.1);
  let answered = 0;
  let taps = 0;
  for (const day of [hot, mild, cold, rain, partlyCloudy]) {
    for (const gender of genders) {
      for (const dressStyle of dressStyles) {
        const shown = outfit(day, gender, dressStyle);
        assert.equal(onboardingStyledOutfit(day, gender, dressStyle, [], shown), null);
        for (const style of styles) {
          taps += 1;
          const next = onboardingStyledOutfit(day, gender, dressStyle, [style], shown);
          if (!next) continue;
          answered += 1;
          assert.notDeepEqual(garments(next), garments(shown), `${day.id} ${gender} ${dressStyle} ${style}`);
          assert.deepEqual(next, onboardingStyledOutfit(day, gender, dressStyle, [style], shown));
        }
      }
    }
  }
  // The tour's day: a smart man on a 22 degree partly cloudy day sees Minimal and Sporty answer.
  for (const style of ['minimal', 'sporty']) {
    assert.ok(onboardingStyledOutfit(partlyCloudy, 'man', 'smart', [style], outfit(partlyCloudy, 'man', 'smart')), style);
  }
  assert.ok(answered > taps * 0.8, `${answered} of ${taps}`);
});
