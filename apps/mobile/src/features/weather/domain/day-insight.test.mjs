import assert from 'node:assert/strict';
import test from 'node:test';

import { findDayInsight } from './day-insight.ts';
import {
  chillyCelsius,
  freezingCelsius,
  hotCelsius,
  precipitationLikelyThreshold,
  veryHotCelsius,
  veryWindyMetersPerSecond,
  windyMetersPerSecond,
} from './weather-thresholds.ts';

// Europe/Istanbul is UTC+3 all year, so the local hour is the UTC hour plus three and no
// daylight-saving edge hides inside these rows. The dressing-day boundary itself is proved
// in wardrobe-day.test.mjs; what is proved here is what the rules say about the hours.
const timeZone = 'Europe/Istanbul';
/** 08:00 local: the day period, whose window ends at the next local midnight. */
const morning = '2026-09-09T05:00:00.000Z';
/** 19:00 local: the evening period, whose window runs on to 04:00 the next local day. */
const evening = '2026-09-09T16:00:00.000Z';

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

// The local hour counted from midnight on 9 September, so 24 and beyond are the small hours
// of the 10th; UTC+3 and the overflow arithmetic do the rest.
function utcHour(localHour) {
  return new Date(Date.UTC(2026, 8, 9, localHour - 3)).toISOString();
}

function hour(localHour, overrides = {}) {
  return { forecastAt: utcHour(localHour), ...measurements(overrides) };
}

/**
 * The remaining hours of the local day at `morning`: 08:00 through 23:00 local, each one
 * plain unless the row overrides it by its local hour.
 */
function dayHours(overridesByLocalHour = {}) {
  const hours = [];
  for (let localHour = 8; localHour <= 23; localHour += 1) {
    hours.push(hour(localHour, overridesByLocalHour[localHour] ?? {}));
  }
  return hours;
}

/** 19:00 local through 03:00 the next local day: the evening window's own hours. */
function eveningHours(overridesByLocalHour = {}) {
  const hours = [];
  for (let localHour = 19; localHour <= 27; localHour += 1) {
    hours.push(hour(localHour, overridesByLocalHour[localHour] ?? {}));
  }
  return hours;
}

function snapshot(hourly, overrides = {}) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone,
    fetchedAt: morning,
    origin: { kind: 'live', sourceId: 'open-meteo' },
    current: { observedAt: morning, ...measurements() },
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 24,
    hourly,
    ...overrides,
  };
}

function find(hourly, now = morning, snapshotOverrides = {}) {
  return findDayInsight({ snapshot: snapshot(hourly, snapshotOverrides), now });
}

const wet = { condition: 'rain' };

test('a day wet in every remaining hour is wet all day', () => {
  assert.deepEqual(find(dayHours(Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [index + 8, wet]),
  ))), { kind: 'wet_all_day', form: 'rain', period: 'day' });
});

test('sleet and snow read as snow, every other wet hour as rain', () => {
  const allSleet = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [index + 8, { condition: 'sleet' }]),
  );
  assert.equal(find(dayHours(allSleet)).form, 'snow');
  const allDrizzle = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [index + 8, { condition: 'drizzle' }]),
  );
  assert.equal(find(dayHours(allDrizzle)).form, 'rain');
});

test('a wet run inside the day names where it begins and where it has stopped', () => {
  assert.deepEqual(find(dayHours({ 11: wet, 12: wet, 13: wet, 14: wet, 15: wet })), {
    kind: 'wet_window',
    form: 'rain',
    fromHour: utcHour(11),
    untilHour: utcHour(16),
  });
});

test('a run already falling in the first remaining hour names no beginning', () => {
  // The hour that sits exactly on `now` is part of the day, which is why this run has no
  // dry hour in front of it to name.
  assert.deepEqual(find(dayHours({ 8: wet, 9: wet })), {
    kind: 'wet_window',
    form: 'rain',
    fromHour: null,
    untilHour: utcHour(10),
  });
});

test('a run that reaches the end of the window names no end', () => {
  assert.deepEqual(find(dayHours({ 20: wet, 21: wet, 22: wet, 23: wet })), {
    kind: 'wet_window',
    form: 'rain',
    fromHour: utcHour(20),
    untilHour: null,
  });
});

test('the first of two wet runs in one day wins', () => {
  assert.deepEqual(find(dayHours({ 10: wet, 11: wet, 18: wet, 19: wet })), {
    kind: 'wet_window',
    form: 'rain',
    fromHour: utcHour(10),
    untilHour: utcHour(12),
  });
});

test('an hour exactly at the likely threshold is wet and one just under it is not', () => {
  assert.deepEqual(
    find(dayHours({ 11: { precipitationProbability: precipitationLikelyThreshold } })),
    { kind: 'wet_window', form: 'rain', fromHour: utcHour(11), untilHour: utcHour(12) },
  );
  assert.deepEqual(
    find(dayHours({ 11: { precipitationProbability: precipitationLikelyThreshold - 0.01 } })),
    { kind: 'clear_all_day', period: 'day', modifier: null },
  );
});

test('each sky family that holds all day gets its own insight', () => {
  const everyHour = (overrides) => Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [index + 8, overrides]),
  );
  assert.equal(find(dayHours()).kind, 'clear_all_day');
  assert.equal(find(dayHours(everyHour({ condition: 'mostly_clear' }))).kind, 'clear_all_day');
  assert.equal(find(dayHours(everyHour({ condition: 'cloudy' }))).kind, 'cloudy_all_day');
  assert.equal(
    find(dayHours(everyHour({ condition: 'partly_cloudy' }))).kind,
    'cloudy_all_day',
  );
  assert.equal(find(dayHours(everyHour({ condition: 'fog' }))).kind, 'foggy_all_day');
  // Fog is its own sentence only when it is the whole day; beside cloud it is veiled sky.
  assert.equal(find(dayHours({ ...everyHour({ condition: 'fog' }), 12: { condition: 'cloudy' } })).kind,
    'cloudy_all_day');
});

test('a sky that changes family all day has no all-day insight', () => {
  // Clear until noon and cloudy after is not a day with one shape, so the line falls through
  // to what the temperature and the wind have to say, and here they say nothing.
  assert.equal(find(dayHours({ 13: { condition: 'cloudy' } })), null);
});

test('the temperature boundaries ride on an all-day sky as a modifier', () => {
  const modifierAt = (apparentTemperatureCelsius) =>
    find(dayHours({ 15: { apparentTemperatureCelsius } })).modifier;

  assert.deepEqual(modifierAt(veryHotCelsius), { kind: 'heat', level: 'very_hot' });
  assert.deepEqual(modifierAt(veryHotCelsius - 0.1), { kind: 'heat', level: 'hot' });
  assert.deepEqual(modifierAt(hotCelsius), { kind: 'heat', level: 'hot' });
  assert.equal(modifierAt(hotCelsius - 0.1), null);
  assert.equal(modifierAt(chillyCelsius), null);
  assert.deepEqual(modifierAt(chillyCelsius - 0.1), { kind: 'cold', level: 'chilly' });
  assert.deepEqual(modifierAt(freezingCelsius), { kind: 'cold', level: 'chilly' });
  assert.deepEqual(modifierAt(freezingCelsius - 0.1), { kind: 'cold', level: 'freezing' });
});

test('a day that is both freezing and very hot is described by its cold', () => {
  const both = find(dayHours({
    9: { apparentTemperatureCelsius: freezingCelsius - 1 },
    15: { apparentTemperatureCelsius: veryHotCelsius + 1 },
  }));
  assert.deepEqual(both.modifier, { kind: 'cold', level: 'freezing' });
  // One rung down on the cold side and the heat is the more extreme of the two.
  const hotter = find(dayHours({
    9: { apparentTemperatureCelsius: chillyCelsius - 1 },
    15: { apparentTemperatureCelsius: veryHotCelsius + 1 },
  }));
  assert.deepEqual(hotter.modifier, { kind: 'heat', level: 'very_hot' });
});

test('with no sky to describe the temperature extreme becomes the insight itself', () => {
  const mixedSky = { 13: { condition: 'cloudy' } };
  assert.deepEqual(find(dayHours({
    ...mixedSky,
    15: { apparentTemperatureCelsius: veryHotCelsius },
  })), { kind: 'heat', level: 'very_hot', atHour: utcHour(15) });
  assert.deepEqual(find(dayHours({
    ...mixedSky,
    9: { apparentTemperatureCelsius: freezingCelsius - 1 },
  })), { kind: 'cold', level: 'freezing', atHour: utcHour(9) });
});

test('wind describes a day only when nothing above it fired', () => {
  const mixedSky = { 13: { condition: 'cloudy' } };
  const windAt = (windSpeedMetersPerSecond) =>
    find(dayHours({ ...mixedSky, 14: { windSpeedMetersPerSecond } }));

  assert.deepEqual(windAt(veryWindyMetersPerSecond), { kind: 'windy', level: 'very_windy' });
  assert.deepEqual(windAt(windyMetersPerSecond), { kind: 'windy', level: 'windy' });
  assert.equal(windAt(windyMetersPerSecond - 0.1), null);
  // A wet day stays a wet day however hard it blows: rain is never outranked by wind.
  assert.equal(find(dayHours({
    10: wet,
    14: { windSpeedMetersPerSecond: veryWindyMetersPerSecond },
  })).kind, 'wet_window');
});

test('an hour at the window end belongs to the next day, not to this one', () => {
  // Midnight local is the end of the day window, so a wet midnight hour cannot make the day
  // it closes wet.
  const withMidnight = [...dayHours(), hour(24, wet)];
  assert.deepEqual(find(withMidnight), { kind: 'clear_all_day', period: 'day', modifier: null });
});

test('an evening window carries its own period and reaches past midnight', () => {
  assert.deepEqual(find(eveningHours(), evening), {
    kind: 'clear_all_day',
    period: 'evening',
    modifier: null,
  });
  assert.deepEqual(find(eveningHours(Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [index + 19, wet]),
  )), evening), { kind: 'wet_all_day', form: 'rain', period: 'evening' });
});

test('two remaining hours still describe the day and one does not', () => {
  // 01:10 local, inside the overnight stretch of the evening that began yesterday, whose
  // window closes at 04:00: two hours are left, then one.
  const twoLeft = findDayInsight({
    snapshot: snapshot([hour(26), hour(27)]),
    now: '2026-09-09T22:10:00.000Z',
  });
  assert.deepEqual(twoLeft, { kind: 'clear_all_day', period: 'evening', modifier: null });
  assert.equal(findDayInsight({
    snapshot: snapshot([hour(27)]),
    now: '2026-09-09T23:10:00.000Z',
  }), null);
});

test('a snapshot that stops short of the window describes nothing', () => {
  // Hours to 14:00 local against a window that runs to midnight: enough hours to talk about,
  // and no right to call any of it the day.
  assert.equal(find(dayHours().slice(0, 7)), null);
});

test('an unreadable instant or time zone returns nothing', () => {
  assert.equal(find(dayHours(), 'not-an-instant'), null);
  assert.equal(find(dayHours(), morning, { timeZone: 'Mars/Olympus' }), null);
});

test('the projection is pure and leaves its input alone', () => {
  const hourly = dayHours({ 11: wet, 12: wet });
  const first = findDayInsight({ snapshot: snapshot(hourly), now: morning });
  const second = findDayInsight({ snapshot: snapshot(hourly), now: morning });
  assert.deepEqual(first, second);
  assert.deepEqual(hourly, dayHours({ 11: wet, 12: wet }));
});
