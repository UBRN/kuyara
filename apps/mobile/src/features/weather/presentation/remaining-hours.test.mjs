import assert from 'node:assert/strict';
import test from 'node:test';

import { remainingHourlyForecast } from './remaining-hours.ts';

const hour = (forecastAt) => ({
  forecastAt, temperatureCelsius: 16, apparentTemperatureCelsius: 15, condition: 'rain',
  precipitationProbability: 0.5, windSpeedMetersPerSecond: 4, humidity: 0.7, uvIndex: 2,
});
const day = [
  hour('2026-07-30T09:00:00.000Z'),
  hour('2026-07-30T10:00:00.000Z'),
  hour('2026-07-30T11:00:00.000Z'),
];

test('keeps the current hour and every later one, dropping ended hours', () => {
  const remaining = remainingHourlyForecast(day, Date.parse('2026-07-30T10:30:00.000Z'));
  assert.deepEqual(remaining.map(({ forecastAt }) => forecastAt), [
    '2026-07-30T10:00:00.000Z',
    '2026-07-30T11:00:00.000Z',
  ]);
});

test('an hour ends exactly sixty minutes after it starts', () => {
  const remaining = remainingHourlyForecast(day, Date.parse('2026-07-30T10:00:00.000Z'));
  assert.deepEqual(remaining.map(({ forecastAt }) => forecastAt), [
    '2026-07-30T10:00:00.000Z',
    '2026-07-30T11:00:00.000Z',
  ]);
});

test('returns everything before the day starts and nothing once it has ended', () => {
  assert.equal(remainingHourlyForecast(day, Date.parse('2026-07-30T08:00:00.000Z')).length, 3);
  assert.equal(remainingHourlyForecast(day, Date.parse('2026-07-30T12:00:00.000Z')).length, 0);
});

test('keeps upcoming entries after local midnight', () => {
  const hours = [...day, hour('2026-07-31T00:00:00.000Z')];
  assert.deepEqual(
    remainingHourlyForecast(hours, Date.parse('2026-07-30T12:00:00.000Z'))
      .map(({ forecastAt }) => forecastAt),
    ['2026-07-31T00:00:00.000Z'],
  );
});
