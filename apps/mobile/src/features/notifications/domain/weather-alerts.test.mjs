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

test('a first crossing with insufficient lead never falls through to a later crossing', () => {
  assert.deepEqual(plan(snapshot({ hourly: [
    hour('2026-09-09T08:59:00.000Z', { condition: 'rain', apparentTemperatureCelsius: 12 }),
    hour(crossingAt, { condition: 'snow', apparentTemperatureCelsius: 28 }),
  ] })), []);
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

test('a shortened lead schedules a crossing the foreground lead drops', () => {
  const weather = snapshot({
    hourly: [hour('2026-09-09T08:30:00.000Z', { condition: 'rain' })],
  });

  assert.deepEqual(plan(weather), []);
  assert.deepEqual(
    plan(weather, { leadTimeMinutes: weatherAlertBackgroundLeadTimeMinutes })
      .map(({ fireAt }) => fireAt),
    ['2026-09-09T08:15:00.000Z'],
  );
});
