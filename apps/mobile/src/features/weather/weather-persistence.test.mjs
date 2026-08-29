import assert from 'node:assert/strict';
import test from 'node:test';

import { getManualLocation } from './data/manual-location-catalog.ts';
import { LocalWeatherRepository, WeatherRepositoryError } from './data/weather-repository.ts';
import { SqliteWeatherLocalDataSource } from './data/sqlite-weather-local-data-source.ts';
import {
  normalizeCoordinates,
  weatherClockSkewToleranceMilliseconds,
  weatherFreshness,
  weatherFreshnessWindowMilliseconds,
} from './domain/weather.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const profileId = 'profile-weather-test';
const firstId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const secondId = '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const thirdId = '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4';

async function setup() {
  const database = new NodeSqliteDatabase();
  await migrateDatabase(database);
  await database.runAsync(
    `INSERT INTO local_profiles (
      singleton_key, id, clothing_preference, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at, deleted_at
    ) VALUES (1, ?, 'womens', 'en', 'light', 1, ?, ?, NULL)`,
    [profileId, '2026-07-30T09:00:00.000Z', '2026-07-30T09:00:00.000Z'],
  );
  const dataSource = new SqliteWeatherLocalDataSource(database);
  const ids = [firstId, secondId, thirdId];
  const repository = new LocalWeatherRepository(dataSource, {
    createId: () => ids.shift() ?? firstId,
    now: () => '2026-07-30T10:00:00.000Z',
  });
  return { database, dataSource, repository };
}

function provided(location, fetchedAt, temperature = 16) {
  return {
    locationKey: location.locationKey,
    timeZone: location.timeZone,
    fetchedAt,
    origin: { kind: 'sample', sourceId: 'test-fixture' },
    current: {
      observedAt: fetchedAt,
      temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature - 1,
      condition: 'rain',
      precipitationProbability: 0.5,
      windSpeedMetersPerSecond: 4,
      humidity: 0.7,
      uvIndex: 2,
    },
    minimumTemperatureCelsius: temperature - 4,
    maximumTemperatureCelsius: temperature + 3,
    hourly: [{
      forecastAt: fetchedAt,
      temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature - 1,
      condition: 'rain',
      precipitationProbability: 0.5,
      windSpeedMetersPerSecond: 4,
      humidity: 0.7,
      uvIndex: 2,
    }],
  };
}

test('coordinates normalize before persistence, freshness has an exact 30-minute boundary, and clock skew is tolerated', () => {
  assert.deepEqual(normalizeCoordinates(41.0082, 28.9784), {
    latitudeE2: 4101,
    longitudeE2: 2898,
  });
  assert.equal(Object.is(normalizeCoordinates(-0.001, -0.001).latitudeE2, -0), false);
  const fetched = '2026-07-30T10:00:00.000Z';
  assert.equal(weatherFreshness(fetched, new Date(Date.parse(fetched) + weatherFreshnessWindowMilliseconds).toISOString()), 'fresh');
  assert.equal(weatherFreshness(fetched, new Date(Date.parse(fetched) + weatherFreshnessWindowMilliseconds + 1).toISOString()), 'stale');
  assert.equal(
    weatherFreshness(new Date(Date.parse(fetched) + weatherClockSkewToleranceMilliseconds).toISOString(), fetched),
    'fresh',
  );
  assert.equal(
    weatherFreshness(new Date(Date.parse(fetched) + weatherClockSkewToleranceMilliseconds + 1).toISOString(), fetched),
    'invalid',
  );
});

test('migration v4 enforces one active location and maps manual and device variants', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const version = await database.getFirstAsync('PRAGMA user_version');
  assert.equal(version.user_version, 5);

  const istanbul = getManualLocation('sample.istanbul');
  const manual = await repository.setActiveLocation(profileId, istanbul);
  assert.deepEqual(manual, istanbul);

  const device = await repository.setActiveLocation(profileId, {
    source: 'device', accuracy: 'approximate', locationKey: 'device:4101:2898',
    coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
  });
  assert.equal(device.source, 'device');
  assert.equal(device.accuracy, 'approximate');
  const rows = await database.getAllAsync('SELECT local_profile_id, source FROM active_locations');
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ local_profile_id: profileId, source: 'device' }]);
  await assert.rejects(() => database.runAsync(
    `INSERT INTO active_locations VALUES (?, 'bad', 'device', 'sample.istanbul', 0, 0, 'UTC', NULL, ?, ?)`,
    [profileId, '2026-07-30T10:00:00.000Z', '2026-07-30T10:00:00.000Z'],
  ));
});

test('snapshot and hourly data round-trip, remain location-bound, and retain active plus one previous', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const istanbul = getManualLocation('sample.istanbul');
  const ankara = getManualLocation('sample.ankara');
  const london = getManualLocation('sample.london');
  await repository.setActiveLocation(profileId, istanbul);
  const saved = await repository.saveSnapshot(profileId, provided(istanbul, '2026-07-30T10:00:00.000Z', 16));
  assert.deepEqual(Object.keys(saved.current).sort(), [
    'apparentTemperatureCelsius',
    'condition',
    'humidity',
    'observedAt',
    'precipitationProbability',
    'temperatureCelsius',
    'uvIndex',
    'windSpeedMetersPerSecond',
  ]);
  await repository.saveSnapshot(profileId, provided(ankara, '2026-07-30T11:00:00.000Z', 11));
  await repository.saveSnapshot(profileId, provided(london, '2026-07-30T12:00:00.000Z', 20));

  assert.equal((await repository.getSnapshot(profileId, istanbul.locationKey)).current.temperatureCelsius, 16);
  assert.equal(await repository.getSnapshot(profileId, ankara.locationKey), null);
  assert.equal((await repository.getSnapshot(profileId, london.locationKey)).timeZone, 'Europe/London');
  const snapshots = await database.getAllAsync('SELECT location_key FROM weather_snapshots ORDER BY location_key');
  assert.deepEqual(snapshots.map(({ location_key }) => location_key), [
    'manual:sample.istanbul', 'manual:sample.london',
  ]);
});

test('failed hourly replacement rolls back and corrupt stored data fails predictably', async (t) => {
  const { database, dataSource, repository } = await setup();
  t.after(() => database.close());
  const istanbul = getManualLocation('sample.istanbul');
  await repository.setActiveLocation(profileId, istanbul);
  await repository.saveSnapshot(profileId, provided(istanbul, '2026-07-30T10:00:00.000Z'));
  const record = await dataSource.getSnapshot(profileId, istanbul.locationKey);
  await assert.rejects(() => dataSource.replaceSnapshot({
    ...record,
    id: secondId,
    fetchedAt: '2026-07-30T11:00:00.000Z',
    hourly: [record.hourly[0], record.hourly[0]],
  }));
  assert.equal((await repository.getSnapshot(profileId, istanbul.locationKey)).fetchedAt, '2026-07-30T10:00:00.000Z');

  await database.runAsync(`UPDATE weather_snapshots SET source_id = '' WHERE location_key = ?`, [istanbul.locationKey]);
  await assert.rejects(
    () => repository.getSnapshot(profileId, istanbul.locationKey),
    (error) => error instanceof WeatherRepositoryError && error.code === 'invalid-data',
  );
});

test('repository rejects mismatched location keys and hourly rows outside the local day', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const istanbul = getManualLocation('sample.istanbul');

  await assert.rejects(
    () => repository.setActiveLocation(profileId, {
      ...istanbul,
      locationKey: 'manual:sample.ankara',
    }),
    (error) => error instanceof WeatherRepositoryError && error.code === 'invalid-input',
  );

  const invalidSnapshot = provided(istanbul, '2026-07-30T20:00:00.000Z');
  invalidSnapshot.hourly = [{
    ...invalidSnapshot.hourly[0],
    forecastAt: '2026-07-31T20:00:00.000Z',
  }];
  await assert.rejects(
    () => repository.saveSnapshot(profileId, invalidSnapshot),
    (error) => error instanceof WeatherRepositoryError && error.code === 'invalid-input',
  );
});
