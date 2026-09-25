import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RecommendationApplicationController,
  recommendationRefreshTrigger,
} from '../application/recommendation-application-controller.ts';
import { reaskForDressingDay } from '../application/reask-for-dressing-day.ts';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';

import {
  LocalRecommendationRepository,
  RecommendationRepositoryError,
} from './recommendation-repository.ts';
import { SqliteRecommendationLocalDataSource } from './sqlite-recommendation-local-data-source.ts';
import { SqliteDressingDayChoiceRepository } from './sqlite-dressing-day-choice-repository.ts';
import { SqliteDressingDayDepartureRepository } from './sqlite-dressing-day-departure-repository.ts';
import {
  createRecommendationContext,
} from './worker-ai-recommendation-mapper.ts';
import { recommendOutfits } from '../application/recommend-outfits.ts';
import { latestDatabaseVersion, migrateDatabase } from '../../../infrastructure/sqlite/migrations.ts';
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
    localDayKey: '2026-08-01',
  };
}

async function setup() {
  const database = new NodeSqliteDatabase();
  await migrateDatabase(database);
  await database.runAsync(
    `INSERT INTO local_profiles (
      singleton_key, id, gender, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at, deleted_at
    ) VALUES (1, ?, 'woman', 'en', 'light', 1, ?, ?, NULL)`,
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
  const context = createRecommendationContext(input, input.localDayKey);
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
  assert.equal(version.user_version, latestDatabaseVersion);
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
  assert.equal(replaced.catalogVersion, 5);
  assert.equal(replaced.localDayKey, '2026-08-01');
  assert.deepEqual(replaced.paletteWeather, { temperatureC: 16, condition: 'clear' });
  assert.equal(replaced.recommendation.outfits.length, 3);
  assert.equal(new Set(replaced.recommendation.outfits.map(
    ({ archetypeId }) => archetypeId)).size, 3);
  assert.deepEqual(await repository.getSnapshot(profileId), replaced);
});

test('palette weather round trips in context_json and older rows remain readable', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const saved = await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  assert.deepEqual(saved.paletteWeather, { temperatureC: 16, condition: 'clear' });
  const row = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  const context = JSON.parse(row.context_json);
  assert.deepEqual(context.paletteWeather, saved.paletteWeather);
  delete context.paletteWeather;
  await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?',
    [JSON.stringify(context)]);
  assert.equal((await repository.getSnapshot(profileId)).paletteWeather, undefined);
});

test('a backwards clock still saves and reads the recommendation', async (t) => {
  const { database, repository, setNow } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const input = {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  };
  await repository.saveSnapshot(profileId, input);

  setNow('2026-08-01T09:00:00.000Z');
  const replaced = await repository.saveSnapshot(profileId, input);

  assert.equal(replaced.createdAt, firstTime);
  assert.equal(replaced.updatedAt, firstTime);
  assert.deepEqual(await repository.getSnapshot(profileId), replaced);

  // A row written by an earlier build can already hold updatedAt before createdAt.
  await database.runAsync(
    `UPDATE recommendation_snapshots SET updated_at = '2026-08-01T09:00:00.000Z'`,
  );
  assert.equal((await repository.getSnapshot(profileId)).createdAt, firstTime);
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

test('persisted dress style round trips and rows without a day key are rejected', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: { ...generated.request, dressStyle: 'formal' },
    recommendation: generated.recommendation,
  });
  assert.equal((await repository.getSnapshot(profileId)).dressStyle, 'formal');
  const row = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  const context = JSON.parse(row.context_json);
  assert.equal(context.dressStyle, 'formal');
  assert.equal('birthDate' in context, false);
  delete context.dressStyle;
  const retiredKey = ['age', 'Band'].join('');
  context[retiredKey] = 'retired';
  await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?', [JSON.stringify(context)]);
  assert.equal((await repository.getSnapshot(profileId)).dressStyle, 'smart');
  delete context[retiredKey];
  delete context.localDayKey;
  await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?', [JSON.stringify(context)]);
  await assert.rejects(() => repository.getSnapshot(profileId),
    (error) => error instanceof RecommendationRepositoryError && error.code === 'invalid-data');
});

test('the snapshot boundary rejects wrong day, catalog, partial, duplicate and invalid trios', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const input = {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  };
  await repository.saveSnapshot(profileId, input);
  await assert.rejects(() => repository.getSnapshot(profileId, '2026-08-01:evening'),
    (error) => error instanceof RecommendationRepositoryError && error.code === 'invalid-data');
  assert.equal((await repository.getSnapshot(profileId, generated.input.localDayKey))
    .recommendation.outfits.length, 3);

  for (const recommendation of [
    { ...generated.recommendation, outfits: generated.recommendation.outfits.slice(0, 2) },
    { ...generated.recommendation, outfits: [generated.recommendation.outfits[0],
      generated.recommendation.outfits[0], generated.recommendation.outfits[2]] },
  ]) {
    await assert.rejects(() => repository.saveSnapshot(profileId, { ...input, recommendation }),
      (error) => error instanceof RecommendationRepositoryError && error.code === 'invalid-input');
  }
  await assert.rejects(() => repository.saveSnapshot(profileId, {
    ...input, context: { ...generated.request, catalogVersion: generated.request.catalogVersion - 1 },
  }), (error) => error instanceof RecommendationRepositoryError && error.code === 'invalid-input');

  const row = await database.getFirstAsync('SELECT context_json, outfits_json FROM recommendation_snapshots');
  const savedContext = JSON.parse(row.context_json);
  const savedOutfits = JSON.parse(row.outfits_json);
  for (const [field, value] of [
    ['context_json', JSON.stringify({ ...savedContext, catalogVersion: savedContext.catalogVersion - 1 })],
    ['outfits_json', JSON.stringify(savedOutfits.slice(0, 2))],
    ['outfits_json', JSON.stringify([savedOutfits[0], savedOutfits[0], savedOutfits[2]])],
    ['context_json', JSON.stringify({ ...savedContext, options: savedContext.options.filter(
      ({ optionId }) => optionId !== generated.recommendation.outfits[0].optionId) })],
  ]) {
    await database.runAsync(`UPDATE recommendation_snapshots SET ${field} = ?`, [value]);
    await assert.rejects(() => repository.getSnapshot(profileId),
      (error) => error instanceof RecommendationRepositoryError && error.code === 'invalid-data');
    await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?, outfits_json = ?',
      [row.context_json, row.outfits_json]);
  }
});

test('offline start after a catalog bump replaces the old row from cached weather', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  const row = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  const oldContext = JSON.parse(row.context_json);
  oldContext.catalogVersion -= 1;
  await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?',
    [JSON.stringify(oldContext)]);

  let networkCalls = 0;
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => repository,
    client: { recommendRouted: async () => { networkCalls += 1; throw new Error('offline'); } },
    holdPhase: async () => undefined,
  });
  await controller.initialize(generated.input.localDayKey);
  assert.equal(controller.getSnapshot().snapshot, null);
  assert.equal(controller.getSnapshot().lastFailure, null);
  const replaced = await controller.refresh('first-recommendation', generated.input);
  assert.equal(replaced.recommendation.generationMode, 'deterministic-fallback');
  assert.equal(replaced.recommendation.outfits.length, 3);
  assert.equal(replaced.catalogVersion, generated.request.catalogVersion);
  assert.equal(controller.getSnapshot().snapshot.id, recommendationId);
  assert.equal(networkCalls, 1);
});

for (const scenario of [
  { name: '18:00', currentAt: '2026-09-24T16:00:00.000Z',
    currentKey: '2026-09-24', departureAt: '2026-09-24T18:30:00.000Z',
    departureKey: '2026-09-24:evening' },
  { name: '04:00', currentAt: '2026-09-24T23:00:00.000Z',
    currentKey: '2026-09-24:evening', departureAt: '2026-09-25T04:30:00.000Z',
    departureKey: '2026-09-25' },
]) {
  test(`crossing ${scenario.name} plans Later without replacing Today, then generates once`, async (t) => {
    const { database, repository } = await setup();
    t.after(() => database.close());
    const base = recommendationInput();
    const input = {
      ...base,
      now: scenario.currentAt,
      localDayKey: scenario.currentKey,
      dressStyle: 'smart',
      snapshot: {
        ...base.snapshot,
        fetchedAt: scenario.currentAt,
        current: { ...base.snapshot.current, observedAt: scenario.currentAt },
        hourly: [{ ...base.snapshot.hourly[0], forecastAt: scenario.departureAt }],
      },
    };
    const initialRecommendation = recommendOutfits(input);
    assert.equal(initialRecommendation.status, 'recommended');
    const current = await repository.saveSnapshot(profileId, {
      weatherSnapshotId: input.snapshot.id,
      locationKey: input.snapshot.locationKey,
      context: createRecommendationContext(input, scenario.currentKey),
      recommendation: initialRecommendation,
    });
    let nextChoiceId = 0;
    const choiceRepository = new SqliteDressingDayChoiceRepository(database,
      () => nextChoiceId++ === 0
        ? 'f60a06dd-65a7-455b-9af3-c28101172170'
        : 'f60a06dd-65a7-455b-9af3-c28101172172', () => scenario.currentAt);
    const departureRepository = new SqliteDressingDayDepartureRepository(database,
      () => 'f60a06dd-65a7-455b-9af3-c28101172171', () => scenario.currentAt);
    await choiceRepository.upsert(profileId, scenario.currentKey, 'smart', 'morning');
    let generations = 0;
    const controller = new RecommendationApplicationController(profileId, {
      loadRepository: async () => repository,
      client: { recommendRouted: async () => { generations += 1; throw new Error('offline'); } },
      holdPhase: async () => undefined,
    });
    await controller.initialize(scenario.currentKey);

    const planned = await reaskForDressingDay({ formality: 'formal',
      departureAt: scenario.departureAt, timeZone: 'Etc/UTC' }, {
      localProfileId: profileId,
      currentDayKey: scenario.currentKey,
      resolvedDressStyle: 'smart',
      hasCurrentDayChoice: true,
      choiceRepository,
      departureRepository,
      currentInput: () => input,
      refresh: (next) => controller.refresh('regenerate', next),
      now: () => scenario.currentAt,
    });
    await planned.settled;
    assert.equal(planned.choice, null);
    assert.equal(planned.departure, null);
    assert.deepEqual(controller.getSnapshot().snapshot, current);
    assert.deepEqual(await repository.getSnapshot(profileId, scenario.currentKey), current);
    assert.equal(generations, 0);
    assert.equal((await choiceRepository.get(profileId, scenario.currentKey)).formality, 'smart');
    assert.equal((await choiceRepository.get(profileId, scenario.departureKey)).formality, 'formal');
    const savedDeparture = await departureRepository.get(profileId, scenario.departureKey);
    assert.equal(savedDeparture.departureAt, scenario.departureAt);
    assert.equal(await departureRepository.get(profileId, scenario.currentKey), null);

    const futureInput = { ...input, now: savedDeparture.departureAt,
      localDayKey: savedDeparture.dayKey, departureAt: savedDeparture.departureAt,
      dressStyle: (await choiceRepository.get(profileId, scenario.departureKey)).formality };
    const trigger = recommendationRefreshTrigger({
      weatherSnapshotId: current.weatherSnapshotId,
      locationKey: current.locationKey,
      clothingPreference: current.clothingPreference,
      dressStyle: current.dressStyle,
      catalogVersion: current.catalogVersion,
      localDayKey: current.localDayKey,
    }, {
      weatherSnapshotId: futureInput.snapshot.id,
      locationKey: futureInput.snapshot.locationKey,
      clothingPreference: futureInput.clothingPreference,
      dressStyle: futureInput.dressStyle,
      catalogVersion: garmentCatalogVersion,
      localDayKey: futureInput.localDayKey,
    });
    assert.ok(trigger);
    const next = await controller.refresh(trigger, futureInput);
    assert.equal(next.localDayKey, scenario.departureKey);
    assert.equal(next.dressStyle, 'formal');
    assert.equal(next.recommendation.outfits.length, 3);
    assert.equal((await repository.getSnapshot(profileId, scenario.departureKey)).localDayKey,
      scenario.departureKey);
    assert.equal(generations, 1);
  });
}

test('a same-day Now re-ask still generates once under the current key', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const input = { ...generated.input, now: '2026-08-01T10:00:00.000Z', dressStyle: 'smart' };
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: input.snapshot.id,
    locationKey: input.snapshot.locationKey,
    context: generated.request,
    recommendation: generated.recommendation,
  });
  const choiceRepository = new SqliteDressingDayChoiceRepository(database,
    () => 'f60a06dd-65a7-455b-9af3-c28101172170', () => input.now);
  const departureRepository = new SqliteDressingDayDepartureRepository(database,
    () => 'f60a06dd-65a7-455b-9af3-c28101172171', () => input.now);
  let generations = 0;
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => repository,
    client: { recommendRouted: async () => { generations += 1; throw new Error('offline'); } },
    holdPhase: async () => undefined,
    reserveAiReask: async () => true,
  });
  await controller.initialize(input.localDayKey);
  const result = await reaskForDressingDay({ formality: 'formal', departureAt: null,
    timeZone: 'Etc/UTC' }, {
    localProfileId: profileId,
    currentDayKey: input.localDayKey,
    resolvedDressStyle: 'smart',
    hasCurrentDayChoice: false,
    choiceRepository,
    departureRepository,
    currentInput: () => input,
    refresh: (next) => controller.refresh('regenerate', next),
    now: () => input.now,
  });
  await result.settled;
  assert.equal(result.choice.dayKey, input.localDayKey);
  assert.equal(result.choice.formality, 'formal');
  assert.equal(result.departure, null);
  assert.equal(generations, 1);
  assert.equal((await repository.getSnapshot(profileId, input.localDayKey)).dressStyle, 'formal');
});

test('optional validated insight round trips in context_json and old rows still load', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();
  const context = { ...generated.request, insightSentence: 'The outfit suits the day.',
    insightLocale: 'en', coverageStart: '2026-08-01T20:00:00.000Z',
    coverageEnd: '2026-08-02T01:00:00.000Z' };
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context,
    recommendation: { ...generated.recommendation, generationMode: 'ai-assisted' },
  });
  const row = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  assert.equal(JSON.parse(row.context_json).insightSentence, context.insightSentence);
  assert.equal(JSON.parse(row.context_json).insightLocale, 'en');
  assert.equal((await repository.getSnapshot(profileId)).coverageEnd, context.coverageEnd);
  assert.equal((await repository.getSnapshot(profileId)).recommendation.insightSentence,
    context.insightSentence);
  assert.equal((await repository.getSnapshot(profileId)).recommendation.insightLocale, 'en');
  const oldContext = JSON.parse(row.context_json);
  delete oldContext.insightSentence;
  delete oldContext.insightLocale;
  delete oldContext.coverageStart;
  delete oldContext.coverageEnd;
  await database.runAsync('UPDATE recommendation_snapshots SET context_json = ?',
    [JSON.stringify(oldContext)]);
  assert.equal((await repository.getSnapshot(profileId)).recommendation.insightSentence, undefined);
  assert.equal((await repository.getSnapshot(profileId)).recommendation.insightLocale, undefined);
  assert.equal((await repository.getSnapshot(profileId)).coverageEnd, undefined);
});

// The stored gate reads the day the result was generated for, not today, so a weekend
// result is still readable on the Monday after. A row written before the field parses as
// day-blind and keeps its label too.
test('a weekend recommendation survives a read on a later day', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  // A mild casual day is where `weekend_relaxed` reaches the top of the fallback order.
  const base = recommendationInput();
  const warm = (reading) => ({
    ...reading, temperatureCelsius: 22, apparentTemperatureCelsius: 22,
  });
  const input = {
    ...base,
    dressStyle: 'casual',
    dayKind: 'weekend',
    snapshot: {
      ...base.snapshot,
      current: warm(base.snapshot.current),
      hourly: base.snapshot.hourly.map(warm),
      minimumTemperatureCelsius: 22,
      maximumTemperatureCelsius: 23,
    },
  };
  const context = createRecommendationContext(input, input.localDayKey);
  const recommendation = recommendOutfits(input);
  assert.equal(recommendation.status, 'recommended');
  const isWeekendRelaxed = ({ archetypeId }) => archetypeId === 'weekend_relaxed';
  assert.ok(recommendation.outfits.some(isWeekendRelaxed));
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: input.snapshot.id,
    locationKey: input.snapshot.locationKey,
    context,
    recommendation,
  });
  assert.ok((await repository.getSnapshot(profileId)).recommendation.outfits.some(isWeekendRelaxed));

  const row = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  assert.equal(JSON.parse(row.context_json).dayKind, 'weekend');

  // The pre-dayKind row carries the labels the legacy rule allowed (`office_ready` on
  // formal only, `on_the_move` with sneakers only), which is what a day-blind generation
  // produces, because a build that sent no day kind also assigned no day-aware label.
  const legacyInput = { ...input, dayKind: undefined };
  const legacyRecommendation = recommendOutfits(legacyInput);
  assert.ok(legacyRecommendation.outfits.some(isWeekendRelaxed));
  await repository.saveSnapshot(profileId, {
    weatherSnapshotId: input.snapshot.id,
    locationKey: input.snapshot.locationKey,
    context: createRecommendationContext(legacyInput, input.localDayKey),
    recommendation: legacyRecommendation,
  });
  const legacyRow = await database.getFirstAsync('SELECT context_json FROM recommendation_snapshots');
  assert.equal('dayKind' in JSON.parse(legacyRow.context_json), false);
  assert.ok((await repository.getSnapshot(profileId)).recommendation.outfits.some(isWeekendRelaxed));
});

// ADR 0034 section 3: migration v13 widened the generation-mode constraint and the in-memory
// controller path already covers the new value. This joins the two halves: the third mode
// survives a real write and read through the repository.
test('an on-device-ai snapshot round trips through the repository', async (t) => {
  const { database, repository } = await setup();
  t.after(() => database.close());
  const generated = generatedRecommendation();

  const saved = await repository.saveSnapshot(profileId, {
    weatherSnapshotId: generated.input.snapshot.id,
    locationKey: generated.input.snapshot.locationKey,
    context: generated.request,
    recommendation: { ...generated.recommendation, generationMode: 'on-device-ai' },
  });

  assert.equal(saved.generationMode, 'on-device-ai');
  assert.equal(saved.recommendation.generationMode, 'on-device-ai');
  const read = await repository.getSnapshot(profileId);
  assert.equal(read.generationMode, 'on-device-ai');
  assert.equal(read.recommendation.generationMode, 'on-device-ai');
  assert.deepEqual(read, saved);
});
