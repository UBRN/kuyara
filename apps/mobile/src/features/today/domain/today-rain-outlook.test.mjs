import assert from 'node:assert/strict';
import test from 'node:test';

import { todayRainOutlookProbability } from './today-rain-outlook.ts';

const now = Date.parse('2026-08-13T06:30:00.000Z');

function hour(forecastAt, precipitationProbability) {
  return {
    forecastAt,
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'rain',
    precipitationProbability,
    windSpeedMetersPerSecond: 2,
    humidity: 0.7,
    uvIndex: 2,
  };
}

function weather(currentProbability, hourly) {
  return {
    id: 'weather-one',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul',
    fetchedAt: '2026-08-13T06:05:00.000Z',
    origin: { kind: 'sample', sourceId: 'today-rain-test' },
    current: {
      observedAt: '2026-08-13T06:00:00.000Z',
      temperatureCelsius: 20,
      apparentTemperatureCelsius: 20,
      condition: 'rain',
      precipitationProbability: currentProbability,
      windSpeedMetersPerSecond: 2,
      humidity: 0.7,
      uvIndex: 2,
    },
    minimumTemperatureCelsius: 18,
    maximumTemperatureCelsius: 22,
    hourly,
  };
}

test('current conditions beat lower remaining hourly probabilities', () => {
  assert.equal(todayRainOutlookProbability(weather(0.8, [
    hour('2026-08-13T07:00:00.000Z', 0.4),
    hour('2026-08-13T12:00:00.000Z', 0.6),
  ]), now), 0.8);
});

test('a later remaining hour on the same local day beats current conditions', () => {
  assert.equal(todayRainOutlookProbability(weather(0.2, [
    hour('2026-08-13T12:00:00.000Z', 0.9),
  ]), now), 0.9);
});

test('an hourly entry that has ended is ignored', () => {
  assert.equal(todayRainOutlookProbability(weather(0.2, [
    hour('2026-08-13T05:30:00.000Z', 0.9),
  ]), now), 0.2);
});

test('an hourly entry past the window end is ignored', () => {
  // 09:30 local is a day-period open, so the window ends at midnight and 01:00 is outside.
  assert.equal(todayRainOutlookProbability(weather(0.2, [
    hour('2026-08-13T22:00:00.000Z', 0.9),
  ]), now), 0.2);
});

test('an evening open reads the rain the night ahead is bringing', () => {
  // 19:30 local. The dressing day now reaches 04:00, so the 01:00 hour counts while the
  // 05:00 hour, which is past the window end, still does not.
  const evening = Date.parse('2026-08-13T16:30:00.000Z');
  assert.equal(todayRainOutlookProbability(weather(0.2, [
    hour('2026-08-13T22:00:00.000Z', 0.9),
  ]), evening), 0.9);
  assert.equal(todayRainOutlookProbability(weather(0.2, [
    hour('2026-08-14T02:00:00.000Z', 0.9),
  ]), evening), 0.2);
});

test('an empty hourly forecast falls back to current conditions', () => {
  assert.equal(todayRainOutlookProbability(weather(0.65, []), now), 0.65);
});

test('just after local midnight the window is read from now, not from the snapshot', () => {
  const afterMidnight = Date.parse('2026-08-13T21:20:00.000Z');
  const yesterdayEvening = weather(0.2, [hour('2026-08-13T22:00:00.000Z', 0.9)]);
  const snapshot = {
    ...yesterdayEvening,
    current: { ...yesterdayEvening.current, observedAt: '2026-08-13T20:50:00.000Z' },
  };

  assert.equal(todayRainOutlookProbability(snapshot, afterMidnight), 0.9);
});
