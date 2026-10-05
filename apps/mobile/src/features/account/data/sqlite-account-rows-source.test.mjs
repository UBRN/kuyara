import assert from 'node:assert/strict';
import test from 'node:test';

import { createSqliteAccountRowsSource } from './sqlite-account-rows-source.ts';
import { connectAccountLifecycle } from '../application/account-lifecycle.ts';
import { accountScenarios, createInMemoryAccountScreens } from '../application/account-screens.ts';
import { createAccountSyncFlow } from '../application/account-sync.ts';
import { mergeAtFirstLink } from '../domain/account-merge.ts';
import { unlinked } from '../domain/account-link.ts';
import { pullCursorAt } from '../domain/sync-rules.ts';
import { migrateDatabase } from '../../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import { dayChoice, departure, historyDay, stamp, syncedProfile, uuid, wardrobeItem } from '../__tests__/account-fixtures.mjs';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
const noCursor = pullCursorAt(null);
const none = { profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] };
const mine = (row) => ({ ...row, localProfileId: profileId });

async function setup(t) {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  await database.runAsync(`INSERT INTO local_profiles (singleton_key, id, gender, dress_style, style_aesthetics,
    birth_date, display_name, language_preference, theme_preference, onboarding_completed, created_at, updated_at)
    VALUES (1, ?, 'woman', 'casual', '["minimal"]', '1990-05-06', 'Phone', 'tr', 'dark', 1, ?, ?)`,
  [profileId, stamp(0), stamp(1)]);
  return { database, source: createSqliteAccountRowsSource(database) };
}

const flag = async (database, table, where = '1 = 1', params = []) =>
  (await database.getAllAsync(`SELECT pending_sync FROM ${table} WHERE ${where}`, params)).map((row) => row.pending_sync);

test('read returns every row of the five tables, soft-deleted ones too, with its pending flag', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({
    profile: null,
    wardrobeItems: [mine(wardrobeItem(1, { photoRelativePath: null })), mine(wardrobeItem(2, { deletedAt: stamp(3), updatedAt: stamp(3) }))],
    dressingDayChoices: [mine(dayChoice(3, '2026-09-10'))],
    dressingDayDepartures: [mine(departure(4, '2026-09-10'))],
    outfitHistory: [mine(historyDay(5, '2026-09-10', { photoPath: null }))],
  }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1 WHERE id = ?', [uuid(2)]);
  const rows = await source.read();
  assert.deepEqual(rows.profile, { row: { displayName: 'Phone', gender: 'woman', dressStyle: 'casual',
    styleAesthetics: ['minimal'], createdAt: stamp(0), updatedAt: stamp(1) }, pendingSync: false });
  assert.deepEqual(rows.wardrobeItems.map(({ row, pendingSync }) => [row.id, row.deletedAt, pendingSync]),
    [[uuid(1), null, false], [uuid(2), stamp(3), true]]);
  assert.deepEqual(rows.dressingDayChoices.map(({ row }) => row), [mine(dayChoice(3, '2026-09-10'))]);
  assert.deepEqual(rows.dressingDayDepartures.map(({ row }) => row), [mine(departure(4, '2026-09-10'))]);
  assert.deepEqual(rows.outfitHistory.map(({ row }) => row), [mine(historyDay(5, '2026-09-10', { photoPath: null }))]);
});

// The Closet shows a piece whose colour choice disagrees with its family (the phone drops the
// choice), but the account reads that row strictly: it stays on the phone and out of the push
// until it is edited, so the account is never sent a colour it would refuse.
test('a wardrobe row whose colour columns disagree is left out of what the account reads', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1)), mine(wardrobeItem(2))] }, noCursor);
  await database.runAsync(`UPDATE wardrobe_items SET color_family = 'black' WHERE id = ?`, [uuid(2)]);

  const rows = await source.read();

  assert.deepEqual(rows.wardrobeItems.map(({ row }) => row.id), [uuid(1)]);
});

test('a pull lands settled rows only, under this phone\'s profile, never touching photos or pending rows', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1)), mine(wardrobeItem(2))] }, noCursor);
  await database.runAsync(`UPDATE wardrobe_items SET photo_relative_path = 'kuyara/wardrobe/photos/mine.jpg' WHERE id = ?`, [uuid(1)]);
  await database.runAsync(`UPDATE wardrobe_items SET name = 'Edited here', pending_sync = 1 WHERE id = ?`, [uuid(2)]);

  await source.writePulled({ ...none, wardrobeItems: [
    { ...wardrobeItem(1, { name: 'From the account', localProfileId: 'another-phone', photoRelativePath: 'theirs.jpg' }) },
    wardrobeItem(2, { name: 'Lost race' }),
    wardrobeItem(3, { localProfileId: 'another-phone', photoRelativePath: 'theirs.jpg' }),
  ] }, pullCursorAt('2026-10-01T00:00:00.000001Z'));

  const rows = await database.getAllAsync('SELECT id, name, local_profile_id, photo_relative_path, pending_sync FROM wardrobe_items ORDER BY id');
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: uuid(1), name: 'From the account', local_profile_id: profileId, photo_relative_path: 'kuyara/wardrobe/photos/mine.jpg', pending_sync: 0 },
    { id: uuid(2), name: 'Edited here', local_profile_id: profileId, photo_relative_path: null, pending_sync: 1 },
    { id: uuid(3), name: 'Linen shirt', local_profile_id: profileId, photo_relative_path: null, pending_sync: 0 },
  ]);
  assert.deepEqual((await source.link()).cursor, pullCursorAt('2026-10-01T00:00:00.000001Z'));
});

test('a pulled day-keyed row overwrites the phone\'s day and the phone adopts the account\'s id', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, dressingDayChoices: [mine(dayChoice(1, '2026-09-10', { formality: 'casual' }))] }, noCursor);
  await source.writePulled({ ...none, dressingDayChoices: [mine(dayChoice(9, '2026-09-10', { formality: 'formal' }))] }, noCursor);
  const rows = await database.getAllAsync('SELECT id, day_key, formality FROM dressing_day_choices');
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ id: uuid(9), day_key: '2026-09-10', formality: 'formal' }]);
});

test('a landed deletion keeps the phone\'s own content and photo, so the Closet cleanup removes the photo', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))] }, noCursor);
  await database.runAsync(`UPDATE wardrobe_items SET photo_relative_path = 'kuyara/wardrobe/photos/a.jpg' WHERE id = ?`, [uuid(1)]);
  const [{ row: own }] = (await source.read()).wardrobeItems;
  await source.writePulled({ ...none, wardrobeItems: [{ ...own, updatedAt: stamp(8), deletedAt: stamp(8) }] }, noCursor);
  const row = await database.getFirstAsync('SELECT name, deleted_at, photo_relative_path, pending_sync FROM wardrobe_items');
  assert.deepEqual({ ...row }, { name: 'Linen shirt', deleted_at: stamp(8), photo_relative_path: 'kuyara/wardrobe/photos/a.jpg', pending_sync: 0 });
});

test('a pulled profile writes the synced fields only, never clears gender or dress style, and waits for a pending edit', async (t) => {
  const { database, source } = await setup(t);
  const select = 'SELECT display_name, gender, dress_style, style_aesthetics, birth_date, language_preference FROM local_profiles';
  await source.writePulled({ ...none, profile: { displayName: 'Account', gender: 'man', createdAt: stamp(0), updatedAt: stamp(5) } }, noCursor);
  assert.deepEqual({ ...await database.getFirstAsync(select) }, {
    display_name: 'Account', gender: 'man', dress_style: 'casual', style_aesthetics: '["minimal"]',
    birth_date: '1990-05-06', language_preference: 'tr',
  });
  await source.writePulled({ ...none, profile: syncedProfile({ gender: null, dressStyle: null, styleAesthetics: ['sporty', 'classic'] }) }, noCursor);
  assert.deepEqual({ ...await database.getFirstAsync(select) }, {
    display_name: 'Ada', gender: 'man', dress_style: 'casual', style_aesthetics: '["classic","sporty"]',
    birth_date: '1990-05-06', language_preference: 'tr',
  });
  await database.runAsync(`UPDATE local_profiles SET display_name = 'Mine', pending_sync = 1`);
  await source.writePulled({ ...none, profile: syncedProfile() }, noCursor);
  assert.equal((await database.getFirstAsync(select)).display_name, 'Mine');
});

test('a first link writes the account\'s winners over the pending rows it read, marks what goes, and saves the link in one transaction', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1, { name: 'Phone copy' })), mine(wardrobeItem(2))] }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  const local = await source.read();
  const values = (rows) => ({ ...none, profile: rows.profile?.row ?? null, wardrobeItems: rows.wardrobeItems.map(({ row }) => row) });
  const merge = mergeAtFirstLink(values(local), {
    ...none, profile: syncedProfile({ displayName: 'Account' }), wardrobeItems: [wardrobeItem(1, { name: 'Account copy' })],
  }, { syncConsent: true, now: stamp(10) });
  const link = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a',
    recordsConsentRecordedAt: '2026-09-30T00:00:00.000001Z', cursor: pullCursorAt('2026-10-01T00:00:00.000000Z') };
  await source.applyFirstLink(merge, link, values(local));
  const rows = await database.getAllAsync('SELECT id, name, pending_sync FROM wardrobe_items ORDER BY id');
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: uuid(1), name: 'Account copy', pending_sync: 0 },
    { id: uuid(2), name: 'Linen shirt', pending_sync: 1 },
  ]);
  assert.equal((await database.getFirstAsync('SELECT display_name FROM local_profiles')).display_name, 'Account');
  assert.deepEqual(await source.link(), link);
});

test('a first link leaves the flag of a row written after the merge read it, and settles the rows it read', async (t) => {
  const { database, source } = await setup(t);
  const old = '2026-08-20T12:00:00.000Z';
  await source.writePulled({ ...none,
    wardrobeItems: [mine(wardrobeItem(1, { deletedAt: old, updatedAt: old })), mine(wardrobeItem(2)), mine(wardrobeItem(4))],
    dressingDayChoices: [mine(dayChoice(3, '2026-09-10'))],
  }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  await database.runAsync('UPDATE dressing_day_choices SET pending_sync = 1');
  const read = await source.read();
  const input = { ...none, wardrobeItems: read.wardrobeItems.map(({ row }) => row), dressingDayChoices: read.dressingDayChoices.map(({ row }) => row) };
  const merge = mergeAtFirstLink(input, none, { syncConsent: true, now: '2026-10-04T12:00:00.000Z' });
  assert.deepEqual(merge.sendToAccount.wardrobeItems.map((row) => row.id), [uuid(2), uuid(4)]);
  // The pull was running: an edit of item 4, a day choice rewritten and a new item land after the read.
  await database.runAsync('UPDATE wardrobe_items SET name = ?, updated_at = ? WHERE id = ?', ['Edited', stamp(9), uuid(4)]);
  await database.runAsync('UPDATE dressing_day_choices SET formality = ?, updated_at = ? WHERE day_key = ?', ['formal', stamp(9), '2026-09-10']);
  await database.runAsync(`INSERT INTO wardrobe_items (id, local_profile_id, name, category, entry_state, garment_type_id,
    created_at, updated_at, pending_sync) VALUES (?, ?, 'Fresh', 'top', 'owned', 'tshirt', ?, ?, 1)`, [uuid(7), profileId, stamp(9), stamp(9)]);
  await source.applyFirstLink(merge, unlinked, input);
  assert.deepEqual(await database.getAllAsync('SELECT id, pending_sync FROM wardrobe_items ORDER BY id').then((rows) => rows.map((row) => ({ ...row }))), [
    { id: uuid(1), pending_sync: 0 }, { id: uuid(2), pending_sync: 1 }, { id: uuid(4), pending_sync: 1 }, { id: uuid(7), pending_sync: 1 },
  ]);
  assert.deepEqual(await flag(database, 'dressing_day_choices'), [1]);
});

test('a first link keeps an edit made while the account downloads: the row stays the phone\'s and waits to upload', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1, { name: 'Phone copy' })), mine(wardrobeItem(2))] }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  await database.runAsync('UPDATE local_profiles SET pending_sync = 1');
  const uploads = [];
  const remote = {
    async pullSnapshot() {
      // The person renames a piece and themselves while the account downloads.
      await database.runAsync('UPDATE wardrobe_items SET name = ?, updated_at = ?, pending_sync = 1 WHERE id = ?',
        ['Edited during the link', stamp(9), uuid(1)]);
      await database.runAsync('UPDATE local_profiles SET display_name = ?, updated_at = ?, pending_sync = 1', ['Edited', stamp(9)]);
      return { rows: { ...none, profile: syncedProfile({ displayName: 'Account' }),
        wardrobeItems: [wardrobeItem(1, { name: 'Account copy' }), wardrobeItem(2, { name: 'Account two' })] }, cursor: noCursor };
    },
    upload: async (_user, sent) => { uploads.push(sent); return sent; },
    pull: async () => ({ ...none, arrivals: [] }),
  };

  await createAccountSyncFlow(source, remote, () => stamp(10)).firstLink('user-a', true);

  const rows = await database.getAllAsync('SELECT id, name, pending_sync FROM wardrobe_items ORDER BY id');
  assert.deepEqual(rows.map((row) => ({ ...row })), [
    { id: uuid(1), name: 'Edited during the link', pending_sync: 1 },
    { id: uuid(2), name: 'Account two', pending_sync: 0 },
  ]);
  const profile = await database.getFirstAsync('SELECT display_name, pending_sync FROM local_profiles');
  assert.deepEqual({ ...profile }, { display_name: 'Edited', pending_sync: 1 });
  // The edits go with the next pass, so their later arrival wins on the account.
  const waiting = await source.read();
  assert.equal(await source.hasPending(true), true);
  assert.deepEqual(waiting.wardrobeItems.filter(({ pendingSync }) => pendingSync).map(({ row }) => row.name), ['Edited during the link']);
});

/** The database with every transaction `runAsync` whose SQL `fails` matches rejecting as a full disk would. */
function failingWrites(database, fails) {
  return new Proxy(database, {
    get(target, name) {
      if (name === 'withExclusiveTransactionAsync') {
        return (task) => target.withExclusiveTransactionAsync((transaction) => task({
          ...transaction,
          getFirstAsync: transaction.getFirstAsync.bind(transaction),
          getAllAsync: transaction.getAllAsync.bind(transaction),
          execAsync: transaction.execAsync.bind(transaction),
          runAsync: (sql, params) => (fails(sql)
            ? Promise.reject(new Error('disk full')) : transaction.runAsync(sql, params)),
        }));
      }
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('a first link that fails part way leaves the phone and the link as they were', async (t) => {
  const { database } = await setup(t);
  const failing = failingWrites(database, (sql) => sql.includes('device_account_link'));
  const source = createSqliteAccountRowsSource(failing);
  const merge = mergeAtFirstLink(none, { ...none, profile: syncedProfile({ displayName: 'Account' }), wardrobeItems: [wardrobeItem(1)] },
    { syncConsent: true, now: stamp(10) });
  await assert.rejects(source.applyFirstLink(merge, { ...unlinked, userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a' }, none));
  assert.equal((await database.getFirstAsync('SELECT count(*) AS n FROM wardrobe_items')).n, 0);
  assert.equal((await database.getFirstAsync('SELECT display_name FROM local_profiles')).display_name, 'Phone');
  assert.deepEqual(await source.link(), unlinked);
});

test('a pulled row that fails to write for any reason but a constraint fails the pull and keeps the cursor', async (t) => {
  const { database } = await setup(t);
  await createSqliteAccountRowsSource(database).saveLink({ ...unlinked, userId: 'user-a', lastUserId: 'user-a', cursor: pullCursorAt('2026-10-01T00:00:00.000001Z') });
  const source = createSqliteAccountRowsSource(failingWrites(database, (sql) => sql.includes('wardrobe_items')));
  await assert.rejects(source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))] }, pullCursorAt('2026-10-02T00:00:00.000001Z')), /disk full/);
  assert.deepEqual((await source.link()).cursor, pullCursorAt('2026-10-01T00:00:00.000001Z'));
  assert.equal((await database.getFirstAsync('SELECT count(*) AS n FROM wardrobe_items')).n, 0);
});

test('a pulled row this build\'s constraints refuse is skipped, the rest land and the cursor moves on', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [
    mine(wardrobeItem(1)), mine(wardrobeItem(2, { colorFamily: 'not-a-family' })), mine(wardrobeItem(3)),
  ] }, pullCursorAt('2026-10-02T00:00:00.000001Z'));
  const ids = await database.getAllAsync('SELECT id FROM wardrobe_items ORDER BY id');
  assert.deepEqual(ids.map(({ id }) => id), [uuid(1), uuid(3)]);
  assert.deepEqual((await source.link()).cursor, pullCursorAt('2026-10-02T00:00:00.000001Z'));
});

test('an acknowledged upload clears a flag only while the row still holds the version sent', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none,
    wardrobeItems: [mine(wardrobeItem(1)), mine(wardrobeItem(2))],
    dressingDayChoices: [mine(dayChoice(3, '2026-09-10'))],
  }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  await database.runAsync('UPDATE dressing_day_choices SET pending_sync = 1');
  await database.runAsync('UPDATE local_profiles SET pending_sync = 1');
  const sent = await source.read();
  // Edited while the upload was in flight: a newer version that must still go.
  await database.runAsync(`UPDATE wardrobe_items SET name = 'Newer', updated_at = ? WHERE id = ?`, [stamp(30), uuid(2)]);
  await source.clearPendingIfUnchanged({
    profile: sent.profile.row,
    wardrobeItems: sent.wardrobeItems.map(({ row }) => row),
    // The account holds the day under another id; the day and version still match.
    dressingDayChoices: sent.dressingDayChoices.map(({ row }) => ({ ...row, id: uuid(99) })),
    dressingDayDepartures: [],
    outfitHistory: [],
  });
  assert.deepEqual(await flag(database, 'wardrobe_items', '1 = 1 ORDER BY id'), [0, 1]);
  assert.deepEqual(await flag(database, 'dressing_day_choices'), [0]);
  assert.deepEqual(await flag(database, 'local_profiles'), [0]);
});

test('the link keeps all five values, and deletion clears it and every flag but keeps the card dismissal', async (t) => {
  const { database, source } = await setup(t);
  const link = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-b',
    recordsConsentRecordedAt: '2026-09-30T00:00:00.000001Z', cursor: pullCursorAt('2026-10-01T00:00:00.000000Z') };
  await source.saveLink(link);
  assert.deepEqual(await source.link(), link);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))] }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  await database.runAsync('UPDATE local_profiles SET pending_sync = 1');
  await source.dismissCard();
  assert.equal(await source.hasPending(false), true);
  await source.resetAfterDeletion();
  assert.deepEqual(await source.link(), unlinked);
  assert.equal(await source.hasPending(true), false);
  assert.equal(await source.cardDismissed(), true);
  assert.equal((await database.getFirstAsync('SELECT count(*) AS n FROM wardrobe_items')).n, 1);
});

test('each table keeps its own pull position, and a single position an older build stored reads as every table\'s', async (t) => {
  const { database, source } = await setup(t);
  const old = '2026-10-01T00:00:00.000001Z';
  await database.runAsync('UPDATE device_account_link SET linked_user_id = ?, last_pull_cursor = ? WHERE singleton_key = 1', ['user-a', old]);
  assert.deepEqual(await source.link(), { ...unlinked, userId: 'user-a', cursor: pullCursorAt(old) });

  const next = { ...pullCursorAt(old), outfitHistory: '2026-10-02T00:00:00.000002Z', profile: null };
  await source.writePulled(none, next);
  assert.deepEqual((await source.link()).cursor, next);

  // A value this build cannot read is no position: the next pull reads every row again.
  await database.runAsync(`UPDATE device_account_link SET last_pull_cursor = '{"wardrobeItems":1}' WHERE singleton_key = 1`);
  assert.deepEqual((await source.link()).cursor, noCursor);
});

test('without the consent only the profile counts as waiting', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))] }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  assert.equal(await source.hasPending(false), false);
  assert.equal(await source.hasPending(true), true);
});

test('no row the sync writes carries a device-only column from the account', async (t) => {
  const { database, source } = await setup(t);
  await source.writePulled({ ...none, outfitHistory: [historyDay(1, '2026-09-10', { localProfileId: 'x', photoPath: 'history/theirs.jpg' })] }, noCursor);
  const row = await database.getFirstAsync('SELECT local_profile_id, photo_path, pending_sync FROM outfit_history');
  assert.deepEqual({ ...row }, { local_profile_id: profileId, photo_path: null, pending_sync: 0 });
});

test('on a build 17 database upgraded to the latest schema the source reads the old rows and keeps the whole link', async (t) => {
  const { readFile } = await import('node:fs/promises');
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await database.execAsync(await readFile(new URL('../../../infrastructure/sqlite/build-17-schema-23.sql', import.meta.url), 'utf8'));
  await database.execAsync(`
    INSERT INTO local_profiles (singleton_key, id, gender, dress_style, language_preference, theme_preference,
      onboarding_completed, created_at, updated_at)
      VALUES (1, '${profileId}', 'man', 'smart', 'tr', 'dark', 1, '${stamp(0)}', '${stamp(1)}');
    INSERT INTO wardrobe_items (id, local_profile_id, category, entry_state, created_at, updated_at)
      VALUES ('${uuid(1)}', '${profileId}', 'top', 'owned', '${stamp(0)}', '${stamp(1)}');
  `);
  await migrateDatabase(database);
  const source = createSqliteAccountRowsSource(database);
  assert.deepEqual(await source.link(), unlinked);
  const rows = await source.read();
  assert.deepEqual(rows.wardrobeItems.map(({ row, pendingSync }) => [row.id, row.category, pendingSync]), [[uuid(1), 'top', false]]);
  assert.equal(rows.profile.row.dressStyle, 'smart');
  const link = { userId: null, lastUserId: 'user-a', recordsUserId: 'user-a',
    recordsConsentRecordedAt: '2026-09-30T00:00:00.000001Z', cursor: pullCursorAt('2026-10-01T00:00:00.000000Z') };
  await source.saveLink(link);
  assert.deepEqual(await source.link(), link);
});

test('a pending row this build cannot read is not waiting, so a write never starts a pass that would send nothing', async (t) => {
  const { database, source } = await setup(t);
  // An id that is no UUID: the row stays on the phone, and read leaves it out of sync.
  await database.runAsync(`INSERT INTO wardrobe_items (id, local_profile_id, category, entry_state, created_at, updated_at, pending_sync)
    VALUES ('not-a-uuid', ?, 'top', 'owned', ?, ?, 1)`, [profileId, stamp(0), stamp(1)]);
  assert.deepEqual((await source.read()).wardrobeItems, []);
  assert.equal(await source.hasPending(true), false);

  // The lifecycle asks after the write and never runs a pass for it.
  let passes = 0;
  const timers = [];
  const screens = createInMemoryAccountScreens(accountScenarios.upToDate);
  const disconnect = connectAccountLifecycle({
    manager: { ...screens, start: async () => {}, foreground: async () => {}, localWrite: async () => { passes += 1; }, setOnline: () => {} },
    onAppStateChange: () => () => {},
    isActive: () => false,
    onDatabaseWrite: (listener) => { timers.push(listener); return () => {}; },
    onAppleRevoked: () => () => {},
    hasPending: source.hasPending,
    autoRefresh: { start: () => {}, stop: () => {} },
    card: { dismissed: async () => false, dismiss: async () => {} },
    network: { current: async () => true, onChange: () => () => {} },
    schedule: (task) => { timers.push(task); return () => {}; },
  });
  t.after(disconnect);
  const write = timers.shift();
  write();
  await timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(passes, 0);
});

/** The source over a database that records which writes tell the database write listeners. */
function loudness(database) {
  const loud = [];
  const spy = new Proxy(database, {
    get(target, name) {
      if (name === 'withExclusiveTransactionAsync') {
        return (task, options) => {
          if (options?.notifyWrites !== false) loud.push('transaction');
          return target.withExclusiveTransactionAsync(task, options);
        };
      }
      if (name === 'runAsync' || name === 'execAsync') {
        return (...args) => { loud.push(name); return target[name](...args); };
      }
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { loud, source: createSqliteAccountRowsSource(spy) };
}

test('sync\'s bookkeeping, and a pull or first link that lands nothing, tells no database write listener', async (t) => {
  const { database } = await setup(t);
  const { loud, source } = loudness(database);
  const rows = { ...none, wardrobeItems: [mine(wardrobeItem(1))] };
  await source.writePulled(none, pullCursorAt('2026-10-01T00:00:00.000001Z'));
  await source.applyFirstLink(mergeAtFirstLink(rows, none, { syncConsent: true, now: stamp(10) }), unlinked, rows);
  await source.clearPendingIfUnchanged(rows);
  await source.saveLink(unlinked);
  await source.dismissCard();
  await source.resetAfterDeletion();
  assert.deepEqual(loud, []);
});

test('a pull or first link that lands account rows tells the listeners once, so Closet, History and Profile read again', async (t) => {
  const { database } = await setup(t);
  const { loud, source } = loudness(database);
  const rows = { ...none, wardrobeItems: [mine(wardrobeItem(1))] };
  await source.writePulled(rows, pullCursorAt('2026-10-01T00:00:00.000001Z'));
  assert.deepEqual(loud, ['transaction']);
  await source.applyFirstLink(mergeAtFirstLink(none, { ...none, outfitHistory: [mine(historyDay(2, '2026-09-10'))] },
    { syncConsent: true, now: stamp(10) }), unlinked, none);
  assert.deepEqual(loud, ['transaction', 'transaction']);
});

test('the lifecycle starts no pass for a landed pull: a pulled row is settled, not waiting', async (t) => {
  const { database } = await setup(t);
  const listeners = new Set();
  const notifying = new Proxy(database, {
    get(target, name) {
      if (name === 'withExclusiveTransactionAsync') {
        return async (task, options) => {
          await target.withExclusiveTransactionAsync(task, options);
          if (options?.notifyWrites !== false) listeners.forEach((listener) => listener());
        };
      }
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const source = createSqliteAccountRowsSource(notifying);
  let passes = 0;
  const timers = [];
  const screens = createInMemoryAccountScreens(accountScenarios.upToDate);
  const disconnect = connectAccountLifecycle({
    manager: { ...screens, start: async () => {}, foreground: async () => {}, localWrite: async () => { passes += 1; }, setOnline: () => {} },
    onAppStateChange: () => () => {},
    isActive: () => false,
    onDatabaseWrite: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    onAppleRevoked: () => () => {},
    hasPending: source.hasPending,
    autoRefresh: { start: () => {}, stop: () => {} },
    card: { dismissed: async () => false, dismiss: async () => {} },
    network: { current: async () => true, onChange: () => () => {} },
    schedule: (task) => { timers.push(task); return () => {}; },
  });
  t.after(disconnect);
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))], outfitHistory: [mine(historyDay(2, '2026-09-10'))] },
    '2026-10-01T00:00:00.000001Z');
  assert.equal(timers.length, 1);
  await timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(passes, 0);
});

test('a pulled deletion keeps naming the phone\'s photo, so the Closet and History photo cleanups remove the file', async (t) => {
  const { database, source } = await setup(t);
  const wardrobePhoto = `kuyara/wardrobe/photos/${uuid(7)}.jpg`;
  const historyPhoto = `kuyara/history/photos/${uuid(8)}.jpg`;
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1))], outfitHistory: [mine(historyDay(2, '2026-09-10'))] }, noCursor);
  await database.runAsync('UPDATE wardrobe_items SET photo_relative_path = ? WHERE id = ?', [wardrobePhoto, uuid(1)]);
  await database.runAsync('UPDATE outfit_history SET photo_path = ? WHERE id = ?', [historyPhoto, uuid(2)]);

  // Another phone deleted both; the account's markers carry no content and no photo.
  await source.writePulled({
    ...none,
    wardrobeItems: [mine(wardrobeItem(1, { deletedAt: stamp(5), updatedAt: stamp(5), photoRelativePath: null }))],
    outfitHistory: [mine(historyDay(2, '2026-09-10', { deletedAt: stamp(5), updatedAt: stamp(5), photoPath: null }))],
  }, pullCursorAt('2026-10-01T00:00:00.000001Z'));

  const { SqliteWardrobeLocalDataSource } = await import('../../wardrobe/data/sqlite-wardrobe-local-data-source.ts');
  const pendingPieces = await new SqliteWardrobeLocalDataSource(database).listPendingPhotoCleanup(profileId);
  assert.deepEqual(pendingPieces.map(({ id, photoRelativePath }) => [id, photoRelativePath]), [[uuid(1), wardrobePhoto]]);

  const { SqliteOutfitHistoryRepository } = await import('../../recommendation/data/sqlite-outfit-history-repository.ts');
  const deleted = [];
  const photos = { deleteStored: async (path) => { deleted.push(path); }, copyStaged: async () => '', discardStaged: async () => {} };
  const history = new SqliteOutfitHistoryRepository(database, () => uuid(9), () => stamp(9), photos);
  await history.cleanupPendingPhotos(profileId);
  assert.deepEqual(deleted, [historyPhoto]);
  assert.deepEqual((await database.getAllAsync('SELECT photo_path FROM outfit_history')).map((row) => row.photo_path), [null]);
});

test('a first link uploads only what the merge sends and settles a deletion older than the marker window', async (t) => {
  const { database, source } = await setup(t);
  const now = '2026-10-04T12:00:00.000Z';
  const old = '2026-08-20T12:00:00.000Z';
  await source.writePulled({ ...none, wardrobeItems: [mine(wardrobeItem(1)), mine(wardrobeItem(2, { deletedAt: old, updatedAt: old }))] }, noCursor);
  // Both were changed on this phone before it had an account, so both wait.
  await database.runAsync('UPDATE wardrobe_items SET pending_sync = 1');
  const uploads = [];
  const remote = {
    pullSnapshot: async () => ({ rows: none, cursor: noCursor }),
    upload: async (_user, sent) => { uploads.push(sent); return sent; },
    pull: async () => ({ ...none, arrivals: [] }),
  };
  const flow = createAccountSyncFlow(source, remote, () => now);
  await flow.firstLink('user-a', true, '2026-10-04T11:00:00.000001Z');
  assert.deepEqual(uploads.map((sent) => sent.wardrobeItems.map(({ id }) => id)), [[uuid(1)]]);
  assert.deepEqual(await flag(database, 'wardrobe_items', '1 = 1 ORDER BY id'), [0, 0]);
  assert.equal(await source.hasPending(true), false);
  await flow.sync('user-a', true);
  assert.equal(uploads.length, 1);
});
