import assert from 'node:assert/strict';
import test from 'node:test';

import { stamp, wardrobeItem } from '../__tests__/account-fixtures.mjs';

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

test('a profile lands its display name as the account holds it, gender and dress style only as a value, the consent fields only with the consent', async () => {
  const { profileFieldsToLand, profileWithinConsent } = await import('./account-rows.ts');
  const { syncedProfile } = await import('../__tests__/account-fixtures.mjs');
  // A name cleared on another phone clears here; a missing gender or dress style never clears the
  // phone's, because product logic needs both.
  assert.deepEqual(profileFieldsToLand(syncedProfile({ displayName: null, gender: null, dressStyle: null, styleAesthetics: [] })),
    { displayName: null, styleAesthetics: [] });
  assert.deepEqual(profileFieldsToLand(syncedProfile()),
    { displayName: 'Ada', gender: 'woman', dressStyle: 'smart', styleAesthetics: ['classic', 'minimal'] });
  // Without the consent neither consent field crosses, whatever the account holds.
  assert.deepEqual(profileFieldsToLand(profileWithinConsent(syncedProfile(), false)), { displayName: 'Ada', gender: 'woman' });
  assert.deepEqual(profileFieldsToLand(profileWithinConsent(syncedProfile(), true)),
    { displayName: 'Ada', gender: 'woman', dressStyle: 'smart', styleAesthetics: ['classic', 'minimal'] });
});
