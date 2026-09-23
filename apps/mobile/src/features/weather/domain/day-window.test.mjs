import assert from 'node:assert/strict';
import test from 'node:test';

import { findDayWindow } from './day-window.ts';
import {
  chillyCelsius, freezingCelsius, hotCelsius, precipitationLikelyThreshold,
  temperatureSwingCelsius, veryHotCelsius, veryWindyMetersPerSecond,
  windyMetersPerSecond,
} from './weather-thresholds.ts';

const morning = '2026-09-09T05:00:00.000Z'; // 08:00 in Istanbul.
const evening = '2026-09-09T16:00:00.000Z'; // 19:00 in Istanbul.
const at = (localHour) => new Date(Date.UTC(2026, 8, 9, localHour - 3)).toISOString();
const measurement = (extra = {}) => ({
  temperatureCelsius: 20, apparentTemperatureCelsius: 20, condition: 'clear',
  precipitationProbability: 0, windSpeedMetersPerSecond: 0, humidity: 0.5, uvIndex: 0,
  ...extra,
});
const hour = (localHour, extra = {}) => ({ forecastAt: at(localHour), ...measurement(extra) });
const hours = (start, last, overrides = {}) => Array.from(
  { length: last - start + 1 }, (_, index) => hour(start + index, overrides[start + index]),
);
const snapshot = (hourly, current = measurement()) => ({
  id: 'weather', localProfileId: 'profile', locationKey: 'istanbul',
  timeZone: 'Europe/Istanbul', fetchedAt: morning,
  origin: { kind: 'live', sourceId: 'open-meteo' },
  current: { observedAt: morning, ...current },
  minimumTemperatureCelsius: 12, maximumTemperatureCelsius: 28, hourly,
});
const find = (hourly, { now = morning, firstInsight = null, current = measurement() } = {}) =>
  findDayWindow({ snapshot: snapshot(hourly, current), now, firstInsight });

test('wet threshold, run edges and snow form use the first window', () => {
  assert.deepEqual(find(hours(8, 23, {
    9: { precipitationProbability: precipitationLikelyThreshold },
    10: { condition: 'rain' },
  })), { kind: 'rain', fromHour: at(9), untilHour: at(11) });
  assert.equal(find(hours(8, 23, {
    9: { precipitationProbability: precipitationLikelyThreshold - 0.01 },
  })), null);
  assert.deepEqual(find(hours(8, 23, { 8: { condition: 'snow' }, 9: { condition: 'snow' } }), {
    current: measurement({ condition: 'snow' }),
  }), {
    kind: 'snow', fromHour: null, untilHour: at(10),
  });
  assert.deepEqual(find(hours(8, 23, { 8: { condition: 'snow' } })), {
    kind: 'snow', fromHour: at(8), untilHour: at(9),
  });
  assert.deepEqual(find(hours(8, 23, { 22: { condition: 'rain' }, 23: { condition: 'rain' } })), {
    kind: 'rain', fromHour: at(22), untilHour: null,
  });
});

test('a wet first insight skips precipitation but still finds the next rule', () => {
  const hourly = hours(8, 23, {
    9: { condition: 'rain' }, 22: { apparentTemperatureCelsius: hotCelsius },
    23: { apparentTemperatureCelsius: hotCelsius },
  });
  assert.equal(find(hourly).kind, 'rain');
  assert.deepEqual(find(hourly, { firstInsight: {
    kind: 'wet_window', form: 'rain', fromHour: at(9), untilHour: at(10),
  } }), { kind: 'stays_hot', fromHour: at(22) });
});

test('hot and cold runs are inclusive, last two hours minimum, and reach the end', () => {
  const ending = (value) => hours(8, 23, {
    22: { apparentTemperatureCelsius: value }, 23: { apparentTemperatureCelsius: value },
  });
  assert.deepEqual(find(ending(veryHotCelsius)), { kind: 'stays_very_hot', fromHour: at(22) });
  assert.deepEqual(find(ending(veryHotCelsius - 0.1)), { kind: 'stays_hot', fromHour: at(22) });
  assert.deepEqual(find(ending(hotCelsius)), { kind: 'stays_hot', fromHour: at(22) });
  assert.equal(find(ending(hotCelsius - 0.1)), null);
  assert.deepEqual(find(ending(freezingCelsius)), { kind: 'stays_freezing', fromHour: at(22) });
  assert.deepEqual(find(ending(freezingCelsius + 0.1)), { kind: 'stays_cold', fromHour: at(22) });
  assert.deepEqual(find(ending(chillyCelsius)), { kind: 'stays_cold', fromHour: at(22) });
  assert.equal(find(ending(chillyCelsius + 0.1)), null);
  assert.equal(find(hours(8, 23, { 23: { apparentTemperatureCelsius: veryHotCelsius } })).kind,
    'temperature_change');
  assert.equal(find(hours(8, 23, {
    20: { apparentTemperatureCelsius: veryHotCelsius },
    21: { apparentTemperatureCelsius: veryHotCelsius },
  })).kind, 'temperature_change');
});

test('wind thresholds, first interval and priority after heat', () => {
  const windy = hours(8, 23, {
    10: { windSpeedMetersPerSecond: windyMetersPerSecond },
    11: { windSpeedMetersPerSecond: veryWindyMetersPerSecond },
  });
  assert.deepEqual(find(windy), { kind: 'very_windy', fromHour: at(10), untilHour: at(12) });
  assert.equal(find(hours(8, 23, {
    10: { windSpeedMetersPerSecond: windyMetersPerSecond - 0.1 },
  })), null);
  assert.deepEqual(find(hours(8, 23, {
    10: { windSpeedMetersPerSecond: windyMetersPerSecond },
  })), { kind: 'wind', fromHour: at(10), untilHour: at(11) });
  assert.equal(find(hours(8, 23, {
    10: { windSpeedMetersPerSecond: windyMetersPerSecond },
    22: { apparentTemperatureCelsius: hotCelsius },
    23: { apparentTemperatureCelsius: hotCelsius },
  })).kind, 'stays_hot');
});

test('the rule order is wet, sustained heat, wind, then a temperature swing', () => {
  const base = {
    10: { condition: 'rain' },
    14: { windSpeedMetersPerSecond: windyMetersPerSecond },
    15: { apparentTemperatureCelsius: 20 + temperatureSwingCelsius },
    22: { apparentTemperatureCelsius: hotCelsius },
    23: { apparentTemperatureCelsius: hotCelsius },
  };
  assert.equal(find(hours(8, 23, base)).kind, 'rain');
  const wetInsight = { kind: 'wet_window', form: 'rain', fromHour: at(10), untilHour: at(11) };
  assert.equal(find(hours(8, 23, base), { firstInsight: wetInsight }).kind, 'stays_hot');
  const withoutHeat = { ...base, 22: {}, 23: {} };
  assert.equal(find(hours(8, 23, withoutHeat), { firstInsight: wetInsight }).kind, 'wind');
  assert.equal(find(hours(8, 23, { ...withoutHeat, 14: {} }), {
    firstInsight: wetInsight,
  }).kind, 'temperature_change');
});

test('temperature change reuses the swing threshold and evening can name its lowest hour', () => {
  assert.deepEqual(find(hours(8, 23, {
    15: { apparentTemperatureCelsius: 20 - temperatureSwingCelsius },
  })), { kind: 'temperature_change', direction: 'drop', atHour: at(15), toCelsius: 12 });
  assert.equal(find(hours(8, 23, {
    15: { apparentTemperatureCelsius: 20 - temperatureSwingCelsius + 0.1 },
  })), null);
  assert.deepEqual(find(hours(19, 27, {
    25: { apparentTemperatureCelsius: 12 }, 27: { apparentTemperatureCelsius: 9 },
  }), { now: evening }), { kind: 'lowest', atHour: at(27), temperatureCelsius: 9 });
});

test('dressing-day boundary, forecast coverage, and null case', () => {
  assert.deepEqual(find([...hours(8, 23), hour(24, { condition: 'rain' })]), null);
  assert.deepEqual(find(hours(19, 27, { 26: { condition: 'rain' } }), { now: evening }), {
    kind: 'rain', fromHour: at(26), untilHour: at(27),
  });
  assert.equal(find(hours(19, 24, { 23: { condition: 'rain' } }), { now: evening }), null);
  assert.equal(find(hours(8, 23).filter(({ forecastAt }) => forecastAt !== at(12))), null);
  assert.equal(find(hours(12, 23, { 12: { condition: 'rain' } })), null);
  assert.equal(find(hours(8, 23), { now: 'invalid' }), null);
});
