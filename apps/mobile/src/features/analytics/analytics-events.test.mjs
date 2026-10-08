import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTICS_SCHEMA_VERSION,
  analyticsEventNames,
  analyticsEventPropertyKeys,
} from './domain/analytics-events.ts';

// docs/analytics-taxonomy.md section 5.0.
test('the catalog defines the thirty custom events, once each', () => {
  assert.equal(analyticsEventNames.length, 30);
  assert.equal(new Set(analyticsEventNames).size, 30);
  assert.deepEqual(
    [...analyticsEventNames].sort(),
    Object.keys(analyticsEventPropertyKeys).sort(),
  );
});

// Onboarding runs before the consent question, so nothing it could emit is ever sent.
test('no event or property exists only before consent', () => {
  const keys = new Set(Object.values(analyticsEventPropertyKeys).flat());
  for (const name of analyticsEventNames) assert.ok(!name.startsWith('onboarding_'), name);
  for (const key of ['step_name', 'step_index', 'skipped', 'location_method']) {
    assert.ok(!keys.has(key), `${key} is only emittable during onboarding`);
  }
});

test('every event carries schema_version', () => {
  assert.equal(ANALYTICS_SCHEMA_VERSION, 4);
  for (const name of analyticsEventNames) {
    assert.ok(
      analyticsEventPropertyKeys[name].includes('schema_version'),
      `${name} must carry schema_version`,
    );
  }
});

// docs/analytics-taxonomy.md section 4 defines the permitted event properties.
const forbiddenFragments = [
  'lat',
  'lon',
  'coord',
  'photo',
  'image',
  'path',
  'prompt',
  'response',
  'birth',
  'profile_id',
  'device_id',
];

// Section 5.8 defines these two as booleans reporting presence only; no photo, path, or
// image content is behind either of them.
const allowedPhotoFlags = new Set(['has_photo', 'had_photo']);

test('no event property key touches the privacy exclusion list', () => {
  for (const name of analyticsEventNames) {
    for (const key of analyticsEventPropertyKeys[name]) {
      if (allowedPhotoFlags.has(key)) continue;
      assert.notEqual(key, 'name', `${name}.${key} is free-form user text`);
      for (const fragment of forbiddenFragments) {
        assert.ok(
          !key.includes(fragment),
          `${name}.${key} matches the excluded fragment "${fragment}"`,
        );
      }
    }
  }
});
