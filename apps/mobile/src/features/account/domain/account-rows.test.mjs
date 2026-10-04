import assert from 'node:assert/strict';
import test from 'node:test';

import { landedOutfitHistory, landedWardrobeItem, syncedProfileOf } from './account-rows.ts';
import { historyDay, phoneProfileId, stamp, wardrobeItem } from '../__tests__/account-fixtures.mjs';

test('only the four synced profile fields leave the profile, aesthetics sorted', () => {
  const profile = {
    id: phoneProfileId, gender: 'man', dressStyle: 'formal', styleAesthetics: ['sporty', 'classic'],
    birthDate: '1990-05-06', displayName: 'Ada', namePromptVersion: 1, languagePreference: 'tr',
    themePreference: 'dark', onboardingCompleted: true, notificationsOptIn: true,
    weatherAlertOfferShown: true, morningBriefingOptIn: true, analyticsConsent: 'granted',
    createdAt: stamp(0), updatedAt: stamp(3),
  };
  assert.deepEqual(syncedProfileOf(profile), {
    displayName: 'Ada', gender: 'man', dressStyle: 'formal', styleAesthetics: ['classic', 'sporty'],
    createdAt: stamp(0), updatedAt: stamp(3),
  });
});

test('a pulled Closet row lands with this phone\'s own photo, never the account\'s', () => {
  const pulled = wardrobeItem(1, { photoRelativePath: null, name: 'From the account' });
  const local = wardrobeItem(1, { photoRelativePath: 'wardrobe/mine.jpg', name: 'On the phone' });
  assert.equal(landedWardrobeItem(pulled, local).photoRelativePath, 'wardrobe/mine.jpg');
  assert.equal(landedWardrobeItem(pulled, local).name, 'From the account');
  assert.equal(landedWardrobeItem(pulled, null).photoRelativePath, null);
});

test('a pulled History day lands with this phone\'s mirror photo, whichever row held it', () => {
  const pulled = historyDay(2, '2026-09-10', { photoPath: null });
  const local = historyDay(3, '2026-09-10', { photoPath: 'history/mine.jpg' });
  assert.equal(landedOutfitHistory(pulled, local).photoPath, 'history/mine.jpg');
  assert.equal(landedOutfitHistory(pulled, local).id, pulled.id);
  assert.equal(landedOutfitHistory(pulled, null).photoPath, null);
});

test('a deletion marker lands as the phone\'s own row soft-deleted, and is dropped when the phone holds none', async () => {
  const { landDeletionMarkers } = await import('./account-rows.ts');
  const marker = { kind: 'deletionMarker', id: wardrobeItem(1).id, createdAt: stamp(0), updatedAt: stamp(7), deletedAt: stamp(7) };
  const own = wardrobeItem(1, { name: 'Kept on the phone' });
  const live = wardrobeItem(2);
  assert.deepEqual(landDeletionMarkers([marker, live, { ...marker, id: wardrobeItem(3).id }], [own], 'id'), [
    { ...own, updatedAt: stamp(7), deletedAt: stamp(7) },
    live,
  ]);
});

test('a day-keyed marker lands on the phone\'s row of that day and the phone adopts the account\'s id', async () => {
  const { landDeletionMarkers } = await import('./account-rows.ts');
  const { dayChoice, uuid } = await import('../__tests__/account-fixtures.mjs');
  const own = dayChoice(1, '2026-09-10');
  const marker = { kind: 'deletionMarker', id: uuid(9), dayKey: '2026-09-10', createdAt: stamp(3), updatedAt: stamp(8), deletedAt: stamp(8) };
  assert.deepEqual(landDeletionMarkers([marker], [own], 'day'), [
    { ...own, id: uuid(9), createdAt: stamp(3), updatedAt: stamp(8), deletedAt: stamp(8) },
  ]);
  assert.deepEqual(landDeletionMarkers([marker], [dayChoice(1, '2026-09-11')], 'day'), []);
});
