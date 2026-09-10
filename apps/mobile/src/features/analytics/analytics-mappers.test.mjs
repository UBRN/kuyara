import assert from 'node:assert/strict';
import test from 'node:test';

import { failureCategories } from '@/domain/failure-category';
import { weatherConditionCodes } from '@/features/weather/domain/weather';

import {
  ageBucketProperty,
  aiProbeResultProperty,
  conditionCategory,
  countBucket,
  dressStyleProperty,
  failureCategoryProperty,
  generationModeProperty,
  locationChangedMethodProperty,
  onboardingLocationMethodProperty,
  triggerReasonProperty,
} from './domain/analytics-mappers.ts';

test('every failure category maps to a snake_case property', () => {
  assert.deepEqual(
    failureCategories.map(failureCategoryProperty),
    ['offline', 'unavailable', 'rate_limited', 'unknown'],
  );
});

test('every generation mode maps to a snake_case property', () => {
  assert.equal(generationModeProperty('ai-assisted'), 'ai_assisted');
  assert.equal(
    generationModeProperty('deterministic-fallback'),
    'deterministic_fallback',
  );
});

// The seven values of RecommendationRefreshTrigger, docs/analytics-taxonomy.md section 5.5.
test('every refresh trigger maps to a distinct trigger reason', () => {
  const triggers = [
    'first-recommendation',
    'stale-weather-refreshed',
    'active-location-changed',
    'clothing-preference-changed',
    'dress-style-changed',
    'local-day-changed',
    'explicit',
  ];
  const reasons = triggers.map(triggerReasonProperty);
  assert.deepEqual(reasons, [
    'first_recommendation',
    'stale_weather_refresh',
    'location_changed',
    'clothing_preference_changed',
    'dress_style_changed',
    'new_calendar_day',
    'explicit_request',
  ]);
  assert.equal(new Set(reasons).size, 7);
});

// The mapping is total over the eleven condition codes, section 5.4.
test('every condition code buckets into one of the six categories', () => {
  const categories = weatherConditionCodes.map(conditionCategory);
  assert.equal(categories.length, 11);
  assert.deepEqual(
    [...new Set(categories)].sort(),
    ['clear', 'cloudy', 'fog', 'precipitation', 'snow', 'storm'],
  );
  assert.equal(conditionCategory('mostly_clear'), 'clear');
  assert.equal(conditionCategory('sleet'), 'snow');
  assert.equal(conditionCategory('heavy_rain'), 'precipitation');
});

test('counts bucket into one through four and 5+', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 40].map(countBucket), [
    1,
    2,
    3,
    4,
    '5+',
    '5+',
    '5+',
  ]);
});

test('every active location source maps to both event vocabularies', () => {
  assert.deepEqual(
    ['device', 'manual'].map(locationChangedMethodProperty),
    ['device', 'manual_selection'],
  );
  assert.deepEqual(
    ['device', 'manual', null].map(onboardingLocationMethodProperty),
    ['device', 'manual', 'skipped'],
  );
});

test('every completed AI probe state maps to the event vocabulary', () => {
  assert.deepEqual(
    ['ok', 'unavailable', 'rate-limited', 'error'].map(aiProbeResultProperty),
    ['ok', 'unavailable', 'rate_limited', 'error'],
  );
});

test('a null dress style reads as smart, matching product logic', () => {
  assert.equal(dressStyleProperty(null), 'smart');
  assert.equal(dressStyleProperty('casual'), 'casual');
  assert.equal(dressStyleProperty('formal'), 'formal');
});

// Local calendar math: `now` is built with the local `Date(year, monthIndex, day)`
// constructor throughout, matching what `ageBucketProperty` compares against.
test('no birth date, or an unparsable one, reads as unknown', () => {
  const now = new Date(2026, 8, 10);
  assert.equal(ageBucketProperty(null, now), 'unknown');
  assert.equal(ageBucketProperty('not-a-date', now), 'unknown');
  assert.equal(ageBucketProperty('2026-13-40', now), 'unknown');
});

test('a future birth date reads as unknown', () => {
  const now = new Date(2026, 8, 10);
  assert.equal(ageBucketProperty('2026-09-11', now), 'unknown');
});

test('age buckets, including the day before and the day of a birthday', () => {
  const now = new Date(2026, 8, 10);
  assert.equal(ageBucketProperty('2008-09-11', now), 'under_18'); // turns 18 tomorrow
  assert.equal(ageBucketProperty('2008-09-10', now), '18_24'); // turns 18 today
  assert.equal(ageBucketProperty('2010-09-11', now), 'under_18');
  assert.equal(ageBucketProperty('2001-01-01', now), '25_34');
  assert.equal(ageBucketProperty('1991-01-01', now), '35_44');
  assert.equal(ageBucketProperty('1981-01-01', now), '45_54');
  assert.equal(ageBucketProperty('1971-01-01', now), '55_64');
  assert.equal(ageBucketProperty('1960-01-01', now), '65_plus');
});

test('a leap day birthday buckets correctly on and around itself', () => {
  assert.equal(
    ageBucketProperty('2008-02-29', new Date(2026, 1, 28)),
    'under_18', // turns 18 tomorrow
  );
  assert.equal(
    ageBucketProperty('2008-02-29', new Date(2026, 2, 1)),
    '18_24', // turned 18 yesterday, in a non-leap year
  );
});
