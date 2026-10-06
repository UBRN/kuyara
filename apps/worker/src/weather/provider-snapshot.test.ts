import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assembleProviderSnapshot,
  type ProviderDayInput,
  type ProviderDayValues,
  type ProviderHour,
  type ProviderHourInput,
  type ProviderSnapshotInput,
} from './provider-snapshot.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const observedAt = '2026-08-29T09:10:00.000Z';
const timeZone = 'UTC';

function hour(forecastAt: string, overrides: Partial<ProviderHour> = {}): ProviderHourInput {
  const value: ProviderHour = {
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'clear',
    precipitationProbability: 0.1,
    windSpeedMetersPerSecond: 1,
    humidity: 0.5,
    uvIndex: 1,
    forecastAt,
    ...overrides,
  };
  return { forecastAt, read: () => value };
}

function day(
  dateKey: string,
  minimum: number,
  maximum: number,
  overrides: Partial<ProviderDayValues> = {},
): ProviderDayInput {
  return {
    dateKey,
    read: () => ({
      minimumTemperatureCelsius: minimum,
      maximumTemperatureCelsius: maximum,
      condition: 'rain',
      precipitationProbability: 0.2,
      precipitationMillimetres: null,
      ...overrides,
    }),
  };
}

function assemble(overrides: Partial<ProviderSnapshotInput> = {}) {
  return assembleProviderSnapshot({
    sourceId: 'weatherkit',
    timeZone,
    fetchedAt: '2026-08-29T09:11:00.000Z',
    observedAt,
    hours: [hour('2026-08-29T09:00:00.000Z'), hour('2026-08-29T10:00:00.000Z')],
    days: [day('2026-08-29', 15, 25)],
    current: (nearest) => ({
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 22,
      condition: 'clear',
      precipitationProbability: nearest.precipitationProbability,
      windSpeedMetersPerSecond: 1,
      humidity: 0.5,
      uvIndex: nearest.uvIndex,
    }),
    ...overrides,
  });
}

function invalid(action: () => unknown) {
  assert.throws(
    action,
    (error) => error instanceof WeatherProviderError && error.kind === 'invalid_response',
  );
}

test('the nearest hour is picked from all hours, not only the windowed ones', () => {
  const snapshot = assemble({
    observedAt: '2026-08-29T09:50:00.000Z',
    hours: [
      hour('2026-08-29T07:00:00.000Z', { precipitationProbability: 0.9, uvIndex: 7 }),
      hour('2026-08-29T10:00:00.000Z', { precipitationProbability: 0.3, uvIndex: 3 }),
    ],
  });
  assert.equal(snapshot.current.precipitationProbability, 0.3);
  assert.equal(snapshot.current.uvIndex, 3);

  const outsideWindow = assemble({
    observedAt: '2026-08-29T09:10:00.000Z',
    hours: [
      hour('2026-08-29T07:00:00.000Z', { precipitationProbability: 0.9 }),
      hour('2026-08-29T10:00:00.000Z'),
    ],
  });
  assert.equal(outsideWindow.hourly.length, 1);
});

test('the hourly list is sorted, windowed and capped', () => {
  const start = Date.parse(observedAt);
  const hours: ProviderHourInput[] = [];
  for (let offset = 60; offset >= -3; offset -= 1) {
    hours.push(hour(new Date(start + offset * 3_600_000).toISOString()));
  }
  const { hourly } = assemble({ hours });
  assert.equal(hourly.length, 38);
  assert.equal(hourly[0].forecastAt, new Date(start - 3_600_000).toISOString());
  assert.equal(hourly[37].forecastAt, new Date(start + 36 * 3_600_000).toISOString());
});

test('an hour is read only when the snapshot uses it', () => {
  const unreadable = {
    forecastAt: '2026-08-27T00:00:00.000Z',
    read: () => { throw new WeatherProviderError('invalid_response'); },
  };
  assert.equal(assemble({ hours: [unreadable, hour('2026-08-29T10:00:00.000Z')] }).hourly.length, 1);
});

test('no hour or no hour in the window is an invalid response', () => {
  invalid(() => assemble({ hours: [] }));
  invalid(() => assemble({ hours: [hour('2026-08-27T00:00:00.000Z')] }));
});

test("today's low and high are widened around the current temperature", () => {
  const cases = [
    { current: 22, minimum: 15, maximum: 25, expected: [15, 25] },
    { current: 10, minimum: 15, maximum: 25, expected: [10, 25] },
    { current: 30, minimum: 15, maximum: 25, expected: [15, 30] },
  ];
  for (const { current, minimum, maximum, expected } of cases) {
    const snapshot = assemble({
      days: [day('2026-08-29', minimum, maximum), day('2026-08-30', 1, 2)],
      current: (nearest) => ({ ...nearest, temperatureCelsius: current }),
    });
    assert.deepEqual(
      [snapshot.minimumTemperatureCelsius, snapshot.maximumTemperatureCelsius],
      expected,
    );
    assert.deepEqual(
      [snapshot.daily[0].minimumTemperatureCelsius, snapshot.daily[0].maximumTemperatureCelsius],
      expected,
    );
    assert.deepEqual(
      [snapshot.daily[1].minimumTemperatureCelsius, snapshot.daily[1].maximumTemperatureCelsius],
      [1, 2],
    );
  }
});

test('the daily rows are sorted, start on the local day and stop at seven', () => {
  const days: ProviderDayInput[] = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const dateKey = new Date(Date.UTC(2026, 7, 25 + offset)).toISOString().slice(0, 10);
    days.push(day(dateKey, 10, 20));
  }
  const { daily } = assemble({ days });
  assert.equal(daily.length, 7);
  assert.equal(daily[0].dateKey, '2026-08-29');
  assert.equal(daily[6].dateKey, '2026-09-04');
});

test('a day is read only when it reaches the snapshot', () => {
  const unreadable = (dateKey: string): ProviderDayInput => ({
    dateKey,
    read: () => { throw new WeatherProviderError('invalid_response'); },
  });
  const days = [
    unreadable('2026-08-20'),
    day('2026-08-29', 15, 25),
    ...['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
      .map((dateKey) => day(dateKey, 1, 2)),
    unreadable('2026-12-01'),
  ];
  assert.equal(assemble({ days }).daily.length, 7);
  invalid(() => assemble({ days: [unreadable('2026-08-29')] }));
});

test('no day for the local day is an invalid response', () => {
  invalid(() => assemble({ days: [day('2026-08-30', 15, 25)] }));
  invalid(() => assemble({ days: [] }));
});

test('the source, zone and fetch time pass through as live', () => {
  const snapshot = assemble();
  assert.equal(snapshot.sourceId, 'weatherkit');
  assert.equal(snapshot.timeZone, timeZone);
  assert.equal(snapshot.fetchedAt, '2026-08-29T09:11:00.000Z');
  assert.equal(snapshot.provenance, 'live');
  assert.equal(snapshot.current.observedAt, observedAt);
});
