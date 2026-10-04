import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeAtFirstLink } from './account-merge.ts';
import {
  dayChoice, departure, emptyRows, historyDay, stamp, syncedProfile, uuid, wardrobeItem,
} from '../__tests__/account-fixtures.mjs';

const now = '2026-10-01T12:00:00.000Z';
const empty = emptyRows();
const merge = (local, remote, syncConsent = true) => mergeAtFirstLink(
  { ...empty, ...local }, { ...empty, ...remote }, { syncConsent, now },
);
const ids = (rows) => rows.map((row) => row.id);

test('an empty account takes the whole phone and gives nothing back', () => {
  const local = {
    profile: syncedProfile(),
    wardrobeItems: [wardrobeItem(1), wardrobeItem(2, { entryState: 'wanted' })],
    dressingDayChoices: [dayChoice(3, '2026-09-10')],
    dressingDayDepartures: [departure(4, '2026-09-10')],
    outfitHistory: [historyDay(5, '2026-09-10'), historyDay(6, '2026-09-11')],
  };
  const result = merge(local, {});
  assert.deepEqual(result.sendToAccount, local);
  assert.deepEqual(result.writeToPhone, empty);
  assert.deepEqual(result.counts, { piecesAdded: 2, historyDaysAdded: 2, piecesReceived: 0, historyDaysReceived: 0 });
});

test('a phone with nothing takes the whole account, and no photo comes with it', () => {
  const remote = {
    profile: syncedProfile({ displayName: 'From account' }),
    wardrobeItems: [wardrobeItem(1, { photoRelativePath: null })],
    outfitHistory: [historyDay(5, '2026-09-10', { photoPath: null })],
    dressingDayChoices: [dayChoice(3, '2026-09-10')],
    dressingDayDepartures: [departure(4, '2026-09-10')],
  };
  const result = merge({}, remote);
  assert.deepEqual(result.writeToPhone, remote);
  assert.deepEqual(result.sendToAccount, empty);
  assert.deepEqual(result.counts, { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 1, historyDaysReceived: 1 });
});

test('the profile fields come from the account when it has them, else the phone offers its own', () => {
  const account = syncedProfile({ displayName: 'Account name', dressStyle: 'formal' });
  const phone = syncedProfile({ displayName: 'Phone name' });
  const withAccount = merge({ profile: phone }, { profile: account });
  assert.deepEqual(withAccount.writeToPhone.profile, account);
  assert.equal(withAccount.sendToAccount.profile, null);
  assert.equal(withAccount.profileFrom, 'account');
  const without = merge({ profile: phone }, {});
  assert.equal(without.writeToPhone.profile, null);
  assert.deepEqual(without.sendToAccount.profile, phone);
  assert.equal(without.profileFrom, 'phone');
});

test('the same Closet id on both sides: the account copy wins as pulled', () => {
  const local = wardrobeItem(1, { name: 'Phone copy', photoRelativePath: 'wardrobe/mine.jpg' });
  const remote = wardrobeItem(1, { name: 'Account copy', photoRelativePath: null });
  const result = merge({ wardrobeItems: [local] }, { wardrobeItems: [remote] });
  assert.deepEqual(result.writeToPhone.wardrobeItems, [remote]);
  assert.deepEqual(result.sendToAccount.wardrobeItems, []);
  assert.equal(result.counts.piecesAdded, 0);
  assert.equal(result.counts.piecesReceived, 0);
});

test('the same piece added on two phones stays as two rows, never removed', () => {
  const result = merge({ wardrobeItems: [wardrobeItem(1)] }, { wardrobeItems: [wardrobeItem(2, { photoRelativePath: null })] });
  assert.deepEqual(ids(result.sendToAccount.wardrobeItems), [uuid(1)]);
  assert.deepEqual(ids(result.writeToPhone.wardrobeItems), [uuid(2)]);
  assert.deepEqual([result.counts.piecesAdded, result.counts.piecesReceived], [1, 1]);
});

test('an account deletion marker on the same id deletes the phone copy, on an unknown id it is skipped', () => {
  const marker = (n) => wardrobeItem(n, { deletedAt: stamp(9), updatedAt: stamp(9), photoRelativePath: null });
  const result = merge({ wardrobeItems: [wardrobeItem(1)] }, { wardrobeItems: [marker(1), marker(2)] });
  assert.deepEqual(result.writeToPhone.wardrobeItems.map((row) => [row.id, row.deletedAt]), [[uuid(1), stamp(9)]]);
  assert.deepEqual(result.counts, { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 0, historyDaysReceived: 0 });
});

test('looks of one day from both sides stand side by side, and the same look keeps the account copy', () => {
  const mine = historyDay(1, '2026-09-10', { photoPath: 'history/mine.jpg' });
  const shared = historyDay(3, '2026-09-10', { photoPath: 'history/shared.jpg' });
  const theirs = historyDay(2, '2026-09-10', { photoPath: null, outfit: { ...mine.outfit, archetypeId: 'rain_ready' } });
  const accountShared = historyDay(3, '2026-09-10', { photoPath: null, updatedAt: stamp(9) });
  const result = merge({ outfitHistory: [mine, shared] }, { outfitHistory: [theirs, accountShared] });
  assert.deepEqual(result.writeToPhone.outfitHistory, [theirs, accountShared]);
  assert.deepEqual(ids(result.sendToAccount.outfitHistory), [uuid(1)]);
  // Counted in days: both sides already held 10 September.
  assert.deepEqual([result.counts.historyDaysAdded, result.counts.historyDaysReceived], [0, 0]);
});

test('History counts days, not looks, in both directions', () => {
  const result = merge(
    { outfitHistory: [historyDay(1, '2026-09-10'), historyDay(2, '2026-09-10'), historyDay(3, '2026-09-12')] },
    { outfitHistory: [historyDay(4, '2026-09-11', { photoPath: null }), historyDay(5, '2026-09-11', { photoPath: null }),
      historyDay(6, '2026-09-12', { photoPath: null })] },
  );
  assert.deepEqual(ids(result.sendToAccount.outfitHistory), [uuid(1), uuid(2), uuid(3)]);
  assert.deepEqual(ids(result.writeToPhone.outfitHistory), [uuid(4), uuid(5), uuid(6)]);
  assert.deepEqual([result.counts.historyDaysAdded, result.counts.historyDaysReceived], [1, 1]);
});

test('the day rule covers choices and departures, and the evening is its own day', () => {
  const result = merge({
    dressingDayChoices: [dayChoice(1, '2026-09-10'), dayChoice(2, '2026-09-10:evening', { formality: 'casual' })],
    dressingDayDepartures: [departure(3, '2026-09-10')],
  }, {
    dressingDayChoices: [dayChoice(4, '2026-09-10', { formality: 'formal' })],
    dressingDayDepartures: [departure(5, '2026-09-10', { timeZone: 'UTC' })],
  });
  assert.deepEqual(result.writeToPhone.dressingDayChoices.map((row) => [row.id, row.formality]), [[uuid(4), 'formal']]);
  assert.deepEqual(ids(result.sendToAccount.dressingDayChoices), [uuid(2)]);
  assert.deepEqual(ids(result.writeToPhone.dressingDayDepartures), [uuid(5)]);
  assert.deepEqual(result.sendToAccount.dressingDayDepartures, []);
});

test('an account deletion marker for another look leaves the phone\'s look of that day alone', () => {
  const marker = historyDay(2, '2026-09-10', { deletedAt: stamp(9), updatedAt: stamp(9), photoPath: null });
  const result = merge({ outfitHistory: [historyDay(1, '2026-09-10')] }, { outfitHistory: [marker] });
  assert.deepEqual(result.writeToPhone.outfitHistory, []);
  assert.deepEqual(ids(result.sendToAccount.outfitHistory), [uuid(1)]);
  assert.equal(result.counts.historyDaysAdded, 1);
});

test('a live account look of a day the phone holds only a deletion marker for counts as received', () => {
  const marker = historyDay(1, '2026-09-10', { deletedAt: now, updatedAt: now });
  const result = merge({ outfitHistory: [marker] }, { outfitHistory: [historyDay(2, '2026-09-10', { photoPath: null })] });
  assert.deepEqual(ids(result.writeToPhone.outfitHistory), [uuid(2)]);
  assert.deepEqual(ids(result.sendToAccount.outfitHistory), [uuid(1)]);
  assert.equal(result.counts.historyDaysReceived, 1);
  assert.equal(result.counts.historyDaysAdded, 0);
});

test('an account deletion marker on the same look deletes it on the phone', () => {
  const marker = historyDay(1, '2026-09-10', { deletedAt: stamp(9), updatedAt: stamp(9), photoPath: null });
  const result = merge({ outfitHistory: [historyDay(1, '2026-09-10', { photoPath: 'history/mine.jpg' })] },
    { outfitHistory: [marker] });
  assert.deepEqual(result.writeToPhone.outfitHistory, [marker]);
  assert.deepEqual(result.sendToAccount.outfitHistory, []);
  assert.deepEqual([result.counts.historyDaysAdded, result.counts.historyDaysReceived], [0, 0]);
});

test('phone deletion markers go up only when the account holds nothing for that key, and are not counted', () => {
  const marker = (n, dayKey) => historyDay(n, dayKey, { deletedAt: now, updatedAt: now });
  const result = merge(
    { outfitHistory: [marker(1, '2026-09-10'), marker(2, '2026-09-11')] },
    { outfitHistory: [marker(2, '2026-09-11')] },
  );
  assert.deepEqual(ids(result.sendToAccount.outfitHistory), [uuid(1)]);
  assert.equal(result.counts.historyDaysAdded, 0);
});

test('markers older than 30 days stay behind, as in the first upload', () => {
  const old = wardrobeItem(1, { deletedAt: '2026-08-01T00:00:00.000Z' });
  assert.deepEqual(merge({ wardrobeItems: [old] }, {}).sendToAccount.wardrobeItems, []);
});

test('without the sync consent only the profile is merged, in both directions', () => {
  const result = merge(
    { profile: syncedProfile(), wardrobeItems: [wardrobeItem(1)], outfitHistory: [historyDay(2, '2026-09-10')] },
    { wardrobeItems: [wardrobeItem(3)], dressingDayChoices: [dayChoice(4, '2026-09-10')] },
    false,
  );
  const { dressStyle: _style, styleAesthetics: _aesthetics, ...nameAndGender } = syncedProfile();
  assert.deepEqual(result.sendToAccount, { ...empty, profile: nameAndGender });
  assert.deepEqual(result.writeToPhone, empty);
  assert.deepEqual(result.counts, { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 0, historyDaysReceived: 0 });
});

test('without the sync consent the account\'s dress style and style aesthetics never reach the phone', () => {
  const account = syncedProfile({ displayName: 'Account', dressStyle: 'formal', styleAesthetics: ['sporty'] });
  const { dressStyle: _style, styleAesthetics: _aesthetics, ...nameAndGender } = account;
  const result = merge({ profile: syncedProfile() }, { profile: account }, false);
  assert.deepEqual(result.writeToPhone.profile, nameAndGender);
  assert.equal(result.sendToAccount.profile, null);
  assert.equal(result.profileFrom, 'accountNameAndGender');
});

test('an account profile without a dress style takes the phone\'s style instead of clearing it', () => {
  // The profile reached the account without the consent, or a withdrawal emptied its style.
  const account = syncedProfile({ displayName: 'Account', gender: 'man', dressStyle: null, styleAesthetics: [] });
  const phone = syncedProfile({ displayName: 'Phone', dressStyle: 'formal', styleAesthetics: ['classic'] });
  const result = merge({ profile: phone }, { profile: account });
  const { dressStyle: _style, styleAesthetics: _aesthetics, ...nameAndGender } = account;
  assert.deepEqual(result.writeToPhone.profile, nameAndGender);
  assert.deepEqual(result.sendToAccount.profile, { ...phone, displayName: 'Account', gender: 'man' });
  assert.equal(result.profileFrom, 'accountNameAndGender');
});
