import assert from 'node:assert/strict';
import test from 'node:test';

import { messages } from '../../../localization/messages.ts';
import { hourlyRailColumns, hourlyTimeEmphasis, startsNewLocalDay } from './hourly-rail-columns.ts';

const hour = (forecastAt, temperatureCelsius = 17) => ({
  forecastAt, temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius - 1,
  condition: 'clear', precipitationProbability: 0, windSpeedMetersPerSecond: 3,
  humidity: 0.6, uvIndex: 1,
});

// Kadıköy keeps Istanbul's clock, three hours ahead of UTC all year; the run's own zone is
// UTC (TZ=UTC in the test script), so a device-zone or double-offset slip moves every label.
const istanbulAfternoon = Array.from({ length: 14 }, (_, offset) => hour(
  new Date(Date.parse('2026-10-03T09:00:00.000Z') + offset * 3_600_000).toISOString(),
));
const snapshot = { timeZone: 'Europe/Istanbul', hourly: istanbulAfternoon };
const wording = {
  copy: messages.en.weather,
  hour12: false,
  language: 'en',
  temperatureUnit: 'celsius',
  unitName: 'degrees Celsius',
};
const columnsAt = (now) => hourlyRailColumns(snapshot, Date.parse(now), undefined, wording);

test('the rail starts at the current hour of the place, read in its own time zone', () => {
  // 13:54 in Kadıköy: the 13:00 hour has not ended, so it leads the rail as "Now".
  const columns = columnsAt('2026-10-03T10:54:00.000Z');

  assert.equal(columns[0].key, '2026-10-03T10:00:00.000Z');
  assert.equal(columns[0].time, 'Now');
  assert.equal(columns[0].timeEmphasis, 'now');
  assert.match(columns[0].accessibilityLabel, /^13:00\./u);
  assert.deepEqual(columns.slice(1, 6).map(({ time }) => time), ['14:00', '15:00', '16:00', '17:00', '18:00']);
});

test('the first hour of the next local day names the day instead of the clock', () => {
  const columns = columnsAt('2026-10-03T10:54:00.000Z');
  const midnight = columns.find(({ key }) => key === '2026-10-03T21:00:00.000Z');

  assert.equal(midnight.time, 'Sun');
  assert.equal(midnight.timeEmphasis, 'newDay');
  assert.match(midnight.accessibilityLabel, /^Sunday, 00:00\./u);
  assert.equal(columns.filter(({ timeEmphasis }) => timeEmphasis === 'newDay').length, 1);
});

test('the day changes at the place\'s midnight, never at UTC\'s', () => {
  const hours = [hour('2026-10-03T20:00:00.000Z'), hour('2026-10-03T21:00:00.000Z'), hour('2026-10-04T00:00:00.000Z')];

  assert.deepEqual(hours.map((_, index) => startsNewLocalDay(hours, index, 'Europe/Istanbul')), [false, true, false]);
  assert.deepEqual(hours.map((_, index) => startsNewLocalDay(hours, index, 'UTC')), [false, false, true]);
});

test('the first column is the current hour even when it opens a new day', () => {
  assert.equal(hourlyTimeEmphasis(0, false), 'now');
  assert.equal(hourlyTimeEmphasis(0, true), 'now');
  assert.equal(hourlyTimeEmphasis(3, true), 'newDay');
  assert.equal(hourlyTimeEmphasis(3, false), undefined);
});
