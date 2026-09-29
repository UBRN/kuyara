import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarDateParts,
  formatCalendarDate,
  formatCalendarDateParts,
  parseCalendarDate,
} from './calendar-date.ts';

test('a calendar key round-trips through parts and through a Date', () => {
  for (const key of ['2026-01-05', '1999-12-31', '2024-02-29', '2026-10-25']) {
    assert.equal(formatCalendarDateParts(calendarDateParts(key)), key);
    assert.equal(formatCalendarDate(parseCalendarDate(key)), key);
  }
});

test('parts are numbers and the parsed Date sits at local noon', () => {
  assert.deepEqual(calendarDateParts('2026-03-09'), { year: 2026, month: 3, day: 9 });
  const parsed = parseCalendarDate('2026-03-09');
  assert.equal(parsed.getHours(), 12);
  assert.equal(parsed.getDate(), 9);
});

test('a Date formats by its local calendar day, zero-padded', () => {
  assert.equal(formatCalendarDate(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
});
