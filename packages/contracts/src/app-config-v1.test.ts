import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appConfigV1ErrorSchema,
  appConfigV1Path,
  appConfigV1SiriCardValues,
  appConfigV1SuccessSchema,
} from './app-config-v1.ts';

test('app configuration is one versioned GET path', () => {
  assert.equal(appConfigV1Path, '/v1/app-config');
  assert.deepEqual(appConfigV1SiriCardValues, ['on', 'off']);
});

test('the success body carries the Siri card switch', () => {
  for (const siriCard of appConfigV1SiriCardValues) {
    assert.deepEqual(appConfigV1SuccessSchema.parse({ data: { siriCard } }), { data: { siriCard } });
  }
});

test('readers strip added fields and read a new switch value or error code as unknown', () => {
  assert.deepEqual(
    appConfigV1SuccessSchema.parse({ data: { siriCard: 'off', newFlag: true }, extra: 1 }),
    { data: { siriCard: 'off' } },
  );
  assert.deepEqual(appConfigV1SuccessSchema.parse({ data: { siriCard: 'paused' } }), { data: { siriCard: 'unknown' } });
  assert.deepEqual(appConfigV1ErrorSchema.parse({ error: { code: 'brand_new_code' } }), { error: { code: 'unknown' } });
  assert.deepEqual(appConfigV1ErrorSchema.parse({ error: { code: 'unavailable' } }), { error: { code: 'unavailable' } });
});

test('a missing, numeric or free-text switch still rejects the body', () => {
  for (const data of [{}, { siriCard: 1 }, { siriCard: 'Turn it OFF please' }, { siriCard: '' }, { siriCard: null }]) {
    assert.equal(appConfigV1SuccessSchema.safeParse({ data }).success, false, JSON.stringify(data));
  }
  assert.equal(appConfigV1SuccessSchema.safeParse({ siriCard: 'off' }).success, false);
});
