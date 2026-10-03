import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calendarDateKeySchema,
  calendarDateParts,
  formatCalendarDate,
  formatCalendarDateParts,
  parseCalendarDate,
  shiftCalendarDateParts,
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

test('shifting rolls over month, year and leap day in both directions', () => {
  const shift = (key, days) => formatCalendarDateParts(shiftCalendarDateParts(calendarDateParts(key), days));
  assert.equal(shift('2026-01-31', 1), '2026-02-01');
  assert.equal(shift('2026-12-31', 1), '2027-01-01');
  assert.equal(shift('2027-01-01', -1), '2026-12-31');
  assert.equal(shift('2024-02-28', 1), '2024-02-29');
  assert.equal(shift('2024-02-29', 1), '2024-03-01');
  assert.equal(shift('2026-02-28', 1), '2026-03-01');
  assert.equal(shift('2026-03-01', -1), '2026-02-28');
  assert.equal(shift('2026-10-04', 0), '2026-10-04');
  assert.equal(shift('2026-10-04', -6), '2026-09-28');
  assert.equal(shift('2026-01-01', 366), '2027-01-02');
});

test('the date key schema refuses a month or day that does not exist', () => {
  assert.equal(calendarDateKeySchema.safeParse('2024-02-29').success, true);
  assert.equal(calendarDateKeySchema.safeParse('2026-02-29').success, false);
  assert.equal(calendarDateKeySchema.safeParse('2026-13-01').success, false);
  assert.equal(calendarDateKeySchema.safeParse('2026-1-01').success, false);
});
