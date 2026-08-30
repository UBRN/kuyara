import assert from 'node:assert/strict';
import test from 'node:test';

import { ProfileApplicationController } from './application/profile-application-controller.ts';
import { resolveProfileHomeRoute } from './application/profile-route-gate.ts';
import {
  LocalProfileRepository,
  ProfileRepositoryError,
} from './data/profile-repository.ts';
import { SqliteProfileLocalDataSource } from './data/sqlite-profile-local-data-source.ts';
import { recommendOutfits } from '../recommendation/application/recommend-outfits.ts';
import { todayWeatherSnapshot } from '../today/__tests__/fixtures.ts';
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
  notificationsOptIn: 0,
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
  assert.equal(first.notificationsOptIn, 0);
});

test('notification opt-in defaults off and persists across a new repository', async (t) => {
  const { database, dataSource } = await createLocalDataSource(t);
  const repository = new LocalProfileRepository(dataSource);

  assert.equal((await repository.getOrCreateProfile()).notificationsOptIn, false);
  assert.equal((await repository.updateNotificationsOptIn(true)).notificationsOptIn, true);

  const relaunchedRepository = new LocalProfileRepository(
    new SqliteProfileLocalDataSource(database, {
      createId: () => 'unused',
      now: () => updatedAt,
    }),
  );
  assert.equal((await relaunchedRepository.getOrCreateProfile()).notificationsOptIn, true);
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

test('controller clothing preference updates flow into Today recommendations', async (t) => {
  const { dataSource } = await createLocalDataSource(t);
  const repository = new LocalProfileRepository(dataSource);
  const controller = new ProfileApplicationController(async () => repository);
  const womensOnlyKeys = ['catalog:blouse', 'catalog:skirt', 'catalog:dress'];
  const recommendForCurrentProfile = () => {
    const state = controller.getSnapshot();
    assert.equal(state.status, 'ready');
    return recommendOutfits({
      snapshot: todayWeatherSnapshot,
      clothingPreference: state.profile.clothingPreference,
      dayVariant: 0,
    });
  };
  const usesWomensOnlyKey = (recommendation) =>
    recommendation.outfits.some((outfit) =>
      outfit.candidateKeys.some((key) => womensOnlyKeys.includes(key)),
    );

  await controller.initialize();
  await controller.completeOnboarding({
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
  });
  const womensRecommendation = recommendForCurrentProfile();
  assert.equal(womensRecommendation.status, 'recommended');
  assert.equal(usesWomensOnlyKey(womensRecommendation), true);

  await controller.updateClothingPreference('mens');
  const mensRecommendation = recommendForCurrentProfile();
  assert.equal(mensRecommendation.status, 'recommended');
  assert.equal(usesWomensOnlyKey(mensRecommendation), false);
});

test('failed onboarding completion stays incomplete across launch and succeeds on retry', async (t) => {
  const { database, dataSource } = await createLocalDataSource(t);
  const repository = new LocalProfileRepository(dataSource);
  const controller = new ProfileApplicationController(async () => repository);
  const preferences = {
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
  };

  await controller.initialize();
  await database.execAsync(`
    CREATE TRIGGER reject_onboarding_completion
    BEFORE UPDATE OF onboarding_completed ON local_profiles
    WHEN NEW.onboarding_completed = 1
    BEGIN
      SELECT RAISE(FAIL, 'forced completion failure');
    END
  `);

  await assert.rejects(
    () => controller.completeOnboarding(preferences),
    (error) => error instanceof ProfileRepositoryError && error.code === 'unavailable',
  );
  const failedRow = await database.getFirstAsync(
    'SELECT onboarding_completed FROM local_profiles WHERE singleton_key = 1',
  );
  assert.equal(failedRow.onboarding_completed, 0);

  const relaunchedDataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => 'unused',
    now: () => updatedAt,
  });
  const relaunchedController = new ProfileApplicationController(async () =>
    new LocalProfileRepository(relaunchedDataSource));
  await relaunchedController.initialize();
  const relaunchedState = relaunchedController.getSnapshot();
  assert.equal(relaunchedState.status, 'ready');
  assert.equal(resolveProfileHomeRoute(relaunchedState.profile), 'onboarding');

  await database.execAsync('DROP TRIGGER reject_onboarding_completion');
  await relaunchedController.completeOnboarding(preferences);
  const completedState = relaunchedController.getSnapshot();
  assert.equal(completedState.status, 'ready');
  assert.equal(resolveProfileHomeRoute(completedState.profile), 'today');
  const completedRow = await database.getFirstAsync(
    'SELECT onboarding_completed FROM local_profiles WHERE singleton_key = 1',
  );
  assert.equal(completedRow.onboarding_completed, 1);
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

  const invalidNotificationsRepository = new LocalProfileRepository({
    getOrCreateProfile: async () => createRecord({ notificationsOptIn: 2 }),
  });
  await assert.rejects(
    () => invalidNotificationsRepository.getOrCreateProfile(),
    (error) =>
      error instanceof ProfileRepositoryError &&
      error.code === 'invalid-data',
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

test('application controller serializes distinct concurrent updates without dropping successors', async () => {
  let profile = {
    id: 'profile-id',
    clothingPreference: null,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted: true,
    createdAt,
    updatedAt: createdAt,
  };
  const calls = [];
  const language = Promise.withResolvers();
  const theme = Promise.withResolvers();
  const repository = {
    getOrCreateProfile: async () => profile,
    updateLanguagePreference: async (languagePreference) => {
      calls.push(['language', languagePreference]);
      await language.promise;
      return (profile = { ...profile, languagePreference });
    },
    updateThemePreference: async (themePreference) => {
      calls.push(['theme', themePreference]);
      await theme.promise;
      return (profile = { ...profile, themePreference });
    },
  };
  const controller = new ProfileApplicationController(async () => repository);
  await controller.initialize();

  const languageUpdate = controller.updateLanguagePreference('tr');
  const themeUpdate = controller.updateThemePreference('dark');
  let themeSettled = false;
  void themeUpdate.then(() => {
    themeSettled = true;
  });

  assert.deepEqual(calls, [['language', 'tr']]);
  assert.equal(controller.getSnapshot().isSaving, true);

  language.resolve();
  await languageUpdate;
  assert.deepEqual(calls, [['language', 'tr'], ['theme', 'dark']]);
  assert.equal(controller.getSnapshot().profile.languagePreference, 'tr');
  assert.equal(controller.getSnapshot().isSaving, true);
  assert.equal(themeSettled, false);

  theme.resolve();
  await themeUpdate;
  assert.deepEqual({
    languagePreference: profile.languagePreference,
    themePreference: profile.themePreference,
  }, {
    languagePreference: 'tr',
    themePreference: 'dark',
  });
  assert.equal(controller.getSnapshot().profile.themePreference, 'dark');
  assert.equal(controller.getSnapshot().isSaving, false);
});

test('application controller continues queued updates after a predecessor rejects', async () => {
  const failure = new Error('language failed');
  const language = Promise.withResolvers();
  const theme = Promise.withResolvers();
  const calls = [];
  let profile = {
    id: 'profile-id',
    clothingPreference: null,
    languagePreference: 'system',
    themePreference: 'system',
    onboardingCompleted: true,
    createdAt,
    updatedAt: createdAt,
  };
  const repository = {
    getOrCreateProfile: async () => profile,
    updateLanguagePreference: async (languagePreference) => {
      calls.push(['language', languagePreference]);
      await language.promise;
      return (profile = { ...profile, languagePreference });
    },
    updateThemePreference: async (themePreference) => {
      calls.push(['theme', themePreference]);
      await theme.promise;
      return (profile = { ...profile, themePreference });
    },
  };
  const controller = new ProfileApplicationController(async () => repository);
  await controller.initialize();

  const languageUpdate = controller.updateLanguagePreference('tr');
  const themeUpdate = controller.updateThemePreference('dark');

  language.reject(failure);
  await assert.rejects(languageUpdate, (error) => error === failure);
  assert.deepEqual(calls, [['language', 'tr'], ['theme', 'dark']]);
  assert.equal(controller.getSnapshot().profile.languagePreference, 'system');
  assert.equal(controller.getSnapshot().isSaving, true);

  theme.resolve();
  await themeUpdate;
  assert.equal(controller.getSnapshot().profile.themePreference, 'dark');
  assert.equal(controller.getSnapshot().isSaving, false);
});
