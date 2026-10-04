import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dateKeyDayKind,
  isDayQuestionOpen,
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

test('the day kind is read from the dressing day, weekend on Saturday and Sunday from 04:00', () => {
  // 2026-09-18 is a Friday, 19 a Saturday, 20 a Sunday, 21 a Monday.
  const kinds = [18, 19, 20, 21].map((day) => localDayKind(new Date(2026, 8, day, 12)));
  assert.deepEqual(kinds, ['weekday', 'weekend', 'weekend', 'weekday']);
  // The small hours keep the evening's kind: Saturday 00:30 is still Friday evening.
  const saturdayNight = new Date(2026, 8, 19, 0, 30);
  assert.equal(localDayKey(saturdayNight), '2026-09-18:evening');
  assert.equal(localDayKind(saturdayNight), 'weekday');
  assert.equal(localDayKind(new Date(2026, 8, 19, 3, 59)), 'weekday');
  assert.equal(localDayKind(new Date(2026, 8, 19, 4, 0)), 'weekend');
  assert.equal(localDayKind(new Date(2026, 8, 20, 18, 0)), 'weekend');
  // Monday's small hours are still Sunday evening.
  assert.equal(localDayKind(new Date(2026, 8, 21, 3, 59)), 'weekend');
  assert.equal(localDayKind(new Date(2026, 8, 21, 4, 0)), 'weekday');
});

test('the day variant is a deterministic seven-day ring', () => {
  assert.equal(localDayVariant(new Date(2026, 0, 1, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 2, 12)), 2);
  assert.equal(localDayVariant(new Date(2026, 0, 8, 12)), 1);
  assert.equal(localDayVariant(new Date(2026, 0, 1, 23, 59)), localDayVariant(new Date(2026, 0, 1, 0, 1)));
});

// 31 December of a common year is day 365, and 365 and 1 leave the same remainder by seven,
// so New Year's Day used to offer the outfits of the day before.
test('consecutive calendar dates always take different day variants', () => {
  const repeats = [];
  for (let date = new Date(2026, 0, 1, 12); date.getFullYear() <= 2030;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12)) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12);
    const variant = localDayVariant(date);
    assert.ok(Number.isInteger(variant) && variant >= 0 && variant < 7);
    if (variant === localDayVariant(next)) repeats.push(date.toDateString());
  }

  assert.deepEqual(repeats, []);
});

test('the morning after an evening is 08:00 on the date after its key, and a day key has none', () => {
  const morning = nextMorningAfterEvening('2026-12-31:evening');
  assert.equal(morning.getTime(), new Date(2027, 0, 1, 8).getTime());
  assert.equal(localDayKey(morning), '2027-01-01');
  // At 02:00 the evening that began yesterday is still the key, and its morning is today's date.
  assert.equal(localDayKey(nextMorningAfterEvening('2026-10-01:evening')), '2026-10-02');
  assert.equal(nextMorningAfterEvening('2026-10-01'), null);
});

// The device in Istanbul looking at Reykjavik: 08:00 on the device's clock is 05:00 at the
// place, which opened tomorrow's window at 05:00. The suite runs with TZ=UTC, so a place
// ahead of and behind UTC both show the device's clock leaking into the place's hours.
test("tomorrow's preview leaves at 08:00 on the place's clock, and its window runs to 19:00", () => {
  for (const timeZone of ['Atlantic/Reykjavik', 'Europe/Istanbul', 'America/New_York', 'Pacific/Auckland']) {
    const departureAt = previewDepartureAt('2026-10-02:evening', timeZone);
    const start = zonedClock(Date.parse(departureAt), timeZone);
    assert.deepEqual([start.year, start.month, start.day, start.hour, start.minute], [2026, 10, 3, 8, 0], timeZone);
    const coverage = outfitCoverage(departureAt, timeZone);
    assert.equal(coverage.start, departureAt, timeZone);
    const end = zonedClock(Date.parse(coverage.end), timeZone);
    assert.deepEqual([end.day, end.hour], [3, 19], timeZone);
  }
  assert.equal(previewDepartureAt('2026-10-02:evening', 'Europe/Istanbul'),
    '2026-10-03T05:00:00.000Z');
  assert.equal(previewDepartureAt('2026-10-02', 'Europe/Istanbul'), null);
  assert.equal(previewDepartureAt('2026-10-02:evening', 'Not/AZone'), null);
});

// The device in New York, the place in Istanbul: 19:00 on the device is 02:00 at the place and
// 21:00 on the device is 04:00 there, so a key read from the place's clock moved to the next
// date in the middle of the evening and claimed a second preview. The key is the evening's
// own date plus one, wherever the place keeps its time.
test("tomorrow's key stays one key for a whole evening when the place keeps another time", () => {
  const previousZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const keys = ['2026-10-02T23:00:00.000Z', '2026-10-03T01:00:00.000Z', '2026-10-03T04:30:00.000Z']
      .map((at) => {
        const eveningOnDevice = localDayKey(new Date(at));
        assert.equal(eveningOnDevice, '2026-10-02:evening', at);
        return {
          key: localDayKey(nextMorningAfterEvening(eveningOnDevice)),
          departure: previewDepartureAt(eveningOnDevice, 'Europe/Istanbul'),
        };
      });
    for (const { key, departure } of keys) {
      assert.equal(key, '2026-10-03');
      assert.equal(departure, '2026-10-03T05:00:00.000Z');
    }
    // A place far behind the device leaves for its own 08:00 on the same date.
    assert.equal(previewDepartureAt('2026-10-02:evening', 'America/Los_Angeles'),
      '2026-10-03T15:00:00.000Z');
  } finally {
    process.env.TZ = previousZone;
  }
});

test('a calendar date key has the kind of the weekday it names, in any zone', () => {
  // 2026-09-18 is a Friday; 2026-12-31 a Thursday, 2027-01-02 a Saturday.
  const kinds = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-12-31', '2027-01-02']
    .map(dateKeyDayKind);
  assert.deepEqual(kinds, ['weekday', 'weekend', 'weekend', 'weekday', 'weekday', 'weekend']);
});

// A profile set up on build 18 and opened on build 19 the same day has no choice row for that
// day, because only the newer setup writes one; the setup day still counts as answered.
test('a day with no choice row stays unasked on the day the profile was set up, and is asked on any other', () => {
  const setUpAt = new Date(2026, 9, 4, 9, 30).toISOString();
  const open = (dressingDayKey, extra = {}) => isDayQuestionOpen({
    morningSheetEnabled: true, profileCreatedAt: setUpAt, dressingDayKey, ...extra,
  });
  assert.equal(open('2026-10-04'), false);
  assert.equal(open('2026-10-04:evening'), true);
  assert.equal(open('2026-10-05'), true);
  const setUpInTheEvening = new Date(2026, 9, 4, 20, 0).toISOString();
  assert.equal(open('2026-10-04:evening', { profileCreatedAt: setUpInTheEvening }), false);
  assert.equal(open('2026-10-05', { profileCreatedAt: setUpInTheEvening }), true);
  assert.equal(open('2026-10-05', { morningSheetEnabled: false }), false);
});
