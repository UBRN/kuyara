import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTICS_SCHEMA_VERSION,
  analyticsEventNames,
  analyticsEventPropertyKeys,
} from './domain/analytics-events.ts';

// docs/analytics-taxonomy.md section 5.0.
test('the catalog defines the twenty-three custom events, once each', () => {
  assert.equal(analyticsEventNames.length, 23);
  assert.equal(new Set(analyticsEventNames).size, 23);
  assert.deepEqual(
    [...analyticsEventNames].sort(),
    Object.keys(analyticsEventPropertyKeys).sort(),
  );
});

test('every event carries schema_version', () => {
  assert.equal(ANALYTICS_SCHEMA_VERSION, 1);
  for (const name of analyticsEventNames) {
    assert.ok(
      analyticsEventPropertyKeys[name].includes('schema_version'),
      `${name} must carry schema_version`,
    );
  }
});

// docs/analytics-taxonomy.md section 4, and AGENTS.md "Worker, API, security, and privacy".
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
