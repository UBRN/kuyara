import assert from 'node:assert/strict';
import test from 'node:test';

import { ProfileApplicationController } from './application/profile-application-controller.ts';
import {
  LocalProfileRepository,
  ProfileRepositoryError,
} from './data/profile-repository.ts';
import { SqliteProfileLocalDataSource } from './data/sqlite-profile-local-data-source.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const createdAt = '2026-07-30T10:00:00.000Z';
const updatedAt = '2026-07-30T10:05:00.000Z';

const createRecord = (overrides = {}) => ({
  id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  clothingPreference: null,
  languagePreference: 'system',
  themePreference: 'system',
  onboardingCompleted: 0,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
  ...overrides,
});

async function createLocalDataSource(t, dependencyOverrides = {}) {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  let idCount = 0;
  const dependencies = {
    createId: () => {
      idCount += 1;
      return '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
    },
    now: () => createdAt,
    ...dependencyOverrides,
  };
  return {
    database,
    dataSource: new SqliteProfileLocalDataSource(database, dependencies),
    getIdCount: () => idCount,
  };
}

test('a missing profile is created once and concurrent initialization returns one stable row', async (t) => {
  const { database, dataSource, getIdCount } = await createLocalDataSource(t);

  const [first, second, third] = await Promise.all([
    dataSource.getOrCreateProfile(),
    dataSource.getOrCreateProfile(),
    dataSource.getOrCreateProfile(),
  ]);
  const count = await database.getFirstAsync('SELECT COUNT(*) AS count FROM local_profiles');

  assert.equal(getIdCount(), 1);
  assert.equal(count.count, 1);
  assert.equal(first.id, second.id);
  assert.equal(second.id, third.id);
  assert.equal(first.clothingPreference, null);
  assert.equal(first.languagePreference, 'system');
  assert.equal(first.themePreference, 'system');
  assert.equal(first.onboardingCompleted, 0);
});

test('an existing profile is returned unchanged without generating another UUID', async (t) => {
  const { database } = await createLocalDataSource(t);
  await database.runAsync(
    `
      INSERT INTO local_profiles (
        singleton_key, id, clothing_preference, language_preference,
        theme_preference, onboarding_completed, created_at, updated_at, deleted_at
      ) VALUES (1, ?, 'mens', 'tr', 'dark', 1, ?, ?, NULL)
    `,
    ['existing-id', createdAt, updatedAt],
  );
  let generated = false;
  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => {
      generated = true;
      return 'new-id';
    },
    now: () => updatedAt,
  });

  const profile = await dataSource.getOrCreateProfile();

  assert.equal(generated, false);
  assert.deepEqual(profile, createRecord({
    id: 'existing-id',
    clothingPreference: 'mens',
    languagePreference: 'tr',
    themePreference: 'dark',
    onboardingCompleted: 1,
    updatedAt,
  }));
});

test('onboarding completion and preference updates persist with bound values', async (t) => {
  let currentTime = createdAt;
  const { database, dataSource } = await createLocalDataSource(t, {
    now: () => currentTime,
  });
  await dataSource.getOrCreateProfile();
  currentTime = updatedAt;

  const completed = await dataSource.completeOnboarding({
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
  });
  const clothing = await dataSource.updateClothingPreference('mens');
  const language = await dataSource.updateLanguagePreference('tr');
  const theme = await dataSource.updateThemePreference('dark');
  const row = await database.getFirstAsync(
    'SELECT clothing_preference, language_preference, theme_preference, onboarding_completed FROM local_profiles',
  );

  assert.equal(completed.onboardingCompleted, 1);
  assert.equal(clothing.clothingPreference, 'mens');
  assert.equal(language.languagePreference, 'tr');
  assert.equal(theme.themePreference, 'dark');
  assert.deepEqual({ ...row }, {
    clothing_preference: 'mens',
    language_preference: 'tr',
    theme_preference: 'dark',
    onboarding_completed: 1,
  });
});

test('repository maps persistence values and rejects invalid stored enums predictably', async () => {
  const validDataSource = {
    getOrCreateProfile: async () => createRecord({ clothingPreference: 'womens' }),
  };
  const validRepository = new LocalProfileRepository(validDataSource);
  const valid = await validRepository.getOrCreateProfile();
  assert.equal(valid.clothingPreference, 'womens');
  assert.equal(valid.onboardingCompleted, false);
  assert.equal('deletedAt' in valid, false);

  const invalidRepository = new LocalProfileRepository({
    getOrCreateProfile: async () => createRecord({ themePreference: 'sepia' }),
  });
  await assert.rejects(
    () => invalidRepository.getOrCreateProfile(),
    (error) =>
      error instanceof ProfileRepositoryError &&
      error.code === 'invalid-data' &&
      !error.message.includes('sepia'),
  );
});

test('repository delegates each explicit update and sanitizes data-source errors', async () => {
  const calls = [];
  const dataSource = {
    getOrCreateProfile: async () => createRecord(),
    completeOnboarding: async (preferences) => {
      calls.push(['complete', preferences]);
      return createRecord({ ...preferences, onboardingCompleted: 1, updatedAt });
    },
    updateClothingPreference: async (preference) => {
      calls.push(['clothing', preference]);
      return createRecord({ clothingPreference: preference, updatedAt });
    },
    updateLanguagePreference: async (preference) => {
      calls.push(['language', preference]);
      return createRecord({ languagePreference: preference, updatedAt });
    },
    updateThemePreference: async () => {
      throw new Error('SQLITE_INTERNAL secret statement');
    },
  };
  const repository = new LocalProfileRepository(dataSource);

  await repository.completeOnboarding({
    clothingPreference: 'mens',
    languagePreference: 'tr',
    themePreference: 'dark',
  });
  await repository.updateClothingPreference('womens');
  await repository.updateLanguagePreference('en');
  await assert.rejects(
    () => repository.updateThemePreference('light'),
    (error) =>
      error instanceof ProfileRepositoryError &&
      error.code === 'unavailable' &&
      !error.message.includes('SQLITE'),
  );
  assert.deepEqual(calls.map(([name]) => name), ['complete', 'clothing', 'language']);
});

test('application controller exposes loading, incomplete, completed, failure, and refreshed states', async () => {
  let profile = {
    id: 'profile-id',
    clothingPreference: null,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted: false,
    createdAt,
    updatedAt: createdAt,
  };
  let initializationCount = 0;
  const repository = {
    getOrCreateProfile: async () => {
      initializationCount += 1;
      return profile;
    },
    completeOnboarding: async (preferences) =>
      (profile = { ...profile, ...preferences, onboardingCompleted: true, updatedAt }),
    updateClothingPreference: async (clothingPreference) =>
      (profile = { ...profile, clothingPreference, updatedAt }),
    updateLanguagePreference: async (languagePreference) =>
      (profile = { ...profile, languagePreference, updatedAt }),
    updateThemePreference: async (themePreference) =>
      (profile = { ...profile, themePreference, updatedAt }),
  };
  const controller = new ProfileApplicationController(async () => repository);

  assert.deepEqual(controller.getSnapshot(), { status: 'loading' });
  await Promise.all([controller.initialize(), controller.initialize()]);
  assert.equal(initializationCount, 1);
  assert.equal(controller.getSnapshot().profile.onboardingCompleted, false);

  await controller.completeOnboarding({
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
  });
  assert.equal(controller.getSnapshot().profile.onboardingCompleted, true);
  await controller.updateClothingPreference('mens');
  await controller.updateLanguagePreference('tr');
  await controller.updateThemePreference('dark');
  assert.deepEqual(
    {
      clothingPreference: controller.getSnapshot().profile.clothingPreference,
      languagePreference: controller.getSnapshot().profile.languagePreference,
      themePreference: controller.getSnapshot().profile.themePreference,
    },
    { clothingPreference: 'mens', languagePreference: 'tr', themePreference: 'dark' },
  );

  const failingController = new ProfileApplicationController(async () => {
    throw new Error('database failed');
  });
  await failingController.initialize();
  assert.deepEqual(failingController.getSnapshot(), { status: 'error' });
});
