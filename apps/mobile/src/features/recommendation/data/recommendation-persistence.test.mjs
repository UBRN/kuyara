import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalRecommendationRepository,
  RecommendationRepositoryError,
} from './recommendation-repository.ts';
import { SqliteRecommendationLocalDataSource } from './sqlite-recommendation-local-data-source.ts';
import {
  createAiRecommendationRequest,
  mapWorkerAiRecommendation,
} from './worker-ai-recommendation-mapper.ts';
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
        temperatureCelsius: 30,
        apparentTemperatureCelsius: 30,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: 30,
      maximumTemperatureCelsius: 31,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius: 30,
        apparentTemperatureCelsius: 30,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
    wardrobeItems: [],
  };
}

const workerOutfit = [
  { slot: 'primary_top', layerRole: 'standalone', candidateKey: 'catalog:t_shirt' },
  { slot: 'bottom', layerRole: 'standalone', candidateKey: 'catalog:shorts' },
  { slot: 'footwear', layerRole: null, candidateKey: 'catalog:sandals' },
];

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
  const request = createAiRecommendationRequest(input);
  const ai = mapWorkerAiRecommendation(request, {
    outfits: [workerOutfit, workerOutfit, workerOutfit],
  });
  return {
    input,
    request,
    recommendation: Object.freeze({
      ...ai,
      generationMode: 'deterministic-fallback',
    }),
  };
}

test('migration v5 persists a validated recommendation snapshot with lifecycle fields', async (t) => {
  const { database, repository, setNow } = await setup();
  t.after(() => database.close());
  const version = await database.getFirstAsync('PRAGMA user_version');
  assert.equal(version.user_version, 6);
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
  assert.deepEqual(await repository.getSnapshot(profileId), replaced);
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
