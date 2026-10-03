import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSetupDressingDay,
  localDayKey,
  localDayKind,
  localDayVariant,
  nextMorningAfterEvening,
  previewDepartureAt,
} from './local-day.ts';
import { outfitCoverage } from './outfit-coverage.ts';
import { zonedClock } from '../../../domain/intl-format.ts';
import { instantOfLocalHour } from '../../weather/domain/wardrobe-day.ts';

// The dressing day turns at 04:00 and 18:00 and never at midnight. No fake timers: every
// case builds its own local date, because the rules take the date they read.
test('the dressing day key at the 03:59, 04:00, 17:59 and 18:00 boundaries', () => {
  // 2026-09-16 is a Wednesday.
  assert.equal(localDayKey(new Date(2026, 8, 16, 3, 59)), '2026-09-15:evening');
  assert.equal(localDayKey(new Date(2026, 8, 16, 4, 0)), '2026-09-16');
  assert.equal(localDayKey(new Date(2026, 8, 16, 17, 59)), '2026-09-16');
  assert.equal(localDayKey(new Date(2026, 8, 16, 18, 0)), '2026-09-16:evening');
});

test('midnight does not turn the dressing day, including across a year', () => {
  assert.equal(localDayKey(new Date(2025, 11, 31, 23, 59)), '2025-12-31:evening');
  assert.equal(localDayKey(new Date(2026, 0, 1, 0, 0)), '2025-12-31:evening');
  assert.equal(localDayKey(new Date(2026, 0, 1, 0, 1)), '2025-12-31:evening');
});

test('the day kind is read from the calendar date, weekend on Saturday and Sunday', () => {
  // 2026-09-18 is a Friday, 19 a Saturday, 20 a Sunday, 21 a Monday.
  const kinds = [18, 19, 20, 21].map((day) => localDayKind(new Date(2026, 8, day, 12)));
  assert.deepEqual(kinds, ['weekday', 'weekend', 'weekend', 'weekday']);
  // The kind follows the date the clock shows, so Saturday 00:30 is a weekend even though
  // its dressing day key still belongs to Friday evening.
  const saturdayNight = new Date(2026, 8, 19, 0, 30);
  assert.equal(localDayKind(saturdayNight), 'weekend');
  assert.equal(localDayKey(saturdayNight), '2026-09-18:evening');
  assert.equal(localDayKind(new Date(2026, 8, 19, 3, 59)), 'weekend');
  assert.equal(localDayKind(new Date(2026, 8, 20, 18, 0)), 'weekend');
});

test('the day variant is a deterministic seven-day ring', () => {
  assert.equal(localDayVariant(new Date(2026, 0, 1, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 2, 12)), 2);
  assert.equal(localDayVariant(new Date(2026, 0, 8, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 1, 23, 59)), localDayVariant(new Date(2026, 0, 1, 0, 1)));
});

test('the morning after an evening is 08:00 on the next date, and a day key has none', () => {
  const morning = nextMorningAfterEvening('2026-12-31:evening', 'UTC',
    '2026-12-31T19:00:00.000Z');
  assert.equal(morning.getTime(), new Date(2027, 0, 1, 8).getTime());
  assert.equal(localDayKey(morning), '2027-01-01');
  // At 02:00 the evening that began yesterday is still the key, and its morning is today's date.
  assert.equal(localDayKey(nextMorningAfterEvening('2026-10-01:evening', 'UTC',
    '2026-10-02T02:00:00.000Z')), '2026-10-02');
  assert.equal(nextMorningAfterEvening('2026-10-01', 'UTC', '2026-10-01T19:00:00.000Z'), null);
});

// The device in Istanbul looking at Reykjavik: 08:00 on the device's clock is 05:00 at the
// place, which opened tomorrow's window at 05:00. The suite runs with TZ=UTC, so a place
// ahead of and behind UTC both show the device's clock leaking into the place's hours.
test("tomorrow's preview leaves at 08:00 on the place's clock, and its window runs to 19:00", () => {
  for (const timeZone of ['Atlantic/Reykjavik', 'Europe/Istanbul', 'America/New_York', 'Pacific/Auckland']) {
    const placeEvening = new Date(instantOfLocalHour({ year: 2026, month: 10, day: 2 },
      19, timeZone)).toISOString();
    const departureAt = previewDepartureAt('2026-10-02:evening', timeZone, placeEvening);
    const start = zonedClock(Date.parse(departureAt), timeZone);
    assert.deepEqual([start.year, start.month, start.day, start.hour, start.minute], [2026, 10, 3, 8, 0], timeZone);
    const coverage = outfitCoverage(departureAt, timeZone);
    assert.equal(coverage.start, departureAt, timeZone);
    const end = zonedClock(Date.parse(coverage.end), timeZone);
    assert.deepEqual([end.day, end.hour], [3, 19], timeZone);
  }
  assert.equal(previewDepartureAt('2026-10-02:evening', 'Europe/Istanbul',
    '2026-10-02T16:00:00.000Z'), '2026-10-03T05:00:00.000Z');
  assert.equal(previewDepartureAt('2026-10-02', 'Europe/Istanbul',
    '2026-10-02T16:00:00.000Z'), null);
  assert.equal(previewDepartureAt('2026-10-02:evening', 'Not/AZone',
    '2026-10-02T16:00:00.000Z'), null);
});

test('the preview morning follows the place date when the device is at +03:00', () => {
  const previousZone = process.env.TZ;
  process.env.TZ = 'Europe/Istanbul';
  try {
    const eveningOnDevice = '2026-10-02:evening';
    const deviceAt23 = '2026-10-02T20:00:00.000Z';
    assert.equal(localDayKey(new Date(deviceAt23)), eveningOnDevice);
    assert.equal(previewDepartureAt(eveningOnDevice, 'America/Los_Angeles', deviceAt23),
      '2026-10-03T15:00:00.000Z');
    assert.equal(previewDepartureAt(eveningOnDevice, 'Australia/Brisbane', deviceAt23),
      '2026-10-03T22:00:00.000Z');
    assert.equal(localDayKey(nextMorningAfterEvening(eveningOnDevice,
      'Australia/Brisbane', deviceAt23)), '2026-10-04');
  } finally {
    process.env.TZ = previousZone;
  }
});

test('the dressing day the profile was set up on counts as answered, and only that one', () => {
  const setUpAt = new Date(2026, 9, 3, 9, 30).toISOString();
  assert.equal(isSetupDressingDay(setUpAt, '2026-10-03'), true);
  assert.equal(isSetupDressingDay(setUpAt, '2026-10-03:evening'), false);
  assert.equal(isSetupDressingDay(setUpAt, '2026-10-04'), false);
  const setUpInTheEvening = new Date(2026, 9, 3, 20, 0).toISOString();
  assert.equal(isSetupDressingDay(setUpInTheEvening, '2026-10-03:evening'), true);
  assert.equal(isSetupDressingDay(setUpInTheEvening, '2026-10-04'), false);
});
