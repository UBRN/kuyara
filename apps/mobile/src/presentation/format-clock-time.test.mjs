import assert from 'node:assert/strict';
import test from 'node:test';

import { formatWallClockTime } from './format-clock-time.ts';

test('a fixed wall-clock time follows the device 12 or 24-hour setting, in both languages', () => {
  const quietStart = { hour: 22, minute: 0 };
  const quietEnd = { hour: 7, minute: 0 };

  assert.equal(formatWallClockTime(quietStart, 'en', false), '22:00');
  assert.equal(formatWallClockTime(quietEnd, 'en', false), '07:00');
  assert.equal(formatWallClockTime(quietStart, 'en', true), '10:00 pm');
  assert.equal(formatWallClockTime(quietEnd, 'en', true), '7:00 am');
  assert.equal(formatWallClockTime(quietStart, 'tr', false), '22:00');
  assert.equal(formatWallClockTime(quietEnd, 'tr', false), '07:00');
  // Turkish puts its own day-period marker before the digits on a 12-hour clock.
  assert.equal(formatWallClockTime(quietStart, 'tr', true), 'ÖS 10:00');
});
