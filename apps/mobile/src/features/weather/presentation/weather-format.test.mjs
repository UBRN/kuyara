import assert from 'node:assert/strict';
import test from 'node:test';

import { dateKeyWeekday } from './weather-format.ts';

test('a forecast day names the weekday of its own date, not of some zone\'s instant', () => {
  // 2026-10-01 is a Thursday everywhere, including west of Greenwich.
  assert.equal(dateKeyWeekday('2026-10-01', 'en', 'long'), 'Thursday');
  assert.equal(dateKeyWeekday('2026-10-01', 'en', 'short'), 'Thu');
  assert.equal(dateKeyWeekday('2026-10-01', 'tr', 'long'), 'Perşembe');
});
