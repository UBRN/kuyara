import assert from 'node:assert/strict';
import test from 'node:test';

import { feedbackV1RequestSchema, feedbackV1SuccessSchema, feedbackV1ErrorSchema } from './feedback-v1.ts';

const valid = {
  submissionId: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
  message: 'The forecast was useful.', appVersion: '0.1.20261002', platform: 'ios', locale: 'en',
};

test('feedback request accepts only the five bounded fields', () => {
  assert.equal(feedbackV1RequestSchema.safeParse(valid).success, true);
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, profileId: 'private' }).success, false);
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, message: ' '.repeat(5) }).success, false);
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, message: 'a'.repeat(1001) }).success, false);
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, platform: 'web' }).success, false);
});

test('feedback request needs a submission UUID and a store-format app version', () => {
  const { submissionId: _omitted, ...withoutId } = valid;
  assert.equal(feedbackV1RequestSchema.safeParse(withoutId).success, false);
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, submissionId: 'not-a-uuid' }).success, false);
  for (const appVersion of ['1.0.0', 'unknown', '0.1.2026', '0.1.20261002 extra', '0..20261002', '']) {
    assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, appVersion }).success, false, appVersion);
  }
  assert.equal(feedbackV1RequestSchema.safeParse({ ...valid, appVersion: '0.12.20261231' }).success, true);
});

test('feedback response strips unknown keys and reads a new error code as unknown', () => {
  assert.deepEqual(feedbackV1SuccessSchema.parse({ data: { status: 'received', id: 'extra' }, extra: 1 }),
    { data: { status: 'received' } });
  assert.equal(feedbackV1SuccessSchema.safeParse({ data: { status: 'other' } }).success, false);
  assert.deepEqual(feedbackV1ErrorSchema.parse({ error: { code: 'rate_limited' } }), { error: { code: 'rate_limited' } });
  assert.deepEqual(feedbackV1ErrorSchema.parse({ error: { code: 'brand_new_code', extra: 1 } }),
    { error: { code: 'unknown' } });
  assert.equal(feedbackV1ErrorSchema.safeParse({ error: {} }).success, false);
});
