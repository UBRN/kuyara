import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { weatherSourceIds } from '@kuyara/contracts';

import { weatherRefreshedAttributes } from '../analytics/domain/performance-telemetry-events.ts';
import { getManualLocation } from './data/manual-location-catalog.ts';
import { WorkerWeatherProvider } from './data/worker-weather-provider.ts';

// `weather.refreshed` carries the attribution source as a closed enum (ADR 0033 section 7).
// The closed set is the contract's provider list plus the named 'unknown' the response
// schema reads a newer provider as; nothing else may reach the telemetry provider.
const closedSourceSet = new Set([...weatherSourceIds, 'unknown']);

const location = getManualLocation('sample.istanbul');
const fetchedAt = '2026-09-13T09:30:00.000Z';
const measurements = {
  temperatureCelsius: 16,
  apparentTemperatureCelsius: 15,
  condition: 'rain',
  precipitationProbability: 0.55,
  windSpeedMetersPerSecond: 4.2,
  humidity: 0.72,
  uvIndex: 3,
};

function providerAnswering(sourceId) {
  return new WorkerWeatherProvider({
    baseUrl: 'http://worker.test',
    fetch: async () => Response.json({
      data: {
        timeZone: location.timeZone,
        fetchedAt,
        origin: { kind: sourceId === 'sample' ? 'sample' : 'live', sourceId },
        current: { observedAt: fetchedAt, ...measurements },
        minimumTemperatureCelsius: 12,
        maximumTemperatureCelsius: 19,
        hourly: [{ forecastAt: fetchedAt, ...measurements }],
        // The /v2 response the provider reads; the outlook plays no part in attribution
        // but a response without it is not a response this provider accepts.
        daily: [{
          dateKey: '2026-09-13',
          condition: 'rain',
          minimumTemperatureCelsius: 12,
          maximumTemperatureCelsius: 19,
          precipitationProbability: 0.55,
          precipitationMillimetres: null,
        }],
      },
    }),
  });
}

test('the source attribute is the closed provider list, with a newer provider mapped to unknown', async () => {
  for (const sourceId of [...weatherSourceIds, 'met-norway']) {
    const snapshot = await providerAnswering(sourceId).fetchSnapshot(location);
    const attributes = weatherRefreshedAttributes({
      durationMs: 100,
      outcome: 'success',
      source: snapshot.origin.sourceId,
    });
    assert.ok(closedSourceSet.has(attributes.source), `${sourceId} reached telemetry as ${attributes.source}`);
    assert.equal(attributes.source, weatherSourceIds.includes(sourceId) ? sourceId : 'unknown');
  }
});

test('the controller reports the source the contract read, not a value of its own', () => {
  const controller = readFileSync(
    new URL('./application/weather-application-controller.ts', import.meta.url),
    'utf8',
  );
  assert.match(controller, /source: snapshot\.origin\.sourceId,/);
});
