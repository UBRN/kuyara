import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

import {
  AccountRemoteError,
  createSupabaseAccountRemote,
  createSupabaseSyncConsent,
  pullOverlapSeconds,
} from './supabase-account-remote.ts';
import { toRemoteDressingDayChoice, toRemoteOutfitHistory, toRemoteWardrobeItem } from './account-remote-mappers.ts';
import { createAccountSyncFlow } from '../application/account-sync.ts';
import { createAccountSessionSync } from '../application/account-session-sync.ts';
import { createSqliteAccountRowsSource } from './sqlite-account-rows-source.ts';
import { signOut } from '../domain/account-link.ts';
import { pullCursorAt } from '../domain/sync-rules.ts';
import { migrateDatabase } from '../../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../../test/node-sqlite-database.mjs';
import {
  dayChoice, departure, emptyRows, historyDay, phoneProfileId, stamp, syncedProfile, uuid, wardrobeItem,
} from '../__tests__/account-fixtures.mjs';

const userId = uuid(900);
const pg = (iso) => iso.replace('Z', '+00:00');

/**
 * A Supabase client whose requests reach `answer` instead of the network: each call records the
 * method, table or function, query and body, and answers with JSON.
 */
function fakeClient(answer = () => []) {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const request = {
      method: init.method ?? 'GET',
      path: url.pathname.replace('/rest/v1/', ''),
      query: url.searchParams,
      prefer: new Headers(init.headers).get('Prefer'),
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    requests.push(request);
    const reply = answer(request);
    const { status, body } = reply instanceof Response ? { status: reply.status, body: await reply.json() }
      : { status: 200, body: reply };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  const client = createClient('https://project.supabase.co', 'sb_publishable_test', {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, requests };
}

/** Uploads `rows` and answers every acknowledgement the upload confirmed, batch by batch, as one set of rows. */
async function confirmedUpload(remote, rows) {
  const confirmed = emptyRows();
  await remote.upload(userId, rows, async (batch) => {
    confirmed.profile = batch.profile ?? confirmed.profile;
    for (const table of ['wardrobeItems', 'dressingDayChoices', 'dressingDayDepartures', 'outfitHistory']) {
      confirmed[table] = [...confirmed[table], ...batch[table]];
    }
  });
  return confirmed;
}

const remoteItem = (n, over = {}) => ({
  ...toRemoteWardrobeItem(wardrobeItem(n), userId),
  created_at: pg(stamp(0)), updated_at: pg(stamp(1)), server_updated_at: '2026-10-01T00:00:00.000001+00:00',
  ...over,
});

test('a pull starts the overlap window before the cursor and asks only for the caller\'s rows in arrival order', async () => {
  const { client, requests } = fakeClient();
  const remote = createSupabaseAccountRemote(client, phoneProfileId);
  await remote.pull(userId, pullCursorAt('2026-10-01T00:00:10.123456Z'), true);
  assert.equal(pullOverlapSeconds, 10);
  assert.deepEqual(requests.map(({ path }) => path).sort(),
    ['dressing_day_choices', 'dressing_day_departures', 'outfit_history', 'profiles', 'wardrobe_items']);
  for (const { method, query } of requests) {
    assert.equal(method, 'GET');
    assert.equal(query.get('user_id'), `eq.${userId}`);
    assert.equal(query.get('server_updated_at'), 'gte.2026-10-01T00:00:00.123456Z');
  }
  const wardrobe = requests.find(({ path }) => path === 'wardrobe_items');
  assert.equal(wardrobe.query.get('order'), 'server_updated_at.asc,id.asc');
});

test('without the sync consent a pull asks for the profile only, and the first pull has no lower bound', async () => {
  const { client, requests } = fakeClient();
  await createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), false);
  assert.deepEqual(requests.map(({ path }) => path), ['profiles']);
  assert.equal(requests[0].query.get('server_updated_at'), null);
});

test('a long table is read in pages keyed on arrival and id, so rows sharing a stamp are neither lost nor repeated', async () => {
  const at = '2026-10-01T00:00:00.000001+00:00';
  const all = Array.from({ length: 501 }, (_, index) => remoteItem(index + 1, { server_updated_at: at }));
  const { client, requests } = fakeClient(({ path, query }) => {
    if (path !== 'wardrobe_items') return [];
    return query.get('or') === null ? all.slice(0, 500) : all.slice(500);
  });
  const pulled = await createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), true);
  assert.equal(pulled.wardrobeItems.length, 501);
  const second = requests.filter(({ path }) => path === 'wardrobe_items')[1];
  assert.equal(second.query.get('or'),
    `(server_updated_at.gt."${at}",and(server_updated_at.eq."${at}",id.gt."${uuid(500)}"))`);
});

test('a deletion marker arrives without content, lands as a marker, and unknown rows still move the cursor', async () => {
  const marker = (table, over) => ({
    id: uuid(10), user_id: userId, created_at: pg(stamp(0)), updated_at: pg(stamp(5)),
    deleted_at: pg(stamp(5)), server_updated_at: '2026-10-02T00:00:00.000002+00:00', ...over,
  });
  const answers = {
    wardrobe_items: [
      marker('wardrobe_items', { category: null, entry_state: null, name: null }),
      remoteItem(11, { category: 'cape', server_updated_at: '2026-10-03T00:00:00.000003+00:00' }),
    ],
    dressing_day_choices: [marker('dressing_day_choices', { id: uuid(12), day_key: '2026-09-10', formality: null })],
    dressing_day_departures: [marker('dressing_day_departures', { id: uuid(13), day_key: '2026-09-10' })],
    outfit_history: [marker('outfit_history', { id: uuid(14), day_key: '2026-09-10', outfit_json: null })],
  };
  const { client } = fakeClient(({ path }) => answers[path] ?? []);
  const pulled = await createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), true);
  const deletion = { kind: 'deletionMarker', createdAt: stamp(0), updatedAt: stamp(5), deletedAt: stamp(5) };
  assert.deepEqual(pulled.wardrobeItems.map(({ row }) => row), [{ ...deletion, id: uuid(10) }]);
  assert.deepEqual(pulled.dressingDayChoices.map(({ row }) => row), [{ ...deletion, id: uuid(12), dayKey: '2026-09-10' }]);
  assert.deepEqual(pulled.dressingDayDepartures.map(({ row }) => row), [{ ...deletion, id: uuid(13), dayKey: '2026-09-10' }]);
  assert.deepEqual(pulled.outfitHistory.map(({ row }) => row), [{ ...deletion, id: uuid(14), dayKey: '2026-09-10' }]);
  assert.ok(pulled.arrivals.some(({ table, serverUpdatedAt }) => table === 'wardrobeItems' && serverUpdatedAt === '2026-10-03T00:00:00.000003Z'));
});

test('a marker that still names content of an unknown kind is refused, not read as a deletion', async () => {
  const { client } = fakeClient(({ path }) => (path === 'wardrobe_items' ? [{
    id: uuid(10), created_at: pg(stamp(0)), updated_at: pg(stamp(5)), deleted_at: pg(stamp(5)),
    category: 'cape', server_updated_at: '2026-10-02T00:00:00+00:00',
  }] : []));
  const pulled = await createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), true);
  assert.deepEqual(pulled.wardrobeItems, []);
  assert.equal(pulled.arrivals.length, 1);
});

test('a row read again inside the overlap lands again and the cursor never moves back', async () => {
  const cursor = '2026-10-01T00:00:08.000000Z';
  const early = remoteItem(1, { name: 'Late commit', server_updated_at: '2026-10-01T00:00:01.000000+00:00' });
  const { client } = fakeClient(({ path }) => (path === 'wardrobe_items' ? [early] : []));
  const writes = [];
  const source = {
    read: async () => ({ profile: null, wardrobeItems: [{ row: wardrobeItem(1), pendingSync: false }],
      dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] }),
    link: async () => ({ userId, lastUserId: userId, recordsUserId: userId, recordsConsentRecordedAt: null, cursor: pullCursorAt(cursor) }),
    clearPendingIfUnchanged: async () => assert.fail('nothing pending'),
    writePulled: async (rows, next) => writes.push([rows, next]),
    applyFirstLink: async () => assert.fail('first link'),
    saveLink: async () => {},
  };
  const flow = createAccountSyncFlow(source, createSupabaseAccountRemote(client, phoneProfileId), () => stamp(10));
  await flow.sync(userId, true);
  await flow.sync(userId, true);
  assert.equal(writes.length, 2);
  for (const [rows, next] of writes) {
    assert.deepEqual(rows.wardrobeItems.map(({ name }) => name), ['Late commit']);
    assert.deepEqual(next, pullCursorAt(cursor));
  }
});

test('two phones: a slow table never moves a fast one past a row the other phone committed meanwhile', async () => {
  // Phone A pulls. The Closet answers first, with nothing new; phone B's Closet upload, stamped
  // 00:00:45 when its transaction began, commits right after; the History, read side by side,
  // answers with a look from 00:01:00. A shared position would start the next Closet read at
  // 00:00:50 and miss phone B's piece for good.
  const fromB = remoteItem(1, { name: 'From phone B', server_updated_at: '2026-10-01T00:00:45.000000+00:00' });
  const look = { ...toRemoteOutfitHistory(historyDay(2, '2026-09-10'), userId),
    created_at: pg(stamp(0)), updated_at: pg(stamp(1)), server_updated_at: '2026-10-01T00:01:00.000000+00:00' };
  const since = (rows, query) => rows.filter((row) =>
    row.server_updated_at.replace('+00:00', 'Z') >= (query.get('server_updated_at')?.replace('gte.', '') ?? ''));
  let committedByB = false;
  const { client } = fakeClient(({ path, query }) => {
    if (path === 'wardrobe_items') {
      const rows = committedByB ? [fromB] : [];
      committedByB = true;
      return since(rows, query);
    }
    return path === 'outfit_history' ? since([look], query) : [];
  });
  let link = { userId, lastUserId: userId, recordsUserId: userId, recordsConsentRecordedAt: null,
    cursor: pullCursorAt('2026-10-01T00:00:00.000000Z') };
  const landed = [];
  const source = {
    read: async () => ({ profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] }),
    link: async () => link,
    clearPendingIfUnchanged: async () => assert.fail('nothing pending'),
    writePulled: async (rows, cursor) => {
      landed.push(...rows.wardrobeItems.map(({ name }) => name));
      link = { ...link, cursor };
    },
    applyFirstLink: async () => assert.fail('first link'),
    saveLink: async () => {},
  };
  const flow = createAccountSyncFlow(source, createSupabaseAccountRemote(client, phoneProfileId), () => stamp(10));
  await flow.sync(userId, true);
  assert.equal(link.cursor.outfitHistory, '2026-10-01T00:01:00.000000Z');
  assert.equal(link.cursor.wardrobeItems, '2026-10-01T00:00:00.000000Z');
  await flow.sync(userId, true);
  assert.deepEqual(landed, ['From phone B']);
});

test('an upload upserts by user and UUID, by user and day for choices and departures, by user for the profile, and returns only matched versions', async () => {
  const sent = {
    profile: { displayName: 'Ada', gender: 'woman', createdAt: stamp(0), updatedAt: stamp(1) },
    wardrobeItems: [wardrobeItem(1), wardrobeItem(2, { updatedAt: stamp(3) })],
    dressingDayChoices: [dayChoice(3, '2026-09-10')],
    dressingDayDepartures: [departure(4, '2026-09-10', { deletedAt: stamp(2), updatedAt: stamp(2) })],
    outfitHistory: [historyDay(5, '2026-09-10')],
  };
  const { client, requests } = fakeClient(({ path, body }) => {
    if (path === 'profiles') return [{ updated_at: pg(stamp(1)) }];
    // The second piece was rewritten by another phone in between: its version does not match.
    if (path === 'wardrobe_items') return body.map((row) => ({ id: row.id, updated_at: row.id === uuid(2) ? pg(stamp(9)) : pg(row.updated_at) }));
    return body.map((row) => ({ id: row.id, day_key: row.day_key, updated_at: pg(row.updated_at) }));
  });
  const acknowledged = await confirmedUpload(createSupabaseAccountRemote(client, phoneProfileId), sent);
  assert.deepEqual(acknowledged, { ...sent, wardrobeItems: [sent.wardrobeItems[0]] });

  const byPath = Object.fromEntries(requests.map((request) => [request.path, request]));
  assert.equal(byPath.profiles.query.get('on_conflict'), 'user_id');
  assert.equal(byPath.wardrobe_items.query.get('on_conflict'), 'user_id,id');
  assert.equal(byPath.outfit_history.query.get('on_conflict'), 'user_id,id');
  assert.equal(byPath.dressing_day_choices.query.get('on_conflict'), 'user_id,day_key');
  assert.equal(byPath.dressing_day_departures.query.get('on_conflict'), 'user_id,day_key');
  for (const request of requests) {
    assert.equal(request.method, 'POST');
    assert.match(request.prefer, /resolution=merge-duplicates/);
  }
  // Without the consent the profile carries neither consent field, so the account keeps its own.
  assert.deepEqual(Object.keys(byPath.profiles.body).sort(),
    ['created_at', 'deleted_at', 'display_name', 'gender', 'updated_at', 'user_id']);
  // A soft-deleted row goes without its content.
  assert.deepEqual(byPath.dressing_day_departures.body, [{
    id: uuid(4), user_id: userId, day_key: '2026-09-10', created_at: stamp(0), updated_at: stamp(2), deleted_at: stamp(2),
  }]);
});

test('more than 200 rows of a table upload in batches of 200, each matched against its own answer', async () => {
  const items = Array.from({ length: 201 }, (_, index) => wardrobeItem(index + 1));
  // Another phone rewrote one row of each batch in between: their versions do not match.
  const rewritten = new Set([uuid(5), uuid(201)]);
  const { client, requests } = fakeClient(({ body }) => body.map((row) => ({
    id: row.id, updated_at: rewritten.has(row.id) ? pg(stamp(9)) : pg(row.updated_at),
  })));
  const acknowledged = await confirmedUpload(createSupabaseAccountRemote(client, phoneProfileId), {
    profile: null, wardrobeItems: items, dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [],
  });
  const batches = requests.filter(({ path }) => path === 'wardrobe_items');
  assert.deepEqual(batches.map(({ method, body, query }) => [method, body.length, query.get('on_conflict')]),
    [['POST', 200, 'user_id,id'], ['POST', 1, 'user_id,id']]);
  assert.deepEqual(acknowledged.wardrobeItems, items.filter(({ id }) => !rewritten.has(id)));
});

test('each batch the account confirms is handed on before the next goes, so a later failure keeps what committed', async () => {
  const items = Array.from({ length: 201 }, (_, index) => wardrobeItem(index + 1));
  const { client } = fakeClient(({ path, body }) => (path === 'outfit_history'
    ? new Response(JSON.stringify({ code: '57014', message: 'canceling statement' }), { status: 500 })
    : body.map((row) => ({ id: row.id, updated_at: pg(row.updated_at) }))));
  const confirmed = [];
  const upload = createSupabaseAccountRemote(client, phoneProfileId).upload(userId, {
    profile: null, wardrobeItems: items, dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [historyDay(300, '2026-09-10')],
  }, async (batch) => { confirmed.push(batch); });
  await assert.rejects(upload, (error) => error instanceof AccountRemoteError);
  assert.deepEqual(confirmed, [
    { ...emptyRows(), wardrobeItems: items.slice(0, 200) },
    { ...emptyRows(), wardrobeItems: items.slice(200) },
  ]);
});

test('a first-link snapshot names the rows this build refused, the Closet and History by id and the days by day', async () => {
  const answers = {
    wardrobe_items: [remoteItem(11, { category: 'cape' }), remoteItem(12)],
    dressing_day_choices: [{ ...toRemoteDressingDayChoice(dayChoice(13, '2026-09-12'), userId), formality: 'black-tie',
      created_at: pg(stamp(0)), updated_at: pg(stamp(1)), server_updated_at: '2026-10-01T00:00:00.000001+00:00' }],
    outfit_history: [{ ...toRemoteOutfitHistory(historyDay(14, '2026-09-13'), userId), outfit_json: { unknown: true },
      created_at: pg(stamp(0)), updated_at: pg(stamp(1)), server_updated_at: '2026-10-01T00:00:00.000001+00:00' }],
  };
  const { client } = fakeClient(({ path }) => answers[path] ?? []);
  const snapshot = await createSupabaseAccountRemote(client, phoneProfileId).pullSnapshot(userId, true);
  assert.deepEqual(snapshot.rows.wardrobeItems.map(({ id }) => id), [uuid(12)]);
  assert.deepEqual(snapshot.refused, {
    profile: false, wardrobeItems: [uuid(11)], dressingDayChoices: ['2026-09-12'], dressingDayDepartures: [], outfitHistory: [uuid(14)],
  });
});

test('a first-link snapshot says when this build refused the account\'s profile; an ongoing pull names nothing refused', async () => {
  const profile = { display_name: 'Account', gender: 'nonbinary-from-a-newer-build', dress_style: 'casual', style_aesthetics: [],
    created_at: pg(stamp(0)), updated_at: pg(stamp(1)), server_updated_at: '2026-10-01T00:00:00.000001+00:00' };
  const answers = { profiles: [profile], wardrobe_items: [remoteItem(11, { category: 'cape' })] };
  const { client } = fakeClient(({ path }) => answers[path] ?? []);
  const remote = createSupabaseAccountRemote(client, phoneProfileId);
  const snapshot = await remote.pullSnapshot(userId, true);
  assert.equal(snapshot.rows.profile, null);
  assert.equal(snapshot.refused.profile, true);
  const pulled = await remote.pull(userId, pullCursorAt(null), true);
  assert.equal('refused' in pulled, false);
  assert.equal(pulled.arrivals.length, 2);
});

test('no upload body carries a device-only value: the profile id, a photo path or the pending flag', async () => {
  const { client, requests } = fakeClient(({ body }) => (Array.isArray(body) ? [] : []));
  await confirmedUpload(createSupabaseAccountRemote(client, phoneProfileId), {
    profile: syncedProfile(), wardrobeItems: [wardrobeItem(1)], dressingDayChoices: [], dressingDayDepartures: [],
    outfitHistory: [historyDay(2, '2026-09-10')],
  });
  const text = JSON.stringify(requests.map(({ body }) => body));
  for (const value of [phoneProfileId, 'wardrobe/photo-1.jpg', 'history/photo-2.jpg', 'pending', 'local_profile']) {
    assert.equal(text.includes(value), false, value);
  }
});

test('a Supabase error becomes a closed failure that names nothing of the request', async () => {
  const secret = 'row 00000000-0000-4000-8000-000000000900 token eyJ';
  const { client } = fakeClient(() => new Response(JSON.stringify({ code: '42501', message: secret }), { status: 403 }));
  const error = await createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), false).catch((caught) => caught);
  assert.ok(error instanceof AccountRemoteError);
  assert.equal(error.code, 'request');
  assert.equal(`${error.message} ${error.stack}`.includes(secret), false);
  assert.equal('cause' in error, false);
});

test('an answer that does not parse is a closed failure too', async () => {
  const { client } = fakeClient(() => ({ not: 'a list' }));
  await assert.rejects(createSupabaseAccountRemote(client, phoneProfileId).pull(userId, pullCursorAt(null), false),
    (error) => error instanceof AccountRemoteError && error.code === 'response');
});

test('consent records are read in server arrival order, given by insert and withdrawn by the one function', async () => {
  const { client, requests } = fakeClient(({ path }) => (path === 'sync_consent_records'
    ? [{ text_version: '2026-10-04', answer: 'given', answered_at: '2026-10-04T08:00:00+00:00', recorded_at: '2026-10-04T08:00:01.123456+00:00' }] : null));
  const consent = createSupabaseSyncConsent(client);
  assert.deepEqual(await consent.records(userId), [
    { textVersion: '2026-10-04', answer: 'given', answeredAt: '2026-10-04T08:00:00+00:00', recordedAt: '2026-10-04T08:00:01.123456Z' },
  ]);
  await consent.give(userId, { textVersion: '2026-10-04', answeredAt: '2026-10-04T08:00:00.000Z' });
  await consent.withdraw({ textVersion: '2026-10-04', answeredAt: '2026-10-04T09:00:00.000Z' });
  const [read, give, withdraw] = requests;
  assert.equal(read.query.get('select'), 'text_version,answer,answered_at,recorded_at');
  assert.equal(read.query.get('order'), 'recorded_at.asc,id.asc');
  assert.equal(read.query.get('user_id'), `eq.${userId}`);
  assert.equal(give.method, 'POST');
  assert.deepEqual(give.body, { user_id: userId, text_version: '2026-10-04', answer: 'given', answered_at: '2026-10-04T08:00:00.000Z' });
  assert.equal(withdraw.path, 'rpc/withdraw_sync_consent');
  assert.deepEqual(withdraw.body, { p_text_version: '2026-10-04', p_answered_at: '2026-10-04T09:00:00.000Z' });
});

test('an unknown consent answer or an unreadable arrival is refused at the boundary', async () => {
  const { client } = fakeClient(() => [{ text_version: 'x', answer: 'maybe', answered_at: '2026-10-04T08:00:00+00:00', recorded_at: '2026-10-04T08:00:01+00:00' }]);
  await assert.rejects(createSupabaseSyncConsent(client).records(userId), AccountRemoteError);
  const { client: unstamped } = fakeClient(() => [{ text_version: 'x', answer: 'given', answered_at: '2026-10-04T08:00:00+00:00', recorded_at: 'soon' }]);
  await assert.rejects(createSupabaseSyncConsent(unstamped).records(userId), AccountRemoteError);
});

/** The keys each table declares in the SQL file: its primary key and every unique constraint. */
function declaredKeys() {
  const sql = readFileSync(path.join(import.meta.dirname, '../../../../../../supabase/migrations/20261004120000_accounts.sql'), 'utf8');
  const keys = {};
  for (const [, table, body] of sql.matchAll(/create table public\.(\w+) \(\n([\s\S]*?)\n\);/gu)) {
    keys[table] = [
      ...[...body.matchAll(/^ {2}(?!constraint )(\w+) \w+ primary key/gmu)].map(([, column]) => [column]),
      ...[...body.matchAll(/constraint \w+ (?:primary key|unique) \(([^)]+)\)/gu)].map(([, columns]) => columns.split(', ')),
    ];
  }
  return keys;
}

/**
 * A PostgREST stand-in that holds rows under the keys the SQL file declares. An upsert must name
 * one of a table's keys, as Postgres requires of `on conflict`; a conflict on another user's row
 * is refused as row-level security refuses it, and so is a row that would collide with another
 * under any key. The server stamps each write on arrival.
 */
function fakeAccountServer() {
  const keys = declaredKeys();
  const tables = {};
  let arrivals = 0;
  const refuse = (status, code) => new Response(JSON.stringify({ code, message: code }), { status });
  const same = (columns, a, b) => columns.every((column) => a[column] === b[column]);
  const answer = ({ method, path: table, query, body }) => {
    const rows = (tables[table] ??= []);
    if (method === 'GET') {
      const user = query.get('user_id')?.replace('eq.', '');
      const from = query.get('server_updated_at')?.replace('gte.', '') ?? '';
      return rows.filter((row) => row.user_id === user && row.server_updated_at.replace('+00:00', 'Z') >= from)
        .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at) || a.id.localeCompare(b.id));
    }
    const conflict = query.get('on_conflict').split(',');
    if (!keys[table].some((key) => key.join() === conflict.join())) return refuse(400, '42P10');
    const written = [];
    for (const row of Array.isArray(body) ? body : [body]) {
      const held = rows.find((other) => same(conflict, other, row)) ?? null;
      // Row-level security: the conflicting row must be the caller's own to be updated.
      if (held !== null && held.user_id !== row.user_id) return refuse(403, '42501');
      const next = { ...held, ...row, server_updated_at: `2026-10-04T00:00:00.${String(arrivals += 1).padStart(6, '0')}+00:00` };
      if (rows.some((other) => other !== held && keys[table].some((key) => same(key, other, next)))) return refuse(409, '23505');
      if (held === null) rows.push(next); else Object.assign(held, next);
      written.push(next);
    }
    const select = query.get('select').split(',').map((column) => column.trim());
    return written.map((row) => Object.fromEntries(select.map((column) => [column, row[column]])));
  };
  return { answer, rows: (table, user) => (tables[table] ?? []).filter((row) => row.user_id === user) };
}

test('a phone that synced to one account links to a second, uploads the same UUIDs there and keeps syncing', async (t) => {
  const server = fakeAccountServer();
  // The fake holds the per-user keys: a conflict target without the user is no key at all.
  assert.equal(server.answer({ method: 'POST', path: 'wardrobe_items', query: new URLSearchParams('on_conflict=id&select=id'), body: [] }).status, 400);

  const { client } = fakeClient(server.answer);
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  const localProfileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';
  await database.runAsync(`INSERT INTO local_profiles (singleton_key, id, gender, dress_style, style_aesthetics,
    display_name, language_preference, theme_preference, onboarding_completed, created_at, updated_at)
    VALUES (1, ?, 'woman', 'casual', '["minimal"]', 'Phone', 'en', 'light', 1, ?, ?)`, [localProfileId, stamp(0), stamp(1)]);
  const source = createSqliteAccountRowsSource(database);
  await source.writePulled({ profile: null, wardrobeItems: [wardrobeItem(1, { photoRelativePath: null })],
    dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [historyDay(2, '2026-09-10', { photoPath: null })] }, null);
  const consent = { records: async () => [{ answer: 'given', textVersion: '2026-10-04', answeredAt: stamp(2), recordedAt: '2026-10-03T00:00:00.000000Z' }] };
  const sync = createAccountSessionSync({
    source, consent, remote: createSupabaseAccountRemote(client, localProfileId), now: () => '2026-10-04T12:00:00.000Z',
  });
  const userA = uuid(901);
  const userB = uuid(902);
  const ids = (table, user) => server.rows(table, user).map((row) => row.id).sort();

  assert.notEqual((await sync.run(userA, 'signIn')).firstLink, null);
  await sync.run(userA, 'foreground');
  assert.deepEqual(ids('wardrobe_items', userA), [uuid(1)]);
  assert.deepEqual(ids('outfit_history', userA), [uuid(2)]);

  await source.saveLink(signOut(await source.link()));
  const linked = await sync.run(userB, 'signIn');
  assert.deepEqual(linked.firstLink.counts, { piecesAdded: 1, historyDaysAdded: 1, piecesReceived: 0, historyDaysReceived: 0 });
  assert.deepEqual(ids('wardrobe_items', userB), [uuid(1)]);
  assert.deepEqual(ids('outfit_history', userB), [uuid(2)]);
  assert.equal(linked.pendingChanges, 0);

  await database.runAsync('UPDATE wardrobe_items SET name = ?, updated_at = ?, pending_sync = 1 WHERE id = ?',
    ['Edited for B', stamp(30), uuid(1)]);
  const after = await sync.run(userB, 'localWrite');
  assert.equal(after.firstLink, null);
  assert.equal(after.pendingChanges, 0);
  assert.deepEqual(server.rows('wardrobe_items', userB).map((row) => row.name), ['Edited for B']);
  assert.deepEqual(server.rows('wardrobe_items', userA).map((row) => row.name), ['Linen shirt']);
});

test('a row the account refuses for its size fails the pass as a closed failure and stays pending', async () => {
  const { client } = fakeClient(({ method, path: table }) => (method === 'POST' && table === 'wardrobe_items'
    ? new Response(JSON.stringify({ code: '23514', message: 'new row violates check constraint "wardrobe_items_bounds"' }), { status: 400 })
    : []));
  const source = {
    read: async () => ({ profile: null, wardrobeItems: [{ row: wardrobeItem(1, { name: 'x'.repeat(3000) }), pendingSync: true }],
      dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] }),
    link: async () => ({ userId, lastUserId: userId, recordsUserId: userId, recordsConsentRecordedAt: null, cursor: pullCursorAt(null) }),
    clearPendingIfUnchanged: async () => assert.fail('nothing was acknowledged'),
    writePulled: async () => assert.fail('a failed upload skips the pull'),
    applyFirstLink: async () => assert.fail('first link'),
    saveLink: async () => {},
  };
  const flow = createAccountSyncFlow(source, createSupabaseAccountRemote(client, phoneProfileId), () => stamp(10));
  await assert.rejects(flow.sync(userId, true), (error) => error instanceof AccountRemoteError && error.code === 'request'
    && !error.message.includes('wardrobe_items_bounds'));
});
