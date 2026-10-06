import assert from 'node:assert/strict';
import test from 'node:test';

import { isoTimestamp, localDateKey } from './raw-time.ts';

test('isoTimestamp normalises an offset timestamp to UTC ISO', () => {
  assert.equal(isoTimestamp('2026-09-30T02:30:00+03:00'), '2026-09-29T23:30:00.000Z');
});

test('localDateKey reads the calendar day in the place time zone', () => {
  assert.equal(localDateKey('2026-09-29T23:30:00.000Z', 'Europe/Istanbul'), '2026-09-30');
  assert.equal(localDateKey('2026-09-29T23:30:00.000Z', 'UTC'), '2026-09-29');
});

test('an unparseable timestamp is an invalid provider response', () => {
  for (const call of [() => isoTimestamp('not a date'), () => localDateKey('not a date', 'UTC')]) {
    assert.throws(call, { kind: 'invalid_response' });
  }
});
