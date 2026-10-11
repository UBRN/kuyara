import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { weatherConditionCodes } from '@/features/weather/domain/weather';
import {
  precipitationLikelyThreshold,
  temperatureSwingCelsius,
} from '@/features/weather/domain/weather-thresholds';
import {
  defaultQuietHours,
  deviceQuietHours,
  planWeatherAlerts,
  weatherAlertBackgroundLeadTimeMinutes,
  weatherAlertLeadTimeMinutes,
  weatherAlertMinimumLeadAfterQuietHoursMinutes,
} from './weather-alerts.ts';

const now = '2026-09-09T08:00:00.000Z';
const crossingAt = '2026-09-09T10:00:00.000Z';
const locationKey = 'manual:sample.istanbul';

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

function hour(forecastAt = crossingAt, overrides = {}) {
  return { forecastAt, ...measurements(overrides) };
}

function snapshot(overrides = {}) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey,
    timeZone: 'UTC',
    fetchedAt: now,
    current: { observedAt: now, ...measurements() },
    origin: { kind: 'sample', sourceId: 'alerts-test' },
    minimumTemperatureCelsius: 20,
    maximumTemperatureCelsius: 21,
    hourly: [hour()],
    ...overrides,
  };
}

function plan(weather = snapshot(), overrides = {}) {
  return planWeatherAlerts({
    snapshot: weather,
    now,
    quietHours: { ...defaultQuietHours, timeZone: 'UTC' },
    deliveredAlertIds: new Set(),
    ...overrides,
  });
}

test('precipitation onset starts at probability 0.6, not 0.59', () => {
  assert.deepEqual(plan(snapshot({
    hourly: [hour(crossingAt, { precipitationProbability: 0.59 })],
  })), []);
  assert.deepEqual(plan(snapshot({
    current: { observedAt: now, ...measurements({ precipitationProbability: 0.59 }) },
    hourly: [hour(crossingAt, { precipitationProbability: 0.6 })],
  })), [{
    id: `precipitation_onset:${locationKey}:2026-09-09`,
    ruleId: 'precipitation_onset',
    locationKey,
    crossingAt,
    fireAt: '2026-09-09T09:00:00.000Z',
    detail: { kind: 'precipitation', form: 'rain' },
  }]);
});

test('wet conditions override low probability and distinguish snow from rain', () => {
  const wetConditions = ['drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm'];
  for (const condition of weatherConditionCodes) {
    const result = plan(snapshot({ hourly: [hour(crossingAt, { condition })] }));
    if (wetConditions.includes(condition)) {
      assert.deepEqual(result[0].detail, {
        kind: 'precipitation',
        form: condition === 'sleet' || condition === 'snow' ? 'snow' : 'rain',
      }, condition);
    } else {
      assert.deepEqual(result, [], condition);
    }
  }
});

test('already wet current measurements suppress onset but allow an independent swing', () => {
  for (const current of [
    { precipitationProbability: 0.6 },
    ...['drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm']
      .map((condition) => ({ condition })),
  ]) {
    const result = plan(snapshot({
      current: { observedAt: now, ...measurements(current) },
      hourly: [hour(crossingAt, { condition: 'rain', apparentTemperatureCelsius: 12 })],
    }));
    assert.deepEqual(result.map(({ ruleId }) => ruleId), ['temperature_swing']);
  }
});

test('apparent temperature swings start at exactly eight degrees in both directions', () => {
  for (const [temperature, direction] of [[12.1, null], [12, 'drop'], [27.9, null], [28, 'rise']]) {
    const result = plan(snapshot({ hourly: [hour(crossingAt, {
      apparentTemperatureCelsius: temperature,
    })] }));
    assert.equal(result.length, direction ? 1 : 0);
    if (direction) {
      assert.deepEqual(result[0].detail, {
        kind: 'temperature', direction, fromApparentCelsius: 20, toApparentCelsius: temperature,
      });
    }
  }
  assert.deepEqual(plan(snapshot({
    hourly: [hour(crossingAt, { temperatureCelsius: 5 })],
  })), []);
});

test('the first swing wins whether the drop or rise comes first', () => {
  for (const [first, second, direction] of [[12, 28, 'drop'], [28, 12, 'rise']]) {
    const result = plan(snapshot({ hourly: [
      hour(crossingAt, { apparentTemperatureCelsius: first }),
      hour('2026-09-09T11:00:00.000Z', { apparentTemperatureCelsius: second }),
    ] }));
    assert.equal(result.length, 1);
    assert.equal(result[0].crossingAt, crossingAt);
    assert.equal(result[0].detail.direction, direction);
  }
});

test('lead time rejects 59 minutes and accepts exactly 60 and 61 minutes for both rules', () => {
  for (const minutes of [59, 60, 61]) {
    const crossing = new Date(Date.parse(now) + minutes * 60_000).toISOString();
    const result = plan(snapshot({ hourly: [hour(crossing, {
      condition: 'rain', apparentTemperatureCelsius: 12,
    })] }));
    assert.equal(result.length, minutes < 60 ? 0 : 2);
    for (const alert of result) {
      assert.equal(Date.parse(alert.fireAt), Date.parse(crossing) - 60 * 60_000);
    }
  }
});

test('a first crossing with insufficient lead falls through only to a swing still 8 degrees from its delivery reading', () => {
  // The rain at 08:59 is too close to announce, and precipitation never moves on to a later
  // hour. The 10:00 swing is measured from what 09:00, its delivery moment, will feel like.
  assert.deepEqual(plan(snapshot({ hourly: [
    hour('2026-09-09T08:59:00.000Z', { condition: 'rain', apparentTemperatureCelsius: 12 }),
    hour(crossingAt, { condition: 'snow', apparentTemperatureCelsius: 28 }),
  ] })).map(({ ruleId, fireAt, detail }) => ({ ruleId, fireAt, detail })), [{
    ruleId: 'temperature_swing',
    fireAt: '2026-09-09T09:00:00.000Z',
    detail: { kind: 'temperature', direction: 'rise', fromApparentCelsius: 12, toApparentCelsius: 28 },
  }]);
  assert.deepEqual(plan(snapshot({ hourly: [
    hour('2026-09-09T08:59:00.000Z', { condition: 'rain', apparentTemperatureCelsius: 12 }),
    hour(crossingAt, { condition: 'snow', apparentTemperatureCelsius: 19 }),
  ] })), []);
});

/** One hourly reading per hour from `start`. */
function hourlySeries(start, apparentTemperatures) {
  return apparentTemperatures.map((apparentTemperatureCelsius, index) => hour(
    new Date(Date.parse(start) + index * 60 * 60_000).toISOString(),
    { apparentTemperatureCelsius },
  ));
}

function openedAt(clock, current, hourly) {
  return plan(snapshot({
    fetchedAt: clock,
    current: { observedAt: clock, ...measurements({ apparentTemperatureCelsius: current }) },
    hourly,
  }), { now: clock });
}

test('a gradual drop is planned the same from every open before it begins and fires before it starts', () => {
  // 20 until 11:00, then 2.5 degrees an hour down to 10 at 15:00. The first hour 8 degrees
  // below 20 is 15:00; at 14:00, its usual fire time, it already feels 12.5, so the alert
  // moves to the last minute that still feels 20. Every open up to then plans the same alert,
  // so an open during the drop finds it delivered instead of cancelling it.
  const hourly = hourlySeries('2026-09-09T09:00:00.000Z', [20, 20, 20, 17.5, 15, 12.5, 10, 10]);
  const expected = [{
    id: `temperature_swing:${locationKey}:2026-09-09`,
    ruleId: 'temperature_swing',
    locationKey,
    crossingAt: '2026-09-09T15:00:00.000Z',
    fireAt: '2026-09-09T11:59:00.000Z',
    detail: { kind: 'temperature', direction: 'drop', fromApparentCelsius: 20, toApparentCelsius: 10 },
  }];
  for (const clock of [
    '2026-09-09T08:00:00.000Z',
    '2026-09-09T09:30:00.000Z',
    '2026-09-09T10:10:00.000Z',
    '2026-09-09T11:00:00.000Z',
    '2026-09-09T11:40:00.000Z',
  ]) {
    assert.deepEqual(openedAt(clock, 20, hourly), expected, clock);
  }
  // Once the drop is under way, no hour is 8 degrees from the felt temperature any more.
  assert.deepEqual(openedAt('2026-09-09T12:10:00.000Z', 17.5, hourly), []);
});

test('a swing is never planned for a moment that already feels within 8 degrees of the crossing hour', () => {
  // A slow warm-up from 10 at 07:15: 13:00 is the first hour 8 degrees warmer, but at 12:00,
  // its usual fire time, it already feels 17.5. The alert moves to the last minute that still
  // feels 10, and an open after that hour plans nothing.
  const hourly = hourlySeries('2026-09-09T08:00:00.000Z', [11.5, 13, 14.5, 16, 17.5, 18.5, 19]);
  assert.deepEqual(openedAt('2026-09-09T07:15:00.000Z', 10, hourly)
    .map(({ crossingAt: at, fireAt, detail }) => ({ at, fireAt, detail })), [{
    at: '2026-09-09T13:00:00.000Z',
    fireAt: '2026-09-09T07:59:00.000Z',
    detail: { kind: 'temperature', direction: 'rise', fromApparentCelsius: 10, toApparentCelsius: 18.5 },
  }]);
  assert.deepEqual(openedAt('2026-09-09T08:15:00.000Z', 11.5, hourly), []);
});

test('a swing moved earlier than 18:00 keeps the evening identity of its crossing', () => {
  // The drop to 13 at 22:00 is 8 degrees only from the afternoon's 22, so it is announced in
  // the last minute of 17:00, under the evening id the replan after 18:00 finds delivered.
  const hourly = hourlySeries('2026-09-09T13:00:00.000Z', [22, 22, 22, 22, 22, 19, 17, 16, 15, 13]);
  assert.deepEqual(openedAt('2026-09-09T12:00:00.000Z', 22, hourly)
    .map(({ id, crossingAt: at, fireAt }) => ({ id, at, fireAt })), [{
    id: `temperature_swing:${locationKey}:2026-09-09:evening`,
    at: '2026-09-09T22:00:00.000Z',
    fireAt: '2026-09-09T17:59:00.000Z',
  }]);
});

test('a delivered swing is not announced again from the readings before it under the evening id', () => {
  // The 12:00 drop was announced at 11:00. At 11:10 the evening hours still stand 8 degrees
  // below 11:00's reading, but that is the same drop, so nothing more is planned.
  const hourly = hourlySeries('2026-09-09T12:00:00.000Z', [12, 12, 12, 12, 12, 12, 12, 12]);
  assert.deepEqual(plan(snapshot({
    fetchedAt: '2026-09-09T11:10:00.000Z',
    current: { observedAt: '2026-09-09T11:10:00.000Z', ...measurements() },
    hourly,
  }), {
    now: '2026-09-09T11:10:00.000Z',
    deliveredAlertIds: new Set([`temperature_swing:${locationKey}:2026-09-09`]),
  }), []);
});

test('a warm-up is planned the same whether the day was first opened before dawn or after waking', () => {
  // The night low falls in quiet hours, when no alert arrives, so it is never a delivery
  // reading: both opens measure the afternoon from 07:00, the first hour an alert may arrive in.
  const hourly = hourlySeries('2026-09-09T04:00:00.000Z',
    [9, 9.5, 10.5, 12, 13.5, 15, 16.5, 18, 19.2, 20.2, 20.8, 21, 20.8]);
  const afterWaking = openedAt('2026-09-09T07:15:00.000Z', 12, hourly);
  assert.deepEqual(afterWaking.map(({ crossingAt: at, fireAt }) => ({ at, fireAt })), [{
    at: '2026-09-09T13:00:00.000Z',
    fireAt: '2026-09-09T07:59:00.000Z',
  }]);
  assert.deepEqual(openedAt('2026-09-09T04:10:00.000Z', 9, hourly), afterWaking);
  // A warm-up never 8 degrees above any hour an alert may arrive in plans nothing for either.
  const milder = hourlySeries('2026-09-09T04:00:00.000Z',
    [9, 9.5, 10.5, 12.5, 13.5, 15, 16.5, 18, 19, 20, 20.4, 20.4, 20.3]);
  for (const [clock, current] of [['2026-09-09T04:10:00.000Z', 9], ['2026-09-09T07:15:00.000Z', 12.5]]) {
    assert.deepEqual(openedAt(clock, current, milder), [], clock);
  }
});

test('past and exactly-now hours are excluded, and an empty remainder has no daily-extrema fallback', () => {
  const past = hour('2026-09-09T07:00:00.000Z', { condition: 'rain', apparentTemperatureCelsius: 0 });
  const present = hour(now, { condition: 'snow', apparentTemperatureCelsius: 40 });
  for (const hourly of [[], [past, present]]) {
    assert.deepEqual(plan(snapshot({ hourly, minimumTemperatureCelsius: 0, maximumTemperatureCelsius: 40 })), []);
  }
  const result = plan(snapshot({ hourly: [past, present, hour(crossingAt, { condition: 'rain' })] }));
  assert.equal(result.length, 1);
  assert.equal(result[0].crossingAt, crossingAt);
});

test('next-day crossings do not schedule today\'s alerts', () => {
  assert.deepEqual(plan(snapshot({
    hourly: [hour('2026-09-10T01:00:00.000Z', {
      condition: 'rain',
      apparentTemperatureCelsius: 12,
    })],
  })), []);
});

test('quiet hours move to 07:00 local only with at least 30 minutes left', () => {
  for (const [timeZone, localSeven] of [
    ['UTC', '2026-09-09T07:00:00.000Z'],
    ['Europe/Istanbul', '2026-09-09T04:00:00.000Z'],
    ['Asia/Kolkata', '2026-09-09T01:30:00.000Z'],
  ]) {
    for (const minutesAfterEnd of [29, 30, 31]) {
      const crossing = new Date(Date.parse(localSeven) + minutesAfterEnd * 60_000).toISOString();
      const clock = new Date(Date.parse(localSeven) - 2 * 60 * 60_000).toISOString();
      const result = plan(snapshot({
        timeZone,
        current: { observedAt: clock, ...measurements() },
        hourly: [hour(crossing, { condition: 'rain', apparentTemperatureCelsius: 12 })],
      }), { now: clock, quietHours: { ...defaultQuietHours, timeZone } });
      assert.equal(result.length, minutesAfterEnd < 30 ? 0 : 2, `${timeZone}, ${minutesAfterEnd}`);
      for (const alert of result) assert.equal(alert.fireAt, localSeven);
    }
  }
});

test('quiet windows include the start, exclude the end, and handle evening hours across midnight', () => {
  for (const [crossing, expected] of [
    ['2026-09-09T19:59:00.000Z', '2026-09-09T18:59:00.000Z'],
    ['2026-09-09T20:00:00.000Z', null],
    ['2026-09-09T05:00:00.000Z', '2026-09-09T04:00:00.000Z'],
  ]) {
    // 05:00 local, inside the day period, so all three crossings are in the same window
    // and the only thing under test is where the quiet hours put the fire time.
    const clock = '2026-09-09T02:00:00.000Z';
    const result = plan(snapshot({
      timeZone: 'Europe/Istanbul',
      current: { observedAt: clock, ...measurements() },
      hourly: [hour(crossing, { condition: 'rain' })],
    }), { now: clock, quietHours: { ...defaultQuietHours, timeZone: 'Europe/Istanbul' } });
    assert.equal(result[0]?.fireAt ?? null, expected);
  }
});

test('custom same-day windows honor minute fields and equal endpoints are empty', () => {
  const weather = snapshot({ hourly: [hour(crossingAt, { condition: 'rain' })] });
  const quietHours = { start: { hour: 9, minute: 0 }, end: { hour: 9, minute: 15 }, timeZone: 'UTC' };
  assert.equal(plan(weather, { quietHours })[0].fireAt, '2026-09-09T09:15:00.000Z');
  assert.equal(plan(weather, { quietHours: { ...quietHours, end: quietHours.start } })[0].fireAt,
    '2026-09-09T09:00:00.000Z');
});

test('quiet-hours adjustment lands on an exact minute when a crossing includes seconds', () => {
  const result = plan(snapshot({
    hourly: [hour('2026-09-09T07:30:45.123Z', { condition: 'rain' })],
  }), { now: '2026-09-09T05:00:00.000Z' });
  assert.equal(result[0].fireAt, '2026-09-09T07:00:00.000Z');
});

test('identity uses the dressing day of now and the location, independently of quiet-hours time zone', () => {
  // 01:00 local in Istanbul: the evening that began on the 8th, not a new day of its own.
  const clock = '2026-09-08T22:00:00.000Z';
  const result = plan(snapshot({
    timeZone: 'Europe/Istanbul',
    current: { observedAt: clock, ...measurements() },
    hourly: [hour('2026-09-08T23:30:00.000Z', { condition: 'rain' })],
  }), { now: clock, quietHours: { ...defaultQuietHours, timeZone: 'Pacific/Honolulu' } });
  assert.equal(result[0].id, `precipitation_onset:${locationKey}:2026-09-08:evening`);
});

test('delivered identities suppress only the matching rule, location and local date', () => {
  const weather = snapshot({ hourly: [hour(crossingAt, { condition: 'rain', apparentTemperatureCelsius: 12 })] });
  const deliveredAlertIds = new Set([`precipitation_onset:${locationKey}:2026-09-09`]);
  assert.deepEqual(plan(weather, { deliveredAlertIds }).map(({ ruleId }) => ruleId), ['temperature_swing']);
  deliveredAlertIds.add(`temperature_swing:${locationKey}:2026-09-09`);
  assert.deepEqual(plan(weather, { deliveredAlertIds }), []);
  assert.equal(plan({ ...weather, locationKey: 'manual:sample.london' }, { deliveredAlertIds }).length, 2);
  assert.equal(plan(weather, { deliveredAlertIds: new Set([
    `precipitation_onset:${locationKey}:2026-09-08`,
    `temperature_swing:${locationKey}:2026-09-08`,
  ]) }).length, 2);
});

test('plans are ordered by fire time, with deterministic ties, without mutating inputs', () => {
  const weather = snapshot({ hourly: [
    hour(crossingAt, { apparentTemperatureCelsius: 12 }),
    hour('2026-09-09T11:00:00.000Z', { condition: 'rain' }),
  ] });
  const before = structuredClone(weather);
  const result = plan(weather);
  assert.deepEqual(result.map(({ ruleId }) => ruleId), ['temperature_swing', 'precipitation_onset']);
  assert.ok(result[0].fireAt < result[1].fireAt);
  assert.deepEqual(plan(weather), result);
  assert.deepEqual(weather, before);
  assert.ok(Object.isFrozen(result));
  assert.ok(result.every((alert) => Object.isFrozen(alert) && Object.isFrozen(alert.detail)));

  const tied = plan(snapshot({ hourly: [hour(crossingAt, { condition: 'rain', apparentTemperatureCelsius: 12 })] }));
  assert.deepEqual(tied.map(({ ruleId }) => ruleId), ['precipitation_onset', 'temperature_swing']);
  assert.equal(tied[0].fireAt, tied[1].fireAt);
});

test('constants match the requirement engine behavioral boundaries', () => {
  assert.equal(weatherAlertLeadTimeMinutes, 60);
  assert.equal(weatherAlertMinimumLeadAfterQuietHoursMinutes, 30);
  assert.equal(precipitationLikelyThreshold, 0.6);
  assert.equal(temperatureSwingCelsius, 8);
  assert.deepEqual(defaultQuietHours, { start: { hour: 22, minute: 0 }, end: { hour: 7, minute: 0 } });
  for (const [offset, expected] of [[-0.001, false], [0, true], [0.001, true]]) {
    const precipitation = deriveClothingRequirements(snapshot({ hourly: [hour(crossingAt, {
      precipitationProbability: precipitationLikelyThreshold + offset,
    })] }), now);
    assert.equal(precipitation.reasonCodes.includes('precipitation_likely'), expected);
    const range = deriveClothingRequirements(snapshot({
      minimumTemperatureCelsius: 20,
      maximumTemperatureCelsius: 20 + temperatureSwingCelsius + offset,
    }), now);
    assert.equal(range.reasonCodes.includes('daily_range_wide'), expected);
  }
});

test('the dressing day is the one now falls in, not the snapshot observation day', () => {
  // 00:20, so the evening of the 9th is still under way: the 02:00 crossing belongs to it
  // and the 09:00 hour belongs to the dressing day that starts at 04:00.
  const clock = '2026-09-10T00:20:00.000Z';
  const result = plan(snapshot({
    current: { observedAt: '2026-09-09T23:50:00.000Z', ...measurements() },
    hourly: [
      hour('2026-09-09T23:00:00.000Z', { condition: 'rain' }),
      hour('2026-09-10T02:00:00.000Z', { condition: 'rain' }),
      hour('2026-09-10T09:00:00.000Z', { condition: 'rain' }),
    ],
  }), {
    now: clock,
    // Narrow quiet hours: the default 22:00 to 07:00 would drop an overnight alert, which
    // is a quiet-hours rule and not the window rule under test here.
    quietHours: { start: { hour: 3, minute: 0 }, end: { hour: 3, minute: 30 }, timeZone: 'UTC' },
  });

  assert.deepEqual(result.map(({ id, crossingAt: at }) => ({ id, at })), [{
    id: `precipitation_onset:${locationKey}:2026-09-09:evening`,
    at: '2026-09-10T02:00:00.000Z',
  }]);
});

test('an overnight crossing is plannable in the evening and fires once for that window', () => {
  // 19:00 local. A 02:00 temperature drop could not be planned at all while the window
  // stopped at midnight; now it can, under an id no calendar day can reach.
  const evening = '2026-09-09T19:00:00.000Z';
  const overnight = snapshot({
    current: { observedAt: evening, ...measurements({ apparentTemperatureCelsius: 20 }) },
    hourly: [hour('2026-09-10T02:00:00.000Z', { apparentTemperatureCelsius: 10 })],
  });
  const eveningId = `temperature_swing:${locationKey}:2026-09-09:evening`;
  const result = plan(overnight, {
    now: evening,
    quietHours: { start: { hour: 3, minute: 0 }, end: { hour: 3, minute: 30 }, timeZone: 'UTC' },
  });

  assert.deepEqual(result.map(({ id, crossingAt: at }) => ({ id, at })), [{
    id: eveningId,
    at: '2026-09-10T02:00:00.000Z',
  }]);
  // The next calendar day's id for the same rule and location is a different string, so the
  // evening plan cannot suppress it and it cannot suppress the evening plan.
  assert.notEqual(eveningId, `temperature_swing:${locationKey}:2026-09-10`);
  // Seen again an hour later, the ledger suppresses it.
  assert.deepEqual(plan(overnight, {
    now: '2026-09-09T20:00:00.000Z',
    deliveredAlertIds: new Set([eveningId]),
    quietHours: { start: { hour: 3, minute: 0 }, end: { hour: 3, minute: 30 }, timeZone: 'UTC' },
  }), []);
});

test('background lead is shortened only for crossings less than 60 minutes away', () => {
  for (const [crossing, expectedFireAt] of [
    ['2026-09-09T08:30:00.000Z', '2026-09-09T08:15:00.000Z'],
    ['2026-09-09T09:00:00.000Z', '2026-09-09T08:00:00.000Z'],
    ['2026-09-09T10:00:00.000Z', '2026-09-09T09:00:00.000Z'],
  ]) {
    const result = plan(snapshot({ hourly: [hour(crossing, { condition: 'rain' })] }), {
      leadTimeMinutes: weatherAlertBackgroundLeadTimeMinutes,
    });

    assert.deepEqual(result.map(({ fireAt }) => fireAt), [expectedFireAt], crossing);
  }
});

test('a crossing after 18:00 keeps one identity from the morning plan through the evening replan', () => {
  // Istanbul is UTC+3: 19:00 local rain, first planned at 10:00 and replanned at 18:10.
  const istanbul = snapshot({
    timeZone: 'Europe/Istanbul',
    hourly: [hour('2026-09-29T16:00:00.000Z', { precipitationProbability: 0.9 })],
  });
  const quietHours = { ...defaultQuietHours, timeZone: 'Europe/Istanbul' };
  const morning = planWeatherAlerts({
    snapshot: istanbul,
    now: '2026-09-29T07:00:00.000Z',
    quietHours,
    deliveredAlertIds: new Set(),
    leadTimeMinutes: 15,
  });
  assert.equal(morning.length, 1);
  const fired = new Set(morning.map(({ id }) => id));
  assert.deepEqual(planWeatherAlerts({
    snapshot: istanbul,
    now: '2026-09-29T15:10:00.000Z',
    quietHours,
    deliveredAlertIds: fired,
    leadTimeMinutes: 15,
  }), []);
});

test('device quiet hours are the default hours on the given zone', () => {
  assert.deepEqual(deviceQuietHours('Europe/Istanbul'), { ...defaultQuietHours, timeZone: 'Europe/Istanbul' });
});
