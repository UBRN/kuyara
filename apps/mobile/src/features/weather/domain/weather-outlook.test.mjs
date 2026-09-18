import assert from 'node:assert/strict';
import test from 'node:test';

import { findWeatherOutlook } from './weather-outlook.ts';
import { temperatureSwingCelsius } from './weather-thresholds.ts';

// Europe/Istanbul is UTC+3 all year, so 08:00Z is 11:00 local and the local day still has
// hours left; a snapshot is only ever read against the day the person is living.
const timeZone = 'Europe/Istanbul';
const now = '2026-09-09T08:00:00.000Z';

function measurements(overrides = {}) {
  return {
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 0,
    humidity: 0.5,
    uvIndex: 0,
    ...overrides,
  };
}

function hour(forecastAt, overrides = {}) {
  return { forecastAt, ...measurements(overrides) };
}

function snapshot(overrides = {}) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone,
    fetchedAt: now,
    origin: { kind: 'live', sourceId: 'open-meteo' },
    current: { observedAt: now, ...measurements() },
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 24,
    hourly: [],
    ...overrides,
  };
}

function find(input, clock = now) {
  return findWeatherOutlook({ snapshot: input, now: clock });
}

test('a dry now crossing into a wet hour is an onset at that hour', () => {
  const result = find(snapshot({
    hourly: [
      hour('2026-09-09T09:00:00.000Z'),
      hour('2026-09-09T10:00:00.000Z', { condition: 'rain' }),
      hour('2026-09-09T11:00:00.000Z', { condition: 'rain' }),
    ],
  }));
  assert.deepEqual(result, {
    kind: 'precipitation_onset',
    form: 'rain',
    atHour: '2026-09-09T10:00:00.000Z',
  });
});

test('the onset form follows the arriving hour and the easing form the current condition', () => {
  const onset = find(snapshot({
    hourly: [hour('2026-09-09T10:00:00.000Z', { condition: 'sleet' })],
  }));
  assert.equal(onset.kind, 'precipitation_onset');
  assert.equal(onset.form, 'snow');

  const easing = find(snapshot({
    current: { observedAt: now, ...measurements({ condition: 'snow' }) },
    hourly: [
      hour('2026-09-09T10:00:00.000Z', { condition: 'snow' }),
      hour('2026-09-09T11:00:00.000Z', { condition: 'cloudy' }),
    ],
  }));
  assert.deepEqual(easing, {
    kind: 'precipitation_easing',
    form: 'snow',
    atHour: '2026-09-09T11:00:00.000Z',
  });
});

test('probability alone crosses the wetness boundary, as it does for the alert rules', () => {
  const dry = find(snapshot({
    hourly: [hour('2026-09-09T10:00:00.000Z', { precipitationProbability: 0.59 })],
  }));
  assert.equal(dry, null);

  const wet = find(snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', { precipitationProbability: 0.6 }),
      hour('2026-09-09T11:00:00.000Z'),
    ],
  }));
  assert.equal(wet.kind, 'precipitation_onset');
  assert.equal(wet.atHour, '2026-09-09T10:00:00.000Z');
});

test('a likely but not falling now eases nothing; a wet condition still does', () => {
  const dryHours = [
    hour('2026-09-09T10:00:00.000Z'),
    hour('2026-09-09T11:00:00.000Z'),
  ];

  // Probability alone makes the current hour wet for the alert rules, but the screen reads
  // "Cloudy" above the line, so "rain eases at 11:00" would contradict it.
  const likely = find(snapshot({
    current: {
      observedAt: now,
      ...measurements({ condition: 'cloudy', precipitationProbability: 0.7 }),
    },
    hourly: dryHours,
  }));
  assert.deepEqual(likely, { kind: 'steady', period: 'day' });

  const falling = find(snapshot({
    current: {
      observedAt: now,
      ...measurements({ condition: 'rain', precipitationProbability: 0.7 }),
    },
    hourly: dryHours,
  }));
  assert.deepEqual(falling, {
    kind: 'precipitation_easing',
    form: 'rain',
    atHour: '2026-09-09T10:00:00.000Z',
  });
});

test('an apparent swing at or above the threshold is a temperature change with its direction', () => {
  const drop = find(snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', {
        apparentTemperatureCelsius: 20 - temperatureSwingCelsius + 0.1,
      }),
      hour('2026-09-09T11:00:00.000Z', {
        apparentTemperatureCelsius: 20 - temperatureSwingCelsius,
      }),
    ],
  }));
  assert.deepEqual(drop, {
    kind: 'temperature_change',
    direction: 'drop',
    atHour: '2026-09-09T11:00:00.000Z',
    fromApparentCelsius: 20,
    toApparentCelsius: 12,
  });

  const rise = find(snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', {
        apparentTemperatureCelsius: 20 + temperatureSwingCelsius,
      }),
      hour('2026-09-09T11:00:00.000Z'),
    ],
  }));
  assert.equal(rise.kind, 'temperature_change');
  assert.equal(rise.direction, 'rise');
});

test('the earliest transition wins and a tie goes to precipitation', () => {
  const temperatureFirst = find(snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', { apparentTemperatureCelsius: 30 }),
      hour('2026-09-09T11:00:00.000Z', { condition: 'rain' }),
    ],
  }));
  assert.equal(temperatureFirst.kind, 'temperature_change');
  assert.equal(temperatureFirst.atHour, '2026-09-09T10:00:00.000Z');

  const tied = find(snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', {
        apparentTemperatureCelsius: 30,
        condition: 'rain',
      }),
      hour('2026-09-09T11:00:00.000Z', { condition: 'rain' }),
    ],
  }));
  assert.equal(tied.kind, 'precipitation_onset');
  assert.equal(tied.atHour, '2026-09-09T10:00:00.000Z');
});

test('hours already past and hours past the window end are both outside it', () => {
  const result = find(snapshot({
    hourly: [
      hour('2026-09-09T07:00:00.000Z', { condition: 'rain' }),
      hour('2026-09-09T09:00:00.000Z'),
      hour('2026-09-09T10:00:00.000Z'),
      // 22:00Z is 01:00 the next day in Istanbul, past the day period's midnight end.
      hour('2026-09-09T22:00:00.000Z', { condition: 'rain' }),
    ],
  }));
  assert.deepEqual(result, { kind: 'steady', period: 'day' });
});

test('an evening line reads the night it runs into and says so', () => {
  // 19:00 local in Istanbul. The window now reaches 04:00, so the 01:00 hour is a
  // transition the line has to name instead of an hour belonging to someone else's day.
  const evening = '2026-09-09T16:00:00.000Z';
  const result = find(snapshot({
    hourly: [
      hour('2026-09-09T18:00:00.000Z'),
      hour('2026-09-09T22:00:00.000Z', { condition: 'rain' }),
    ],
  }), evening);
  assert.deepEqual(result, {
    kind: 'precipitation_onset',
    form: 'rain',
    atHour: '2026-09-09T22:00:00.000Z',
  });
});

test('the steady line survives an evening that used to have too few hours left', () => {
  // 22:30 local: the calendar day has one hour left and drew no line, while the dressing
  // day still has five and the period is what tells the screen to say tonight.
  const lateEvening = '2026-09-09T19:30:00.000Z';
  assert.deepEqual(find(snapshot({
    hourly: [
      hour('2026-09-09T20:00:00.000Z'),
      hour('2026-09-09T22:00:00.000Z'),
      hour('2026-09-10T00:00:00.000Z'),
    ],
  }), lateEvening), { kind: 'steady', period: 'evening' });
});

test('two remaining hours without a transition are steady, fewer draw no line at all', () => {
  const hourly = [hour('2026-09-09T09:00:00.000Z'), hour('2026-09-09T10:00:00.000Z')];
  assert.deepEqual(find(snapshot({ hourly })), { kind: 'steady', period: 'day' });
  assert.equal(find(snapshot({ hourly: hourly.slice(0, 1) })), null);
  assert.equal(find(snapshot({ hourly: [] })), null);
});

test('an unparseable clock plans nothing', () => {
  assert.equal(find(snapshot({ hourly: [hour('2026-09-09T10:00:00.000Z')] }), 'not-a-time'), null);
});

test('the same snapshot and the same now give the same outlook', () => {
  const input = snapshot({
    hourly: [
      hour('2026-09-09T10:00:00.000Z', { condition: 'rain' }),
      hour('2026-09-09T11:00:00.000Z', { apparentTemperatureCelsius: 30 }),
    ],
  });
  assert.deepEqual(find(input), find(input));
});
