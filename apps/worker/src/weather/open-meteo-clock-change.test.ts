import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isValidWeatherHourlyForecastWindow,
  weatherLocalDateKey,
} from '@kuyara/contracts';

import { mapOpenMeteoResponse, openMeteoResponseSchema } from './open-meteo-raw.ts';
import type { ProviderWeatherSnapshot } from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const hourMilliseconds = 60 * 60 * 1000;

// Open-Meteo answers a `timezone=<IANA>` request with ONE `utc_offset_seconds` for the whole
// response (the offset in force when it is served) and a continuous hourly grid written in
// that fixed offset, even where the zone's own offset changes inside the window. Every
// fixture below follows that shape: consecutive wall-clock strings, one offset.
function wallClock(instantMilliseconds: number, offsetSeconds: number) {
  return new Date(instantMilliseconds + offsetSeconds * 1000).toISOString().slice(0, 16);
}

function responseFixture({ gridStartUtc, hours, offsetSeconds, currentUtc, firstDay, days }: {
  gridStartUtc: string;
  hours: number;
  offsetSeconds: number;
  currentUtc: string;
  firstDay: string;
  days: number;
}) {
  const start = Date.parse(gridStartUtc);
  const times = Array.from({ length: hours }, (_, index) => (
    wallClock(start + index * hourMilliseconds, offsetSeconds)
  ));
  const dayKeys = Array.from({ length: days }, (_, index) => (
    new Date(Date.parse(`${firstDay}T00:00:00Z`) + index * 24 * hourMilliseconds)
      .toISOString().slice(0, 10)
  ));
  return {
    utc_offset_seconds: offsetSeconds,
    current: {
      time: wallClock(Date.parse(currentUtc), offsetSeconds),
      temperature_2m: 10,
      apparent_temperature: 9,
      relative_humidity_2m: 70,
      weather_code: 3,
      wind_speed_10m: 3,
    },
    hourly: {
      time: times,
      // The index is the temperature, so a shifted or skipped hour shows up as a wrong value.
      temperature_2m: times.map((_, index) => index),
      apparent_temperature: times.map(() => 9),
      relative_humidity_2m: times.map(() => 70),
      weather_code: times.map(() => 3),
      wind_speed_10m: times.map(() => 3),
      precipitation_probability: times.map(() => 10),
      uv_index: times.map(() => 0),
    },
    daily: {
      time: dayKeys,
      temperature_2m_min: dayKeys.map((_, index) => index),
      temperature_2m_max: dayKeys.map((_, index) => 20 + index),
      weather_code: dayKeys.map(() => 3),
      precipitation_probability_max: dayKeys.map(() => 10),
      precipitation_sum: dayKeys.map(() => 0),
    },
  };
}

function mapFixture(fixture: ReturnType<typeof responseFixture>, timeZone: string, fetchedAt: string) {
  return mapOpenMeteoResponse(
    openMeteoResponseSchema.parse(fixture),
    { latitudeE2: 5252, longitudeE2: 1341, timeZone },
    fetchedAt,
  );
}

function assertContinuousHours(snapshot: ProviderWeatherSnapshot, firstInstant: string) {
  const instants = snapshot.hourly.map(({ forecastAt }) => Date.parse(forecastAt));
  assert.equal(snapshot.hourly[0].forecastAt, firstInstant);
  instants.forEach((instant, index) => {
    if (index > 0) assert.equal(instant - instants[index - 1], hourMilliseconds);
  });
  assert.equal(new Set(instants).size, instants.length);
  assert.equal(isValidWeatherHourlyForecastWindow(
    snapshot.hourly,
    snapshot.current.observedAt,
  ), true);
}

// 25 October 2026 01:00 UTC: Europe/Berlin leaves summer time (03:00 CEST becomes 02:00 CET).
test('keeps every Berlin hour and day row right across the autumn clock change', () => {
  const fixture = responseFixture({
    gridStartUtc: '2026-10-24T22:00:00Z',
    hours: 48,
    offsetSeconds: 7200,
    currentUtc: '2026-10-24T22:30:00Z',
    firstDay: '2026-10-25',
    days: 7,
  });

  const snapshot = mapFixture(fixture, 'Europe/Berlin', '2026-10-24T22:31:00.000Z');

  assert.equal(snapshot.current.observedAt, '2026-10-24T22:30:00.000Z');
  assert.equal(snapshot.hourly.length, 37);
  assertContinuousHours(snapshot, '2026-10-24T22:00:00.000Z');
  // The window runs through 01:00 UTC, the change itself, without a gap or a repeat there.
  const hoursAroundChange = snapshot.hourly
    .filter(({ forecastAt }) => forecastAt >= '2026-10-25T00:00:00.000Z'
      && forecastAt <= '2026-10-25T02:00:00.000Z')
    .map(({ forecastAt }) => forecastAt);
  assert.deepEqual(hoursAroundChange, [
    '2026-10-25T00:00:00.000Z',
    '2026-10-25T01:00:00.000Z',
    '2026-10-25T02:00:00.000Z',
  ]);
  // Values stay attached to their own hour: the fixture temperature is its grid index.
  assert.deepEqual(snapshot.hourly.slice(0, 4).map((hour) => hour.temperatureCelsius), [0, 1, 2, 3]);
  // 22:30 UTC on the 24th is 00:30 on the 25th in Berlin, so today is the 25th.
  assert.equal(weatherLocalDateKey(snapshot.current.observedAt, 'Europe/Berlin'), '2026-10-25');
  assert.deepEqual(snapshot.daily.map(({ dateKey }) => dateKey), [
    '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
    '2026-10-29', '2026-10-30', '2026-10-31',
  ]);
  assert.equal(snapshot.daily[1].minimumTemperatureCelsius, 1);
  assert.equal(snapshot.daily[1].maximumTemperatureCelsius, 21);
});

test('reads a Berlin response served after the autumn change at the winter offset', () => {
  const fixture = responseFixture({
    gridStartUtc: '2026-10-25T00:00:00Z',
    hours: 48,
    offsetSeconds: 3600,
    currentUtc: '2026-10-25T01:30:00Z',
    firstDay: '2026-10-25',
    days: 7,
  });

  const snapshot = mapFixture(fixture, 'Europe/Berlin', '2026-10-25T01:31:00.000Z');

  assert.equal(snapshot.current.observedAt, '2026-10-25T01:30:00.000Z');
  assertContinuousHours(snapshot, '2026-10-25T01:00:00.000Z');
  assert.equal(snapshot.hourly[0].temperatureCelsius, 1);
  assert.equal(weatherLocalDateKey(snapshot.current.observedAt, 'Europe/Berlin'), '2026-10-25');
  assert.equal(snapshot.daily[0].dateKey, '2026-10-25');
});

// 29 March 2026 01:00 UTC: Europe/London enters summer time (01:00 GMT becomes 02:00 BST).
test('keeps every London hour once and in order across the spring clock change', () => {
  const fixture = responseFixture({
    gridStartUtc: '2026-03-28T23:00:00Z',
    hours: 48,
    offsetSeconds: 0,
    currentUtc: '2026-03-28T23:30:00Z',
    firstDay: '2026-03-28',
    days: 7,
  });

  const snapshot = mapFixture(fixture, 'Europe/London', '2026-03-28T23:31:00.000Z');

  assert.equal(snapshot.hourly.length, 37);
  assertContinuousHours(snapshot, '2026-03-28T23:00:00.000Z');
  const hoursAroundChange = snapshot.hourly
    .filter(({ forecastAt }) => forecastAt >= '2026-03-29T00:00:00.000Z'
      && forecastAt <= '2026-03-29T02:00:00.000Z')
    .map(({ forecastAt }) => forecastAt);
  assert.deepEqual(hoursAroundChange, [
    '2026-03-29T00:00:00.000Z',
    '2026-03-29T01:00:00.000Z',
    '2026-03-29T02:00:00.000Z',
  ]);
  assert.equal(weatherLocalDateKey(snapshot.current.observedAt, 'Europe/London'), '2026-03-28');
  assert.deepEqual(snapshot.daily.slice(0, 3).map(({ dateKey }) => dateKey), [
    '2026-03-28', '2026-03-29', '2026-03-30',
  ]);
});

test('reads a London response served after the spring change at the summer offset', () => {
  const fixture = responseFixture({
    gridStartUtc: '2026-03-28T23:00:00Z',
    hours: 48,
    offsetSeconds: 3600,
    currentUtc: '2026-03-29T01:30:00Z',
    firstDay: '2026-03-29',
    days: 7,
  });

  const snapshot = mapFixture(fixture, 'Europe/London', '2026-03-29T01:31:00.000Z');

  assert.equal(snapshot.current.observedAt, '2026-03-29T01:30:00.000Z');
  assertContinuousHours(snapshot, '2026-03-29T01:00:00.000Z');
  assert.equal(weatherLocalDateKey(snapshot.current.observedAt, 'Europe/London'), '2026-03-29');
  assert.equal(snapshot.daily[0].dateKey, '2026-03-29');
});

// Open-Meteo never repeats a wall-clock hour, but a response that did (the autumn hour
// written twice) would give two hours the same instant. That is rejected as an invalid
// provider response, so the chain moves on, never an unordered window.
test('rejects a response that repeats the autumn wall-clock hour', () => {
  const fixture = responseFixture({
    gridStartUtc: '2026-10-24T22:00:00Z',
    hours: 6,
    offsetSeconds: 7200,
    currentUtc: '2026-10-24T22:30:00Z',
    firstDay: '2026-10-25',
    days: 7,
  });
  fixture.hourly.time = [
    '2026-10-25T00:00', '2026-10-25T01:00', '2026-10-25T02:00',
    '2026-10-25T02:00', '2026-10-25T03:00', '2026-10-25T04:00',
  ];

  assert.throws(
    () => mapFixture(fixture, 'Europe/Berlin', '2026-10-24T22:31:00.000Z'),
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
});
