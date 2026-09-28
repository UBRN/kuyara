import assert from 'node:assert/strict';
import test from 'node:test';

import { isUtcIsoTimestamp, isUuidV4 } from './record-identity.ts';

test('isUuidV4 accepts only version 4 UUIDs with an RFC 4122 variant, in either case', () => {
  assert.equal(isUuidV4('018f0f4d-1d45-4ae7-a8f1-796e8297d3b4'), true);
  assert.equal(isUuidV4('018F0F4D-1D45-4AE7-A8F1-796E8297D3B4'), true);
  assert.equal(isUuidV4('018f0f4d-1d45-1ae7-a8f1-796e8297d3b4'), false, 'version 1');
  assert.equal(isUuidV4('018f0f4d-1d45-4ae7-c8f1-796e8297d3b4'), false, 'variant c');
  assert.equal(isUuidV4('018f0f4d1d454ae7a8f1796e8297d3b4'), false, 'no dashes');
  assert.equal(isUuidV4(' 018f0f4d-1d45-4ae7-a8f1-796e8297d3b4'), false, 'leading space');
  assert.equal(isUuidV4(''), false);
});

test('isUtcIsoTimestamp accepts only the canonical toISOString form', () => {
  assert.equal(isUtcIsoTimestamp('2026-08-01T09:30:00.000Z'), true);
  assert.equal(isUtcIsoTimestamp('2024-02-29T00:00:00.000Z'), true, 'leap day');
  assert.equal(isUtcIsoTimestamp('2026-08-01T09:30:00Z'), false, 'no milliseconds');
  assert.equal(isUtcIsoTimestamp('2026-08-01T09:30:00.000+00:00'), false, 'offset form');
  assert.equal(isUtcIsoTimestamp('2026-08-01T12:30:00.000+03:00'), false, 'other offset');
  assert.equal(isUtcIsoTimestamp('2026-02-30T09:30:00.000Z'), false, 'impossible day');
  assert.equal(isUtcIsoTimestamp('2026-08-01'), false, 'date only');
  assert.equal(isUtcIsoTimestamp('not a date'), false);
  assert.equal(isUtcIsoTimestamp(''), false);
});
