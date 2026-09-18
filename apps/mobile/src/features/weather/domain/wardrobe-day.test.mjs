import assert from 'node:assert/strict';
import test from 'node:test';

import { wardrobeDayKey, wardrobeDayWindow } from './wardrobe-day.ts';

// Europe/Istanbul is UTC+3 all year, so local 18:00 is 15:00Z and no daylight-saving edge
// hides inside these rows; the zones that do have one are exercised on their own below.
const istanbul = 'Europe/Istanbul';

function window(nowIso, timeZone = istanbul) {
  return wardrobeDayWindow(nowIso, timeZone);
}

test('the day period runs to the next local midnight', () => {
  assert.deepEqual(window('2026-09-18T14:59:00.000Z'), {
    end: '2026-09-18T21:00:00.000Z',
    period: 'day',
    key: '2026-09-18',
  });
});

test('the evening period begins at exactly 18:00 local and runs to 04:00', () => {
  assert.deepEqual(window('2026-09-18T15:00:00.000Z'), {
    end: '2026-09-19T01:00:00.000Z',
    period: 'evening',
    key: '2026-09-18:evening',
  });
  const justAfter = window('2026-09-18T15:01:00.000Z');
  assert.equal(justAfter.period, 'evening');
  assert.equal(justAfter.end, '2026-09-19T01:00:00.000Z');
  assert.equal(justAfter.key, '2026-09-18:evening');
});

test('midnight does not end the dressing day: 23:59 and 00:00 share one window', () => {
  const beforeMidnight = window('2026-09-18T20:59:00.000Z');
  const afterMidnight = window('2026-09-18T21:00:00.000Z');
  assert.equal(beforeMidnight.period, 'evening');
  assert.equal(afterMidnight.period, 'evening');
  assert.equal(beforeMidnight.end, '2026-09-19T01:00:00.000Z');
  assert.equal(afterMidnight.end, '2026-09-19T01:00:00.000Z');
  assert.equal(beforeMidnight.key, '2026-09-18:evening');
  // The person who left the house on the 18th keeps the 18th's dressing day.
  assert.equal(afterMidnight.key, '2026-09-18:evening');
});

test('the dressing day turns at 04:00 local, not at midnight', () => {
  const lastNightHour = window('2026-09-19T00:59:00.000Z');
  const firstDayHour = window('2026-09-19T01:00:00.000Z');
  const afterThat = window('2026-09-19T01:01:00.000Z');
  assert.equal(lastNightHour.period, 'evening');
  assert.equal(lastNightHour.key, '2026-09-18:evening');
  assert.equal(lastNightHour.end, '2026-09-19T01:00:00.000Z');
  assert.equal(firstDayHour.period, 'day');
  assert.equal(firstDayHour.key, '2026-09-19');
  assert.equal(firstDayHour.end, '2026-09-19T21:00:00.000Z');
  assert.equal(afterThat.period, 'day');
  assert.equal(afterThat.key, '2026-09-19');
});

test('a fixed-offset northern zone keeps the same boundary in June and in December', () => {
  // Atlantic/Reykjavik is UTC+0 all year and never leaves daylight, which is why it is here
  // for the offset case rather than for a transition.
  assert.deepEqual(window('2026-06-21T18:00:00.000Z', 'Atlantic/Reykjavik'), {
    end: '2026-06-22T04:00:00.000Z',
    period: 'evening',
    key: '2026-06-21:evening',
  });
  assert.deepEqual(window('2026-12-21T18:00:00.000Z', 'Atlantic/Reykjavik'), {
    end: '2026-12-22T04:00:00.000Z',
    period: 'evening',
    key: '2026-12-21:evening',
  });
});

test('the window is computed in the zone and never in UTC', () => {
  // 18:00 local on the 18th is 06:00Z on the 19th at UTC-12 and 04:00Z on the 18th at
  // UTC+14; a UTC reading of either instant names a different hour and a different date.
  assert.deepEqual(window('2026-09-19T06:00:00.000Z', 'Etc/GMT+12'), {
    end: '2026-09-19T16:00:00.000Z',
    period: 'evening',
    key: '2026-09-18:evening',
  });
  assert.deepEqual(window('2026-09-18T04:00:00.000Z', 'Pacific/Kiritimati'), {
    end: '2026-09-18T14:00:00.000Z',
    period: 'evening',
    key: '2026-09-18:evening',
  });
});

test('a spring-forward night still ends at a real 04:00', () => {
  // Europe/London moves 01:00 to 02:00 on 29 March 2026, so the window is one wall-clock
  // hour shorter than it reads; 04:00 BST is 03:00Z and exists.
  const result = window('2026-03-28T19:00:00.000Z', 'Europe/London');
  assert.deepEqual(result, {
    end: '2026-03-29T03:00:00.000Z',
    period: 'evening',
    key: '2026-03-28:evening',
  });
  assert.equal((Date.parse(result.end) - Date.parse('2026-03-28T19:00:00.000Z')) / 3600000, 8);
});

test('a fall-back night ends at the 04:00 after the repeated hour', () => {
  // America/New_York repeats 01:00 to 02:00 on 1 November 2026, so 19:00 EDT to 04:00 EST
  // is ten real hours even though the clock advances nine.
  const result = window('2026-10-31T23:00:00.000Z', 'America/New_York');
  assert.deepEqual(result, {
    end: '2026-11-01T09:00:00.000Z',
    period: 'evening',
    key: '2026-10-31:evening',
  });
  assert.equal((Date.parse(result.end) - Date.parse('2026-10-31T23:00:00.000Z')) / 3600000, 10);
});

test('a month end and a year end carry the dressing day into the next date', () => {
  assert.deepEqual(window('2026-09-30T15:00:00.000Z'), {
    end: '2026-10-01T01:00:00.000Z',
    period: 'evening',
    key: '2026-09-30:evening',
  });
  assert.deepEqual(window('2026-12-31T16:00:00.000Z'), {
    end: '2027-01-01T01:00:00.000Z',
    period: 'evening',
    key: '2026-12-31:evening',
  });
  // 00:30 local on 1 January belongs to the evening of 31 December and ends at 04:00.
  assert.deepEqual(window('2026-12-31T21:30:00.000Z'), {
    end: '2027-01-01T01:00:00.000Z',
    period: 'evening',
    key: '2026-12-31:evening',
  });
});

test('an unparseable instant and an unknown zone both return null', () => {
  assert.equal(window('not an instant'), null);
  assert.equal(window('2026-09-18T15:00:00.000Z', 'Nowhere/Nowhere'), null);
});

test('the key for a wall-clock reading follows the same boundary', () => {
  const at = (hour) => wardrobeDayKey({ year: 2026, month: 1, day: 1, hour });
  assert.equal(at(4), '2026-01-01');
  assert.equal(at(17), '2026-01-01');
  assert.equal(at(18), '2026-01-01:evening');
  assert.equal(at(23), '2026-01-01:evening');
  // Before 04:00 the key names the date the evening started on, which for 1 January is the
  // last day of the year before.
  assert.equal(at(0), '2025-12-31:evening');
  assert.equal(at(3), '2025-12-31:evening');
});
