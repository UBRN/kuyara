import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalRecommendationRepository,
  RecommendationRepositoryError,
} from './recommendation-repository.ts';
import { SqliteRecommendationLocalDataSource } from './sqlite-recommendation-local-data-source.ts';
import {
  createRecommendationContext,
} from './worker-ai-recommendation-mapper.ts';
import { recommendOutfits } from '../application/recommend-outfits.ts';
import { migrateDatabase } from '../../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';

const profileId = 'profile-recommendation-test';
const recommendationId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const firstTime = '2026-08-01T10:00:00.000Z';
const secondTime = '2026-08-01T10:05:00.000Z';

function recommendationInput() {
  const observedAt = '2026-08-01T18:00:00.000Z';
  return {
    snapshot: {
      id: 'weather-snapshot-one',
      localProfileId: profileId,
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: { kind: 'sample', sourceId: 'persistence-test' },
      current: {
        observedAt,
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: 16,
      maximumTemperatureCelsius: 17,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
    dayVariant: 3,
  };
}

async function setup() {
  const database = new NodeSqliteDatabase();
  await migrateDatabase(database);
  await database.runAsync(
    `INSERT INTO local_profiles (
      singleton_key, id, clothing_preference, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at, deleted_at
    ) VALUES (1, ?, 'womens', 'en', 'light', 1, ?, ?, NULL)`,
    [profileId, firstTime, firstTime],
  );
  const dataSource = new SqliteRecommendationLocalDataSource(database);
  let now = firstTime;
  const repository = new LocalRecommendationRepository(dataSource, {
    createId: () => recommendationId,
    now: () => now,
  });
  return { database, dataSource, repository, setNow: (value) => { now = value; } };
}

function generatedRecommendation() {
  const input = recommendationInput();
  const context = createRecommendationContext(input);
  const recommendation = recommendOutfits(input);
  if (recommendation.status !== 'recommended') throw new Error('fixture unavailable');
  return {
    input,
    request: context,
    recommendation,
  };
}

test('migration v5 persists a validated recommendation snapshot with lifecycle fields', async (t) => {
  const { database, repository, setNow } = await setup();
  t.after(() => database.close());
  const version = await database.getFirstAsync('PRAGMA user_version');
  assert.equal(version.user_version, 7);
  const generated = generatedRecommendation();

  const first = await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  setNow(secondTime);
  const replaced = await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });

  assert.equal(first.id, recommendationId);
  assert.equal(replaced.id, recommendationId);
  assert.equal(replaced.createdAt, firstTime);
  assert.equal(replaced.updatedAt, secondTime);
  assert.equal(replaced.generationMode, 'deterministic-fallback');
  assert.equal(replaced.recommendation.outfits.length, 3);
  assert.equal(new Set(replaced.recommendation.outfits.map(
    ({ archetypeId }) => archetypeId)).size, 3);
  assert.deepEqual(await repository.getSnapshot(profileId), replaced);
});

test('older structured outfits without archetypes derive distinct fallback labels on read', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  const row = await database.getFirstAsync(
    'SELECT outfits_json FROM recommendation_snapshots WHERE local_profile_id = ?',
    [profileId],
  );
  const withoutArchetypes = JSON.parse(row.outfits_json).map(({ garments }) => garments);
  await database.runAsync(
    'UPDATE recommendation_snapshots SET outfits_json = ? WHERE local_profile_id = ?',
    [JSON.stringify(withoutArchetypes), profileId],
  );

  const restored = await repository.getSnapshot(profileId);

  assert.equal(new Set(restored.recommendation.outfits.map(
    ({ archetypeId }) => archetypeId)).size, 3);
});

test('failed replacement leaves the last valid snapshot intact', async (t) => {
  const { database, dataSource, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const saved = await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  const record = await dataSource.getSnapshot(profileId);

  await assert.rejects(() => dataSource.replaceSnapshot({
    ...record,
    generationMode: 'provider-name-must-not-persist',
  }));

  assert.deepEqual(await repository.getSnapshot(profileId), saved);
});

test('corrupt persisted payload fails with a sanitized repository error', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  await database.runAsync(
    `UPDATE recommendation_snapshots SET outfits_json = '{"rawProvider":"secret"}'`,
  );

  await assert.rejects(
    () => repository.getSnapshot(profileId),
    (error) => error instanceof RecommendationRepositoryError &&
      error.code === 'invalid-data' &&
      !String(error).includes('rawProvider'),
  );
});
