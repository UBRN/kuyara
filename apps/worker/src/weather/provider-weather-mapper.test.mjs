import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { weatherSourceIds } from '@kuyara/contracts';

import {
  InvalidProviderWeatherError,
  mapProviderWeatherToApi,
} from './provider-weather-mapper.ts';

// The response schema reads a provider id it does not know as the literal 'unknown', for the
// installed binaries' sake. The Worker itself must never produce that value: every adapter
// stamps one member of `weatherSourceIds`, and the API mapper passes it through unchanged.

const fetchedAt = '2026-09-13T09:30:00.000Z';
const measurements = {
  temperatureCelsius: 16.4,
  apparentTemperatureCelsius: 15.1,
  condition: 'rain',
  precipitationProbability: 0.55,
  windSpeedMetersPerSecond: 4.2,
  humidity: 0.72,
  uvIndex: 3,
};

function snapshot(sourceId) {
  return {
    timeZone: 'Europe/Istanbul',
    fetchedAt,
    provenance: sourceId === 'sample' ? 'sample' : 'live',
    sourceId,
    current: { ...measurements, observedAt: fetchedAt },
    minimumTemperatureCelsius: 12,
    maximumTemperatureCelsius: 19,
    hourly: [{ ...measurements, forecastAt: '2026-09-13T10:00:00.000Z' }],
  };
}

test('every provider id the Worker knows survives the API mapper unchanged and is never unknown', () => {
  for (const sourceId of weatherSourceIds) {
    const { data } = mapProviderWeatherToApi(snapshot(sourceId));
    assert.equal(data.origin.sourceId, sourceId);
    assert.notEqual(data.origin.sourceId, 'unknown');
  }
});

test('the API mapper rejects an unlisted id instead of emitting unknown', () => {
  // The shared schema is the tolerant reader and would read 'met-norway' as 'unknown'; the
  // Worker's own gate stays closed so a real response never carries the unknown branch.
  assert.throws(() => mapProviderWeatherToApi(snapshot('met-norway')), InvalidProviderWeatherError);
  assert.throws(() => mapProviderWeatherToApi(snapshot('')), InvalidProviderWeatherError);
  assert.throws(() => mapProviderWeatherToApi(snapshot(42)), InvalidProviderWeatherError);
});

test('each adapter stamps a literal sourceId from the closed list', () => {
  const adapters = [
    'weatherkit-raw.ts',
    'open-meteo-raw.ts',
    'openweather-raw.ts',
    'mock-weather-provider.ts',
  ];
  for (const file of adapters) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const literals = [...source.matchAll(/sourceId: '([^']*)'/g)].map(([, id]) => id);
    assert.ok(literals.length > 0, `${file} stamps no sourceId literal`);
    for (const id of literals) {
      assert.ok(weatherSourceIds.includes(id), `${file} stamps ${id}, outside weatherSourceIds`);
    }
  }
});
