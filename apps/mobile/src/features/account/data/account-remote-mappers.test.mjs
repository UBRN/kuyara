import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateDatabase } from '../../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import {
  fromRemoteDressingDayChoice,
  fromRemoteDressingDayDeparture,
  fromRemoteOutfitHistory,
  fromRemoteProfile,
  fromRemoteWardrobeItem,
  toRemoteDressingDayChoice,
  toRemoteDressingDayDeparture,
  toRemoteOutfitHistory,
  toRemoteProfile,
  toRemoteWardrobeItem,
} from './account-remote-mappers.ts';
import {
  dayChoice, departure, historyDay, phoneProfileId, stamp, syncedProfile, uuid, wardrobeItem,
} from '../__tests__/account-fixtures.mjs';

const userId = uuid(900);

// Every column of the five tables is either uploaded under its own name or listed here with the
// reason it stays on the device (the pending flag is the device's own bookkeeping). A new
// column fails the field test until it is classified.
const deviceOnly = {
  local_profiles: [
    'singleton_key', 'id', 'birth_date', 'language_preference', 'theme_preference',
    'onboarding_completed', 'notifications_opt_in', 'analytics_consent',
    'weather_alert_offer_shown', 'morning_briefing_opt_in', 'name_prompt_version',
    'morning_sheet_enabled', 'easier_to_see', 'walkthrough_version', 'swap_hint_shown',
    'pending_sync',
  ],
  wardrobe_items: ['local_profile_id', 'photo_relative_path', 'pending_sync'],
  dressing_day_choices: ['local_profile_id', 'pending_sync'],
  dressing_day_departures: ['local_profile_id', 'pending_sync'],
  outfit_history: ['local_profile_id', 'photo_path', 'pending_sync'],
};

const uploads = {
  local_profiles: () => toRemoteProfile(syncedProfile(), userId),
  wardrobe_items: () => toRemoteWardrobeItem(wardrobeItem(1), userId),
  dressing_day_choices: () => toRemoteDressingDayChoice(dayChoice(2, '2026-09-10'), userId),
  dressing_day_departures: () => toRemoteDressingDayDeparture(departure(3, '2026-09-10'), userId),
  outfit_history: () => toRemoteOutfitHistory(historyDay(4, '2026-09-10'), userId),
};

test('an upload record carries every SQLite column except the listed device-only ones, plus user_id', async () => {
  const database = new NodeSqliteDatabase();
  await migrateDatabase(database);
  for (const [table, upload] of Object.entries(uploads)) {
    const columns = (await database.getAllAsync(`PRAGMA table_info(${table})`)).map((column) => column.name);
    const expected = [...columns.filter((column) => !deviceOnly[table].includes(column)), 'user_id'].sort();
    assert.deepEqual(Object.keys(upload()).sort(), expected, table);
  }
  database.close();
});

test('no device-only value reaches any upload record, by name or by value', () => {
  const secrets = [phoneProfileId, 'wardrobe/photo-1.jpg', 'history/photo-4.jpg', '1990-05-06'];
  const names = ['local_profile_id', 'birth_date', 'photo_relative_path', 'photo_path', 'analytics_consent',
    'notifications_opt_in', 'language_preference', 'theme_preference', 'server_updated_at'];
  for (const [table, upload] of Object.entries(uploads)) {
    const text = JSON.stringify(upload());
    for (const name of names) assert.equal(text.includes(`"${name}"`), false, `${table} carries ${name}`);
    for (const secret of secrets) assert.equal(text.includes(secret), false, `${table} carries ${secret}`);
  }
});

test('the client UUID, day key and clocks upload unchanged, and the aesthetics are sorted', () => {
  const profile = toRemoteProfile(syncedProfile({ styleAesthetics: ['sporty', 'classic'] }), userId);
  assert.deepEqual(profile.style_aesthetics, ['classic', 'sporty']);
  const choice = toRemoteDressingDayChoice(dayChoice(2, '2026-09-10:evening', { styleAesthetics: ['relaxed', 'classic'] }), userId);
  assert.equal(choice.id, uuid(2));
  assert.equal(choice.day_key, '2026-09-10:evening');
  assert.deepEqual(choice.style_aesthetics, ['classic', 'relaxed']);
  assert.equal(choice.updated_at, stamp(1));
  assert.equal(toRemoteDressingDayChoice(dayChoice(2, '2026-09-10', { styleAesthetics: null }), userId).style_aesthetics, null);
});

// A row as the server returns it: the upload record plus the server's own arrival stamp, with
// Postgres-style timestamps.
const arrived = (record, over = {}) => ({ ...record, server_updated_at: '2026-09-30T10:00:00.123456+00:00', ...over });

test('every table round-trips through the account, landing under this phone\'s profile with no photo', () => {
  const cases = [
    [fromRemoteProfile, arrived(toRemoteProfile(syncedProfile(), userId)), syncedProfile()],
    [(row) => fromRemoteWardrobeItem(row, phoneProfileId), arrived(toRemoteWardrobeItem(wardrobeItem(1), userId)),
      wardrobeItem(1, { photoRelativePath: null })],
    [(row) => fromRemoteDressingDayChoice(row, phoneProfileId), arrived(toRemoteDressingDayChoice(dayChoice(2, '2026-09-10'), userId)),
      dayChoice(2, '2026-09-10')],
    [(row) => fromRemoteDressingDayDeparture(row, phoneProfileId), arrived(toRemoteDressingDayDeparture(departure(3, '2026-09-10'), userId)),
      departure(3, '2026-09-10')],
    [(row) => fromRemoteOutfitHistory(row, phoneProfileId), arrived(toRemoteOutfitHistory(historyDay(4, '2026-09-10'), userId)),
      historyDay(4, '2026-09-10', { photoPath: null })],
  ];
  for (const [map, row, expected] of cases) {
    assert.deepEqual(map(row), { kind: 'accepted', row: expected, serverUpdatedAt: '2026-09-30T10:00:00.123456Z' });
  }
});

test('a custom colour and a deletion marker survive the round trip', () => {
  const item = wardrobeItem(5, {
    colorChoice: { kind: 'custom', hex: '#336699' }, colorFamily: 'blue', photoRelativePath: null,
    deletedAt: stamp(9), updatedAt: stamp(9),
  });
  const result = fromRemoteWardrobeItem(arrived(toRemoteWardrobeItem(item, userId)), phoneProfileId);
  assert.deepEqual(result.row, item);
});

test('timestamps that come back in Postgres form are normalised to the device form', () => {
  const record = arrived(toRemoteDressingDayDeparture(departure(3, '2026-09-10'), userId), {
    created_at: '2026-09-01T09:00:00+00:00', updated_at: '2026-09-01T12:01:00.000000+03:00',
  });
  const { row } = fromRemoteDressingDayDeparture(record, phoneProfileId);
  assert.equal(row.createdAt, '2026-09-01T09:00:00.000Z');
  assert.equal(row.updatedAt, '2026-09-01T09:01:00.000Z');
});

test('columns a newer server adds are ignored, the row still maps', () => {
  const record = arrived(toRemoteWardrobeItem(wardrobeItem(1), userId), { photo_url: 'x', extra: 1 });
  assert.equal(fromRemoteWardrobeItem(record, phoneProfileId).kind, 'accepted');
});

test('pulled History colours this build cannot read draw the day in the fixed scheme, never refuse it', () => {
  const day = arrived(toRemoteOutfitHistory(historyDay(4, '2026-09-10'), userId));
  for (const piece_colors_json of [null, undefined, 'navy', { primary_top: 'neon_2030' }, { head: 'navy' }]) {
    const result = fromRemoteOutfitHistory({ ...day, piece_colors_json }, phoneProfileId);
    assert.equal(result.kind, 'accepted');
    assert.equal(result.row.pieceColors, null);
    assert.deepEqual(result.row.outfit, historyDay(4, '2026-09-10').outfit);
  }
});

test('a row this build cannot parse is refused, and still reports its arrival for the cursor', () => {
  const good = (n) => arrived(toRemoteWardrobeItem(wardrobeItem(n), userId));
  const refusals = [
    fromRemoteWardrobeItem({ ...good(1), garment_type_id: 'hover_board' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), category: 'cape' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), entry_state: 'lent' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), color_option_id: 'plaid_2030' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), id: 'not-a-uuid' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), color_family: 'blue' }, phoneProfileId),
    fromRemoteWardrobeItem({ ...good(1), updated_at: 'yesterday' }, phoneProfileId),
    fromRemoteDressingDayChoice({ ...arrived(toRemoteDressingDayChoice(dayChoice(2, '2026-09-10'), userId)), formality: 'black_tie' }, phoneProfileId),
    fromRemoteDressingDayChoice({ ...arrived(toRemoteDressingDayChoice(dayChoice(2, '2026-09-10'), userId)), style_aesthetics: ['goth'] }, phoneProfileId),
    fromRemoteDressingDayDeparture({ ...arrived(toRemoteDressingDayDeparture(departure(3, '2026-09-10'), userId)), time_zone: 'Mars/Olympus' }, phoneProfileId),
    fromRemoteOutfitHistory({ ...arrived(toRemoteOutfitHistory(historyDay(4, '2026-09-10'), userId)),
      outfit_json: { ...historyDay(4, '2026-09-10').outfit, archetypeId: 'new_archetype' } }, phoneProfileId),
    fromRemoteOutfitHistory({ ...arrived(toRemoteOutfitHistory(historyDay(4, '2026-09-10'), userId)),
      outfit_json: { ...historyDay(4, '2026-09-10').outfit, garments: { primary_top: 'jetpack', bottom: 'jeans', footwear: 'sneakers' } } }, phoneProfileId),
    fromRemoteProfile({ ...arrived(toRemoteProfile(syncedProfile(), userId)), gender: 'other' }),
    fromRemoteProfile({ ...arrived(toRemoteProfile(syncedProfile(), userId)), display_name: 'A' }),
  ];
  for (const result of refusals) {
    assert.deepEqual(result, { kind: 'refused', serverUpdatedAt: '2026-09-30T10:00:00.123456Z' });
  }
  assert.deepEqual(fromRemoteWardrobeItem('nonsense', phoneProfileId), { kind: 'refused', serverUpdatedAt: null });
  assert.deepEqual(fromRemoteWardrobeItem({ ...good(1), server_updated_at: 'soon' }, phoneProfileId),
    { kind: 'refused', serverUpdatedAt: null });
});
