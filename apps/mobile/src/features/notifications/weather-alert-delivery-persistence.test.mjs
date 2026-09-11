import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalWeatherAlertDeliveryRepository } from './data/weather-alert-delivery-repository.ts';
import { SqliteWeatherAlertDeliveryLocalDataSource } from './data/sqlite-weather-alert-delivery-local-data-source.ts';
import { WeatherAlertScheduler } from './application/weather-alert-scheduler.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const profileId = 'profile-weather-alert-test';
const createdAt = '2026-09-09T08:00:00.000Z';

async function setup() {
  const database = new NodeSqliteDatabase();
  await migrateDatabase(database);
  await database.runAsync(
    `INSERT INTO local_profiles (
      singleton_key, id, gender, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at, deleted_at
    ) VALUES (1, ?, 'woman', 'en', 'light', 1, ?, ?, NULL)`,
    [profileId, createdAt, createdAt],
  );
  return {
    database,
    repository: new LocalWeatherAlertDeliveryRepository(
      new SqliteWeatherAlertDeliveryLocalDataSource(database),
    ),
  };
}

test('scheduled alert deliveries upsert, retain fired rows, delete pending rows, and prune by profile', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  await repository.upsertScheduled([
    {
      id: 'precipitation_onset:location:2026-09-09',
      localProfileId: profileId,
      fireAt: '2026-09-09T09:00:00.000Z',
      createdAt,
    },
    {
      id: 'temperature_swing:location:2026-09-09',
      localProfileId: profileId,
      fireAt: '2026-09-09T11:00:00.000Z',
      createdAt,
    },
  ]);
  await repository.upsertScheduled([{
    id: 'temperature_swing:location:2026-09-09',
    localProfileId: profileId,
    fireAt: '2026-09-09T12:00:00.000Z',
    createdAt: '2026-09-09T08:30:00.000Z',
  }]);

  assert.deepEqual(
    [...await repository.listFiredIds(profileId, '2026-09-09T09:00:00.000Z')],
    ['precipitation_onset:location:2026-09-09'],
  );
  assert.deepEqual(
    (await database.getAllAsync(
      'SELECT id, fire_at, created_at FROM weather_alert_deliveries ORDER BY id',
    )).map((row) => ({ ...row })),
    [
      {
        id: 'precipitation_onset:location:2026-09-09',
        fire_at: '2026-09-09T09:00:00.000Z',
        created_at: createdAt,
      },
      {
        id: 'temperature_swing:location:2026-09-09',
        fire_at: '2026-09-09T12:00:00.000Z',
        created_at: createdAt,
      },
    ],
  );

  await repository.deletePending(profileId, '2026-09-09T09:00:00.000Z');
  assert.deepEqual(
    (await database.getAllAsync('SELECT id FROM weather_alert_deliveries ORDER BY id'))
      .map((row) => ({ ...row })),
    [{ id: 'precipitation_onset:location:2026-09-09' }],
  );

  await repository.pruneBefore(profileId, '2026-09-09T10:00:00.000Z');
  assert.deepEqual(
    (await database.getAllAsync('SELECT id FROM weather_alert_deliveries'))
      .map((row) => ({ ...row })),
    [],
  );
});

function precipitationSnapshot(id, crossingAt, precipitationProbability, fetchedAt) {
  return {
    id,
    localProfileId: profileId,
    locationKey: 'manual:sample.istanbul',
    timeZone: 'Europe/Istanbul',
    fetchedAt,
    origin: { kind: 'sample', sourceId: 'test' },
    current: {
      observedAt: fetchedAt,
      temperatureCelsius: 16,
      apparentTemperatureCelsius: 16,
      condition: 'clear',
      precipitationProbability: 0,
      windSpeedMetersPerSecond: 2,
      humidity: 0.5,
      uvIndex: 1,
    },
    minimumTemperatureCelsius: 16,
    maximumTemperatureCelsius: 16,
    hourly: [{
      forecastAt: crossingAt,
      temperatureCelsius: 16,
      apparentTemperatureCelsius: 16,
      condition: precipitationProbability > 0 ? 'rain' : 'clear',
      precipitationProbability,
      windSpeedMetersPerSecond: 2,
      humidity: 0.5,
      uvIndex: 1,
    }],
  };
}

test('cancelled pending identity can be scheduled again after its former fire time', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const scheduled = [];
  let now = '2026-09-09T15:00:00.000Z';
  const scheduler = new WeatherAlertScheduler(
    {
      cancelScheduledWeatherAlerts: async () => true,
      scheduleWeatherAlert: async (request) => {
        scheduled.push(request);
        return true;
      },
    },
    repository,
    () => now,
  );
  const alertId = 'precipitation_onset:manual:sample.istanbul:2026-09-09';

  await scheduler.reschedule({
    localProfileId: profileId,
    snapshot: precipitationSnapshot('rain-one', '2026-09-09T18:00:00.000Z', 0.8, now),
    enabled: true,
    language: 'en',
  });
  now = '2026-09-09T15:30:00.000Z';
  await scheduler.reschedule({
    localProfileId: profileId,
    snapshot: precipitationSnapshot('dry', '2026-09-09T18:00:00.000Z', 0, now),
    enabled: true,
    language: 'en',
  });
  assert.deepEqual(await database.getAllAsync(
    'SELECT id FROM weather_alert_deliveries WHERE id = ?',
    [alertId],
  ), []);

  now = '2026-09-09T17:30:00.000Z';
  await scheduler.reschedule({
    localProfileId: profileId,
    snapshot: precipitationSnapshot('rain-two', '2026-09-09T19:00:00.000Z', 0.8, now),
    enabled: true,
    language: 'en',
  });

  assert.deepEqual(scheduled.map(({ identifier }) => identifier), [alertId, alertId]);
  assert.deepEqual(
    (await database.getAllAsync(
      'SELECT id, fire_at FROM weather_alert_deliveries WHERE id = ?',
      [alertId],
    )).map((row) => ({ ...row })),
    [{ id: alertId, fire_at: '2026-09-09T18:00:00.000Z' }],
  );
});
