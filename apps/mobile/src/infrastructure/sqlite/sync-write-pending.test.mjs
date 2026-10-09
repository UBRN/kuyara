import assert from 'node:assert/strict';
import test from 'node:test';

import { SqliteProfileLocalDataSource } from '../../features/profile/data/sqlite-profile-local-data-source.ts';
import { LocalWardrobeRepository } from '../../features/wardrobe/data/wardrobe-repository.ts';
import { SqliteWardrobeLocalDataSource } from '../../features/wardrobe/data/sqlite-wardrobe-local-data-source.ts';
import { SqliteDressingDayChoiceRepository } from '../../features/recommendation/data/sqlite-dressing-day-choice-repository.ts';
import { SqliteDressingDayDepartureRepository } from '../../features/recommendation/data/sqlite-dressing-day-departure-repository.ts';
import { SqliteOutfitHistoryRepository } from '../../features/recommendation/data/sqlite-outfit-history-repository.ts';
import { migrateDatabase } from './migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const itemId = '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const dayId = '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const now = '2026-10-02T10:00:00.000Z';
const photoPath = `kuyara/wardrobe/photos/${itemId}.jpg`;

async function setup(t) {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  return database;
}

async function insertProfile(database) {
  await database.runAsync(`INSERT INTO local_profiles (singleton_key, id, language_preference,
    theme_preference, onboarding_completed, created_at, updated_at)
    VALUES (1, ?, 'system', 'system', 0, ?, ?)`, [profileId, now, now]);
}

async function pending(database, table) {
  return (await database.getFirstAsync(`SELECT pending_sync FROM ${table}`)).pending_sync;
}

test('profile marks only synced field writes, including onboarding', async (t) => {
  const database = await setup(t);
  const profile = new SqliteProfileLocalDataSource(database, {
    createId: () => profileId, now: () => now,
  });
  await profile.getOrCreateProfile();
  assert.equal(await pending(database, 'local_profiles'), 0);

  const syncedWrites = [
    () => profile.completeOnboarding({ gender: 'woman', dressStyle: 'casual',
      styleAesthetics: ['classic'], birthDate: null, displayName: 'Ada' }),
    () => profile.updateDisplayName('Ece'),
    () => profile.updateGender('man'),
    () => profile.updateDressStyle('smart'),
    () => profile.updateStyleAesthetics(['sporty']),
  ];
  for (const write of syncedWrites) {
    await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
    await write();
    assert.equal(await pending(database, 'local_profiles'), 1);
  }

  // A write that leaves the synced value as it is does not mark the profile; a changed value does.
  const valueWrites = [
    ['display name', () => profile.updateDisplayName('Ece'), () => profile.updateDisplayName('Ada')],
    ['gender', () => profile.updateGender('man'), () => profile.updateGender('woman')],
    ['dress style', () => profile.updateDressStyle('smart'), () => profile.updateDressStyle('formal')],
    ['style aesthetics', () => profile.updateStyleAesthetics(['sporty']),
      () => profile.updateStyleAesthetics(['classic', 'sporty'])],
  ];
  for (const [field, same, changed] of valueWrites) {
    await same();
    await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
    await same();
    assert.equal(await pending(database, 'local_profiles'), 0, `${field} unchanged`);
    await changed();
    assert.equal(await pending(database, 'local_profiles'), 1, `${field} changed`);
  }
  await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
  await profile.updateDisplayName(null);
  assert.equal(await pending(database, 'local_profiles'), 1);
  await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
  await profile.updateDisplayName(null);
  assert.equal(await pending(database, 'local_profiles'), 0);
  await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
  await profile.updateStyleAesthetics(['sporty', 'classic']);
  assert.equal(await pending(database, 'local_profiles'), 0);

  const deviceWrites = [
    () => profile.updateBirthDate('1994-03-14'),
    () => profile.updateLanguagePreference('tr'),
    () => profile.updateThemePreference('dark'),
    () => profile.updateNotificationsOptIn(true),
    () => profile.updateMorningBriefingOptIn(true),
    () => profile.updateMorningSheetEnabled(false),
    () => profile.updateEasierToSee(true),
    () => profile.markWeatherAlertOfferShown(),
    () => profile.markWalkthroughSeen(),
    () => profile.markSwapHintShown(),
    () => profile.markReviewRequested(),
    () => profile.updateAnalyticsConsent('granted'),
  ];
  for (const write of deviceWrites) {
    await database.runAsync('UPDATE local_profiles SET pending_sync = 0');
    await write();
    assert.equal(await pending(database, 'local_profiles'), 0);
  }
});

test('Closet create, edit and delete mark their row; photo cleanup does not', async (t) => {
  const database = await setup(t);
  await insertProfile(database);
  const repository = new LocalWardrobeRepository(new SqliteWardrobeLocalDataSource(database), {
    createId: () => itemId, now: () => now,
  });
  const item = await repository.createItem({ localProfileId: profileId,
    garmentTypeId: 'weather_boots', photoRelativePath: photoPath });
  assert.equal(await pending(database, 'wardrobe_items'), 1);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 0');
  await repository.updateItem({ id: item.id, localProfileId: profileId, name: 'Boots' });
  assert.equal(await pending(database, 'wardrobe_items'), 1);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 0');
  await repository.softDeleteItem(profileId, item.id);
  assert.equal(await pending(database, 'wardrobe_items'), 1);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 0');
  assert.equal(await repository.clearPendingPhotoCleanup(profileId, item.id, photoPath), true);
  assert.equal(await pending(database, 'wardrobe_items'), 0);
});

test('daily choice insert and update mark the day row', async (t) => {
  const database = await setup(t);
  await insertProfile(database);
  const repository = new SqliteDressingDayChoiceRepository(database, () => dayId, () => now);
  await repository.upsert(profileId, '2026-10-02', 'casual', 'morning');
  assert.equal(await pending(database, 'dressing_day_choices'), 1);
  await database.runAsync('UPDATE dressing_day_choices SET pending_sync = 0');
  await repository.upsert(profileId, '2026-10-02', 'smart', 'chip');
  assert.equal(await pending(database, 'dressing_day_choices'), 1);
});

test('daily departure insert, update and clear mark the day row', async (t) => {
  const database = await setup(t);
  await insertProfile(database);
  const repository = new SqliteDressingDayDepartureRepository(database, () => dayId, () => now);
  await repository.upsert(profileId, '2026-10-02', '2026-10-02T08:00:00.000Z', 'Etc/UTC');
  assert.equal(await pending(database, 'dressing_day_departures'), 1);
  await database.runAsync('UPDATE dressing_day_departures SET pending_sync = 0');
  await repository.upsert(profileId, '2026-10-02', '2026-10-02T09:00:00.000Z', 'Etc/UTC');
  assert.equal(await pending(database, 'dressing_day_departures'), 1);
  await database.runAsync('UPDATE dressing_day_departures SET pending_sync = 0');
  assert.equal(await repository.clear(profileId, '2026-10-02'), true);
  assert.equal(await pending(database, 'dressing_day_departures'), 1);
});

test('History marks a new look and its soft delete, and the same look again writes nothing', async (t) => {
  const database = await setup(t);
  await insertProfile(database);
  const photos = { resolveUri: () => null, deleteStored: async () => {} };
  const ids = [dayId, '5c7e9a1b-3d5f-4a7b-9c1d-2e3f4a5b6c7d'];
  const repository = new SqliteOutfitHistoryRepository(database, () => ids.shift(), () => now, photos);
  const flags = async () => (await database.getAllAsync('SELECT id, pending_sync FROM outfit_history ORDER BY rowid'))
    .map(({ id, pending_sync: flag }) => [id, flag]);
  const outfit = { garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
    archetypeId: 'everyday_easy', formality: 'casual', source: 'recommended' };
  const morning = await repository.log(profileId, '2026-10-02', outfit, { kind: 'keep' }, null);
  assert.deepEqual(await flags(), [[dayId, 1]]);
  await database.runAsync('UPDATE outfit_history SET pending_sync = 0');
  await repository.log(profileId, '2026-10-02', outfit, { kind: 'keep' }, null);
  assert.deepEqual(await flags(), [[dayId, 0]]);
  const evening = await repository.log(profileId, '2026-10-02',
    { ...outfit, garments: { ...outfit.garments, primary_top: 'shirt' } }, { kind: 'keep' }, null);
  assert.deepEqual(await flags(), [[dayId, 0], [evening.id, 1]]);
  await database.runAsync('UPDATE outfit_history SET pending_sync = 0');
  assert.equal(await repository.softDelete(profileId, morning.id), true);
  assert.deepEqual(await flags(), [[dayId, 1], [evening.id, 0]]);
});
