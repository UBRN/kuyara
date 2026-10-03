import assert from 'node:assert/strict';
import test from 'node:test';

import { formatClockTime, formatLastUpdated, formatWallClockTime } from './format-clock-time.ts';

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

test('a clock time follows the language, the 12 or 24-hour setting and the zone it is read in', () => {
  const instant = '2026-10-04T16:05:00.000Z';

  assert.equal(formatClockTime(instant, 'en', false, 'Europe/Istanbul'), '19:05');
  assert.equal(formatClockTime(instant, 'en', true, 'Europe/Istanbul'), '7:05 pm');
  assert.equal(formatClockTime(instant, 'tr', false, 'Europe/Istanbul'), '19:05');
  assert.equal(formatClockTime(instant, 'tr', true, 'Europe/Istanbul'), 'ÖS 7:05');
  assert.equal(formatClockTime(instant, 'en', true, 'Asia/Kolkata'), '9:35 pm');
  assert.equal(formatClockTime(instant, 'en', false, 'America/New_York'), '12:05');
  assert.equal(formatClockTime(Date.parse(instant), 'en', false, 'UTC'), '16:05');
});

test('a clock time without a zone is read in the device zone', () => {
  assert.equal(formatClockTime('2026-10-04T16:05:00.000Z', 'en', false), '16:05');
  assert.equal(formatClockTime('2026-10-04T16:05:00.000Z', 'tr', true), 'ÖS 4:05');
});

test('last updated is the time on the current local day and the short date and time otherwise', () => {
  const now = Date.parse('2026-10-04T18:00:00Z');
  const today = '2026-10-04T16:05:00.000Z';
  const earlier = '2026-10-02T16:05:00.000Z';

  assert.equal(formatLastUpdated(today, 'en', false, now), '16:05');
  assert.equal(formatLastUpdated(today, 'en', true, now), '4:05 pm');
  assert.equal(formatLastUpdated(today, 'tr', true, now), 'ÖS 4:05');
  assert.equal(formatLastUpdated(earlier, 'en', false, now), '02/10/2026, 16:05');
  assert.equal(formatLastUpdated(earlier, 'en', true, now), '02/10/2026, 04:05 pm');
  assert.equal(formatLastUpdated(earlier, 'tr', false, now), '2.10.2026 16:05');
});
