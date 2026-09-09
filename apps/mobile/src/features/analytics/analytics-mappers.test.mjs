import assert from 'node:assert/strict';
import test from 'node:test';

import { failureCategories } from '@/domain/failure-category';
import { weatherConditionCodes } from '@/features/weather/domain/weather';

import {
  conditionCategory,
  countBucket,
  failureCategoryProperty,
  generationModeProperty,
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
