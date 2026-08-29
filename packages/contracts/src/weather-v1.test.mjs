import assert from 'node:assert/strict';
import test from 'node:test';

import {
  weatherConditionCodes,
  weatherV1ErrorCodes,
  weatherV1ErrorSchema,
  weatherV1Path,
  weatherV1RequestSchema,
  weatherV1SuccessSchema,
} from './weather-v1.ts';

function validSuccess() {
  const measurements = {
    temperatureCelsius: 16,
    apparentTemperatureCelsius: 15,
    condition: 'rain',
    precipitationProbability: 0.55,
    windSpeedMetersPerSecond: 4.2,
    humidity: 0.72,
    uvIndex: 3,
  };
  return {
    data: {
      timeZone: 'Europe/Istanbul',
      fetchedAt: '2026-08-01T09:30:00.000Z',
      origin: { kind: 'sample', sourceId: 'sample' },
      current: { ...measurements, observedAt: '2026-08-01T09:30:00.000Z' },
      minimumTemperatureCelsius: 12,
      maximumTemperatureCelsius: 19,
      hourly: [
        { ...measurements, forecastAt: '2026-08-01T10:00:00.000Z' },
        { ...measurements, forecastAt: '2026-08-01T11:00:00.000Z' },
      ],
    },
  };
}

test('exports the confirmed weather v1 path and condition vocabulary', () => {
  assert.equal(weatherV1Path, '/v1/weather');
  assert.deepEqual(weatherConditionCodes, [
    'clear', 'mostly_clear', 'partly_cloudy', 'cloudy', 'fog', 'drizzle',
    'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm',
  ]);
});

test('accepts bounded normalized coordinates and an IANA time zone', () => {
  assert.equal(weatherV1RequestSchema.safeParse({
    latitudeE2: -9000,
    longitudeE2: 18000,
    timeZone: 'Europe/Istanbul',
  }).success, true);
});

test('rejects fractional, out-of-range, unknown, and invalid-time-zone request data', () => {
  const invalidRequests = [
    { latitudeE2: 4100.5, longitudeE2: 2900, timeZone: 'Europe/Istanbul' },
    { latitudeE2: 9001, longitudeE2: 2900, timeZone: 'Europe/Istanbul' },
    { latitudeE2: 4100, longitudeE2: -18001, timeZone: 'Europe/Istanbul' },
    { latitudeE2: 4100, longitudeE2: 2900, timeZone: 'Not/AZone' },
    { latitudeE2: 4100, longitudeE2: 2900, timeZone: 'Europe/Istanbul', profileId: 'private' },
  ];
  for (const request of invalidRequests) {
    assert.equal(weatherV1RequestSchema.safeParse(request).success, false);
  }
});

test('accepts a provider-neutral success payload with sample provenance', () => {
  assert.equal(weatherV1SuccessSchema.safeParse(validSuccess()).success, true);
});

test('accepts a live payload sourced from open-meteo', () => {
  const value = validSuccess();
  value.data.origin = { kind: 'live', sourceId: 'open-meteo' };
  assert.equal(weatherV1SuccessSchema.safeParse(value).success, true);
});

test('rejects a sample kind sourced from a live provider', () => {
  const value = validSuccess();
  value.data.origin = { kind: 'sample', sourceId: 'open-meteo' };
  assert.equal(weatherV1SuccessSchema.safeParse(value).success, false);
});

test('rejects a live kind sourced from the sample provider', () => {
  const value = validSuccess();
  value.data.origin = { kind: 'live', sourceId: 'sample' };
  assert.equal(weatherV1SuccessSchema.safeParse(value).success, false);
});

test('rejects an unknown source id', () => {
  const value = validSuccess();
  value.data.origin = { kind: 'live', sourceId: 'weatherapi' };
  assert.equal(weatherV1SuccessSchema.safeParse(value).success, false);
});

test('rejects invalid measurement and timestamp values', () => {
  const invalidHumidity = validSuccess();
  invalidHumidity.data.current.humidity = 1.1;
  assert.equal(weatherV1SuccessSchema.safeParse(invalidHumidity).success, false);

  const invalidTimestamp = validSuccess();
  invalidTimestamp.data.fetchedAt = '2026-08-01';
  assert.equal(weatherV1SuccessSchema.safeParse(invalidTimestamp).success, false);

  const invalidCurrentTimestamp = validSuccess();
  invalidCurrentTimestamp.data.current.observedAt = 'invalid';
  assert.doesNotThrow(() => weatherV1SuccessSchema.safeParse(invalidCurrentTimestamp));
  assert.equal(weatherV1SuccessSchema.safeParse(invalidCurrentTimestamp).success, false);

  const invalidTimeZone = validSuccess();
  invalidTimeZone.data.timeZone = 'Not/AZone';
  assert.doesNotThrow(() => weatherV1SuccessSchema.safeParse(invalidTimeZone));
  assert.equal(weatherV1SuccessSchema.safeParse(invalidTimeZone).success, false);
});

test('rejects inconsistent temperature ranges', () => {
  const value = validSuccess();
  value.data.maximumTemperatureCelsius = 15;
  assert.equal(weatherV1SuccessSchema.safeParse(value).success, false);
});

test('rejects empty, unordered, cross-day, and oversized hourly forecasts', () => {
  const empty = validSuccess();
  empty.data.hourly = [];
  assert.equal(weatherV1SuccessSchema.safeParse(empty).success, false);

  const unordered = validSuccess();
  unordered.data.hourly.reverse();
  assert.equal(weatherV1SuccessSchema.safeParse(unordered).success, false);

  const crossDay = validSuccess();
  crossDay.data.hourly[1].forecastAt = '2026-08-02T21:00:00.000Z';
  assert.equal(weatherV1SuccessSchema.safeParse(crossDay).success, false);

  const oversized = validSuccess();
  oversized.data.hourly = Array.from({ length: 26 }, (_, index) => ({
    ...oversized.data.hourly[0],
    forecastAt: new Date(Date.parse('2026-08-01T00:00:00.000Z') + index * 60 * 60 * 1000).toISOString(),
  }));
  assert.equal(weatherV1SuccessSchema.safeParse(oversized).success, false);
});

test('accepts every stable minimal error code and rejects extra detail', () => {
  for (const code of weatherV1ErrorCodes) {
    assert.equal(weatherV1ErrorSchema.safeParse({ error: { code } }).success, true);
  }
  assert.equal(weatherV1ErrorSchema.safeParse({
    error: { code: 'internal_error', stack: 'private' },
  }).success, false);
});

test('includes rate_limited among the stable error codes', () => {
  assert.ok(weatherV1ErrorCodes.includes('rate_limited'));
  assert.equal(weatherV1ErrorSchema.safeParse({
    error: { code: 'rate_limited' },
  }).success, true);
});
