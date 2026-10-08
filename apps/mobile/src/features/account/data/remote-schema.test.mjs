import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { dressStyleSchema, outfitArchetypeIds } from '@kuyara/contracts';

import { garmentSwatchIds } from '@/features/catalog/domain/garment-swatch';
import { garmentTypeIds } from '@/features/catalog/domain/garment-taxonomy';
import { outfitSlots } from '@/features/recommendation/domain/outfit-composition';
import { WARDROBE_NAME_MAX_LENGTH, shortenWardrobeName } from '@/features/wardrobe/domain/wardrobe-name';

import { wardrobeItem } from '../__tests__/account-fixtures.mjs';
import { toRemoteWardrobeItem } from './account-remote-mappers.ts';
import {
  remoteDressingDayChoiceMarkerSchema,
  remoteDressingDayDepartureMarkerSchema,
  remoteOutfitHistoryMarkerSchema,
  remoteWardrobeItemMarkerSchema,
  remoteDressingDayChoiceRowSchema,
  remoteDressingDayDepartureRowSchema,
  remoteOutfitHistoryRowSchema,
  remoteProfileRowSchema,
  remoteWardrobeItemRowSchema,
} from './account-remote-records.ts';

// The remote schema is the SQL files applied by hand, in name order, so this test
// is the only thing that keeps it in step with the record shapes the app reads and writes. It
// reads every file and checks the schema they leave behind.
const migrationsDir = path.join(import.meta.dirname, '../../../../../../supabase/migrations');
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
const sql = migrationFiles.map((name) => readFileSync(path.join(migrationsDir, name), 'utf8')).join('\n');
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

/** The statements in order, without their semicolons; a `$$` function body stays whole. */
function statementsOf(text) {
  const statements = [];
  let current = '';
  let inBody = false;
  for (const part of text.split(/(\$\$)/u)) {
    if (part === '$$') inBody = !inBody;
    if (part === '$$' || inBody) {
      current += part;
      continue;
    }
    const [first, ...rest] = part.split(';');
    current += first;
    for (const piece of rest) {
      statements.push(current.trim());
      current = piece;
    }
  }
  return [...statements, current.trim()].filter((statement) => statement.length > 0);
}

/**
 * The objects the migrations leave, by name: each later create replaces and each drop removes.
 * Constraints come from table bodies and `alter table ... add/drop constraint`; a column change
 * outside `create table` is refused, so the column checks below cannot go stale silently.
 */
function finalSchema() {
  const schema = { constraints: new Map(), policies: new Map(), functions: new Map(), triggers: new Map(), indexes: new Map() };
  for (const statement of statementsOf(code)) {
    let match;
    if ((match = /^create table public\.(\w+) \(\n([\s\S]*)\n\)$/u.exec(statement))) {
      const items = match[2].split(/\n(?= {2}\S)/u).map((item) => item.trim().replace(/,$/u, ''));
      for (const item of items) {
        const constraint = /^constraint (\w+) ([\s\S]+)$/u.exec(item);
        if (constraint) schema.constraints.set(`${match[1]}.${constraint[1]}`, constraint[2]);
      }
    } else if ((match = /^alter table public\.(\w+) drop constraint (?:if exists )?(\w+)$/u.exec(statement))) {
      schema.constraints.delete(`${match[1]}.${match[2]}`);
    } else if ((match = /^alter table public\.(\w+) add constraint (\w+) ([\s\S]+)$/u.exec(statement))) {
      schema.constraints.set(`${match[1]}.${match[2]}`, match[3]);
    } else if (/^alter table [^\n]*\b(?:add|drop|alter|rename)\b(?! constraint)/u.test(statement)
      && !/enable row level security$/u.test(statement)) {
      assert.fail(`a migration changes a column outside create table; teach this test to read it: ${statement}`);
    } else if ((match = /^create policy (\w+) on public\.(\w+)\b/u.exec(statement))) {
      schema.policies.set(`${match[2]}.${match[1]}`, statement);
    } else if ((match = /^drop policy (?:if exists )?(\w+) on public\.(\w+)$/u.exec(statement))) {
      schema.policies.delete(`${match[2]}.${match[1]}`);
    } else if ((match = /^create (?:or replace )?function public\.(\w+)\(/u.exec(statement))) {
      schema.functions.set(match[1], statement);
    } else if ((match = /^drop function (?:if exists )?public\.(\w+)\b/u.exec(statement))) {
      schema.functions.delete(match[1]);
    } else if ((match = /^create trigger (\w+)\n\s+[a-z ]+ on public\.(\w+)\n/u.exec(statement))) {
      schema.triggers.set(`${match[2]}.${match[1]}`, statement);
    } else if ((match = /^drop trigger (?:if exists )?(\w+) on public\.(\w+)$/u.exec(statement))) {
      schema.triggers.delete(`${match[2]}.${match[1]}`);
    } else if ((match = /^create index (\w+) on public\.(\w+) /u.exec(statement))) {
      schema.indexes.set(match[1], statement);
    } else if ((match = /^drop index (?:if exists )?public\.(\w+)$/u.exec(statement))) {
      schema.indexes.delete(match[1]);
    }
  }
  return schema;
}

const schema = finalSchema();

function finalFunction(name) {
  const body = schema.functions.get(name);
  assert.ok(body, `function public.${name}`);
  return body;
}

/** Every check constraint the table is left with, joined. */
function constraintsOf(table) {
  return [...schema.constraints].filter(([key]) => key.startsWith(`${table}.`)).map(([, body]) => body).join('\n');
}

/** The byte bound a constraint of the table puts on an expression, as a number. */
function boundOf(table, expression) {
  const escaped = expression.replace(/[()[\].]/gu, '\\$&');
  const match = new RegExp(`octet_length\\(${escaped}\\) <= (\\d+)`, 'u').exec(constraintsOf(table));
  assert.ok(match, `${table}: octet_length(${expression})`);
  return Number(match[1]);
}

const synced = {
  profiles: remoteProfileRowSchema,
  wardrobe_items: remoteWardrobeItemRowSchema,
  dressing_day_choices: remoteDressingDayChoiceRowSchema,
  dressing_day_departures: remoteDressingDayDepartureRowSchema,
  outfit_history: remoteOutfitHistoryRowSchema,
};
const tables = [...Object.keys(synced), 'sync_consent_records'];

function tableBody(name) {
  const match = new RegExp(`create table public\\.${name} \\(\\n([\\s\\S]*?)\\n\\);`, 'u').exec(code);
  assert.ok(match, `create table public.${name}`);
  return match[1];
}

// One column per line; constraint lines start with a keyword.
function columnsOf(name) {
  return tableBody(name).split('\n')
    .map((line) => /^ {2}([a-z_]+) (?!\()/u.exec(line)?.[1])
    .filter((column) => column !== undefined && !['constraint', 'primary', 'unique'].includes(column));
}

test('every synced table has exactly the pull schema keys plus user_id', () => {
  for (const [table, schema] of Object.entries(synced)) {
    assert.deepEqual(columnsOf(table).sort(), [...Object.keys(schema.shape), 'user_id'].sort(), table);
  }
});

test('the consent record table has the agreed columns', () => {
  assert.deepEqual(columnsOf('sync_consent_records').sort(),
    ['answer', 'answered_at', 'id', 'recorded_at', 'text_version', 'user_id']);
});

test('every table references auth.users and is removed with the user', () => {
  for (const table of tables) {
    assert.match(tableBody(table), /user_id uuid (?:primary key|not null) references auth\.users \(id\) on delete cascade/u, table);
  }
});

test('row-level security is enabled on every table', () => {
  for (const table of tables) {
    assert.match(code, new RegExp(`alter table public\\.${table} enable row level security;`, 'u'), table);
  }
});

test('anon is granted nothing, and no policy reads user metadata', () => {
  assert.equal(/grant [^;]*\banon\b/iu.test(code), false);
  assert.equal(/\bto (?:public|anon)\b/iu.test(code.replace(/revoke [^;]*;/giu, '')), false);
  assert.equal(/raw_user_meta_data|user_metadata/iu.test(sql), false);
  for (const policy of code.match(/create policy [\s\S]*?;/gu) ?? []) {
    assert.match(policy, /to authenticated/u, policy);
  }
});

test('objects created later in public start with no access for anon, authenticated or public', () => {
  for (const kind of ['tables', 'sequences', 'functions']) {
    assert.match(
      code,
      new RegExp(`alter default privileges for role postgres in schema public\\s+revoke all on ${kind} from [^;]*\\banon, authenticated;`, 'u'),
      kind,
    );
  }
  assert.match(code, /revoke all on functions from public, anon, authenticated;/u);
});

test('consent records are select and insert only: no update or delete policy or grant', () => {
  const policies = (code.match(/create policy \w+ on public\.sync_consent_records\n\s+for (\w+)/gu) ?? [])
    .map((policy) => policy.split(/\s+/u).at(-1));
  assert.deepEqual(policies.sort(), ['insert', 'select']);
  const grants = code.match(/grant [^;]*on table public\.sync_consent_records to authenticated;/gu) ?? [];
  assert.ok(grants.length > 0);
  for (const grant of grants) assert.equal(/\b(update|delete|all)\b/iu.test(grant), false, grant);
});

test('the four content tables keep a tombstone trigger and a live-row check', () => {
  for (const table of ['wardrobe_items', 'dressing_day_choices', 'dressing_day_departures', 'outfit_history']) {
    assert.match(code, new RegExp(`create trigger ${table}_clear_tombstone\\n\\s+before insert or update on public\\.${table}`, 'u'), table);
    assert.match(tableBody(table), new RegExp(`constraint ${table}_live_content check \\(deleted_at is not null or`, 'u'), table);
  }
});

test('each deletion marker schema names every column of its table, so a new content column is classified', () => {
  const markers = {
    wardrobe_items: remoteWardrobeItemMarkerSchema,
    dressing_day_choices: remoteDressingDayChoiceMarkerSchema,
    dressing_day_departures: remoteDressingDayDepartureMarkerSchema,
    outfit_history: remoteOutfitHistoryMarkerSchema,
  };
  for (const [table, schema] of Object.entries(markers)) {
    assert.deepEqual(Object.keys(schema.shape).sort(), Object.keys(synced[table].shape).sort(), table);
  }
});

const recordTables = ['wardrobe_items', 'dressing_day_choices', 'dressing_day_departures', 'outfit_history'];

test('each record is keyed within its user, so one phone\'s UUIDs can join a second account', () => {
  assert.match(tableBody('profiles'), /^ {2}user_id uuid primary key /mu);
  for (const table of recordTables) {
    const body = tableBody(table);
    assert.match(body, /^ {2}id uuid not null,$/mu, table);
    assert.match(body, new RegExp(`constraint ${table}_pkey primary key \\(user_id, id\\)`, 'u'), table);
    assert.equal(/\bid uuid primary key\b/u.test(body), false, table);
  }
  for (const table of ['dressing_day_choices', 'dressing_day_departures']) {
    assert.match(tableBody(table), new RegExp(`constraint ${table}_user_day_key unique \\(user_id, day_key\\)`, 'u'), table);
  }
});

/** The type of each column: the word or words after its name, up to a constraint keyword or the comma. */
function columnTypes(name) {
  return Object.fromEntries(tableBody(name).split('\n')
    .map((line) => /^ {2}([a-z_]+) ([a-z]+(?:\[\])?)/u.exec(line))
    .filter((match) => match !== null && !['constraint', 'primary', 'unique'].includes(match[1]))
    .map((match) => [match[1], match[2]]));
}

test('every text, jsonb and array column carries a size bound, so no row grows without limit', () => {
  for (const table of tables) {
    const body = constraintsOf(table);
    const content = Object.entries(columnTypes(table)).filter(([, type]) => ['text', 'jsonb', 'text[]'].includes(type));
    assert.ok(content.length > 0, table);
    for (const [column, type] of content) {
      if (column === 'answer') continue; // a closed check of two values
      const bounds = type === 'text' ? [`octet_length(${column}) <= `]
        : type === 'jsonb' ? [`octet_length(${column}::text) <= `]
          : [`cardinality(${column}) <= `, `octet_length(array_to_string(${column}, ',')) <= `];
      for (const bound of bounds) assert.ok(body.includes(bound), `${table}.${column}: ${bound}`);
    }
  }
  assert.match(tableBody('sync_consent_records'), /answer text not null check \(answer in \('given', 'withdrawn'\)\)/u);
});

test('each record table caps the rows one user holds, and a signed-in insert is refused past 400 MB', () => {
  const caps = { wardrobe_items: 2000, outfit_history: 7300, dressing_day_choices: 7300, dressing_day_departures: 7300 };
  for (const [table, cap] of Object.entries(caps)) {
    assert.match(schema.triggers.get(`${table}.${table}_row_cap`) ?? '', new RegExp(`^create trigger ${table}_row_cap\\n\\s+after insert on public\\.${table}\\n`
      + `\\s+for each statement execute function public\\.enforce_user_row_cap\\('${cap}'\\)$`, 'u'), table);
  }
  const body = finalFunction('enforce_user_row_cap');
  // Supabase's Free plan turns the database read-only past 500 MB.
  assert.match(body, /\$\$\ndeclare\n[\s\S]*?\nbegin\n {2}if auth\.uid\(\) is not null then\n[\s\S]*?\n {4}database_bytes := pg_database_size\(current_database\(\)\);\n {4}if database_bytes > 400 \* 1024 \* 1024 then\n\s+raise exception 'database size guard reached' using errcode = '53100';/u);
  assert.ok(body.indexOf('pg_database_size') < body.indexOf('select count(*)'));
  assert.match(body, /raise exception 'row cap reached' using errcode = '54000';/u);
});

test('past half the guard only accounts under a small allowance grow, so a few full accounts cannot stop every member', () => {
  const body = finalFunction('enforce_user_row_cap');
  const hard = Number(/if database_bytes > (\d+) \* 1024 \* 1024 then\n\s+raise exception 'database size guard reached'/u.exec(body)?.[1]);
  const soft = Number(/if database_bytes > (\d+) \* 1024 \* 1024 then\n\s+select coalesce\(sum\(row_bytes\), 0\) into account_bytes from \(/u.exec(body)?.[1]);
  // The allowance refuses with the guard's own error, which installed apps already treat as a failed request.
  assert.match(body, /if account_bytes > 1024 \* 1024 then\n\s+raise exception 'database size guard reached' using errcode = '53100';/u);
  // A higher step or allowance lets fewer accounts fill the space between the two steps.
  assert.ok(hard === 400 && soft > 0 && soft <= hard / 2, `${soft}`);
  assert.ok(body.indexOf(`> ${hard} * 1024 * 1024`) < body.indexOf(`> ${soft} * 1024 * 1024`));
  // Every row of the account in every record table counts, the statement's own rows included:
  // `union all`, since `union` would fold rows of equal size into one.
  const measured = /select coalesce\(sum\(row_bytes\), 0\) into account_bytes from \(\n([\s\S]*?)\n\s+\) account_rows;/u.exec(body)?.[1] ?? '';
  const parts = measured.split('\n').map((line) => line.trim());
  assert.equal(parts.length, recordTables.length, measured);
  assert.ok(parts.slice(1).every((line) => line.startsWith('union all select pg_column_size(r.*) from ')), measured);
  assert.ok(parts[0].startsWith('select pg_column_size(r.*) as row_bytes from '), measured);
  assert.deepEqual(parts.map((line) => / from public\.(\w+) r where r\.user_id = auth\.uid\(\)$/u.exec(line)?.[1]).sort(), [...recordTables].sort());
});

test('updates on the record tables are judged by the same cap and size guard as inserts', () => {
  // Rows inserted small could otherwise be rewritten large past either step; an upsert fires both.
  const caps = { wardrobe_items: 2000, outfit_history: 7300, dressing_day_choices: 7300, dressing_day_departures: 7300 };
  for (const [table, cap] of Object.entries(caps)) {
    assert.equal(schema.triggers.get(`${table}.${table}_row_cap_update`), `create trigger ${table}_row_cap_update\n`
      + `  after update on public.${table}\n  for each statement execute function public.enforce_user_row_cap('${cap}')`, table);
  }
});

test('the History and Closet bounds hold the largest value the app writes', () => {
  // Postgres prints jsonb with a space after each colon and comma.
  const printed = (value) => `{${Object.entries(value).map(([key, item]) => `"${key}": ${typeof item === 'object' ? printed(item) : JSON.stringify(item)}`).join(', ')}}`;
  const longest = (values) => values.reduce((a, b) => (b.length > a.length ? b : a));
  const outfit = {
    garments: Object.fromEntries(outfitSlots.map((slot) => [slot, longest(garmentTypeIds)])),
    archetypeId: longest(outfitArchetypeIds),
    formality: longest(dressStyleSchema.options),
    source: 'recommended',
  };
  const colors = Object.fromEntries(outfitSlots.map((slot) => [slot, longest(garmentSwatchIds)]));
  const outfitBound = boundOf('outfit_history', 'outfit_json::text');
  const colorsBound = boundOf('outfit_history', 'piece_colors_json::text');
  assert.ok(printed(outfit).length <= outfitBound, `${printed(outfit).length} > ${outfitBound}`);
  assert.ok(printed(colors).length <= colorsBound, `${printed(colors).length} > ${colorsBound}`);
  // Tight enough that a few accounts cannot fill the database: within three times the maximum.
  assert.ok(outfitBound <= 3 * printed(outfit).length && colorsBound <= 3 * printed(colors).length);
  assert.ok(WARDROBE_NAME_MAX_LENGTH * 4 <= boundOf('wardrobe_items', 'name'));
  assert.ok(boundOf('wardrobe_items', 'name') <= 1000 && boundOf('wardrobe_items', 'color') <= 1000);
});

test('a Closet name that migration 29 shortened fits the account bound and the upload mapper sends it whole', () => {
  const bytes = (text) => new TextEncoder().encode(text).length;
  const bound = boundOf('wardrobe_items', 'name');
  // Three UTF-8 bytes per UTF-16 unit is the most any name the phone keeps can cost.
  const widest = shortenWardrobeName('\u{20ac}'.repeat(1000));
  assert.equal(widest.length, WARDROBE_NAME_MAX_LENGTH);
  assert.equal(bytes(widest), 3 * WARDROBE_NAME_MAX_LENGTH);
  assert.ok(bytes(widest) <= bound, `${bytes(widest)} > ${bound}`);
  for (const name of [widest, shortenWardrobeName('\u{1f600}'.repeat(1000)), shortenWardrobeName('x'.repeat(1000))]) {
    assert.ok(bytes(name) <= bound);
    // The mapper puts no length rule of its own on the name: what migration 29 leaves is what is sent.
    assert.equal(toRemoteWardrobeItem(wardrobeItem(1, { name }), '00000000-0000-4000-8000-000000000900').name, name);
  }
});

test('past 400 consent answers only one withdrawal of a still given consent lands, so withdrawal works and the table stays bounded', () => {
  assert.match(code, new RegExp('create trigger sync_consent_records_row_cap\\n\\s+after insert on public\\.sync_consent_records\\n'
    + '\\s+referencing new table as inserted_records\\n'
    + '\\s+for each statement execute function public\\.enforce_consent_record_cap\\(\\);', 'u'));
  const body = finalFunction('enforce_consent_record_cap');
  assert.match(body, /if held > 400 and \(\s+exists \(select 1 from inserted_records where answer = 'given'\)\s+or \(select count\(\*\) from inserted_records\) > 1\s+or coalesce\(/u);
  assert.match(body, /\), ''\) <> 'given'\s+\) then\s+raise exception 'row cap reached' using errcode = '54000';/u);
  assert.doesNotMatch(code, /enforce_user_row_cap\('400'\)/u);
});

const ownRow = 'user_id = (select auth.uid())';
const consentGate = '(select public.has_sync_consent())';

test('every policy the migrations leave limits a person to their own rows, and record writes need the sync consent', () => {
  const policies = [...schema.policies.values()];
  assert.ok(policies.length > 0);
  const seen = new Set();
  for (const policy of policies) {
    const [, table, command] = /^create policy \w+ on public\.(\w+)\n\s+for (select|insert|update|delete) to authenticated /u.exec(policy) ?? [];
    assert.ok(table && tables.includes(table), `a policy names one table and one command: ${policy}`);
    seen.add(`${table}.${command}`);
    assert.doesNotMatch(policy, /(?:using|with check) \(\s*true\s*\)/u, policy);
    const using = /using \((.*?)\)(?: with check|$)/u.exec(policy)?.[1] ?? '';
    const check = /with check \((.*)\)$/u.exec(policy)?.[1] ?? '';
    if (command === 'select' || command === 'delete') assert.match(policy, /using \(user_id = \(select auth\.uid\(\)\)\)$/u, policy);
    if (command === 'update') assert.equal(using, ownRow, policy);
    if (command === 'insert' || command === 'update') {
      assert.ok(check.startsWith(`${ownRow} and `) || check === ownRow, policy);
      if (recordTables.includes(table)) assert.equal(check, `${ownRow} and ${consentGate}`, policy);
      if (table === 'profiles') {
        assert.equal(check, `${ownRow} and (${consentGate} or (dress_style is null and style_aesthetics = '{}'))`, policy);
      }
      if (table === 'sync_consent_records') assert.equal(check, ownRow, policy);
    }
  }
  for (const table of tables) {
    const commands = table === 'sync_consent_records' ? ['select', 'insert'] : ['select', 'insert', 'update', 'delete'];
    for (const command of commands) assert.ok(seen.has(`${table}.${command}`), `${table} ${command}`);
  }
});

test('withdrawing the consent records the answer first, then deletes the copies and clears the profile fields', () => {
  const body = finalFunction('withdraw_sync_consent');
  assert.match(body, /^create (?:or replace )?function public\.withdraw_sync_consent\(p_text_version text, p_answered_at timestamptz\)/u);
  const insert = body.indexOf("values ((select auth.uid()), p_text_version, 'withdrawn', p_answered_at);");
  assert.ok(insert > 0);
  for (const table of recordTables) {
    const at = body.indexOf(`delete from public.${table} where ${ownRow};`);
    assert.ok(at > insert, table);
  }
  assert.ok(body.indexOf("set dress_style = null, style_aesthetics = '{}'") > insert);
});

const accountLock = "hashtextextended('kuyara.sync:' || (select auth.uid())::text, 0)";

test('a withdrawal and an upload of the same account run one at a time, so no upload lands in a withdrawn account', () => {
  // The withdrawal takes the account's lock alone before anything else, so it either waits for
  // a running upload to commit (its deletes then see the rows) or makes the upload wait.
  const withdraw = finalFunction('withdraw_sync_consent');
  assert.match(withdraw, /\$\$\nbegin\n {2}perform pg_advisory_xact_lock\(([^\n]+)\);\n {2}insert into public\.sync_consent_records /u);
  assert.equal(/perform pg_advisory_xact_lock\(([^\n]+)\);/u.exec(withdraw)[1], accountLock);
  // An upload takes the same lock shared, then reads the consent again in a volatile function
  // (a fresh snapshot), so an upload that waited for a withdrawal is refused.
  const gate = finalFunction('require_sync_consent');
  assert.match(gate, /\nlanguage plpgsql\nvolatile\n/u);
  const lock = gate.indexOf(`perform pg_advisory_xact_lock_shared(${accountLock});`);
  assert.ok(lock > 0);
  const recheck = gate.indexOf("if not public.has_sync_consent() then\n    raise exception 'sync consent withdrawn' using errcode = '42501';");
  assert.ok(recheck > lock);
  assert.match(code, /revoke all on function public\.require_sync_consent\(\) from public, anon, authenticated;/u);
  // Before insert, so the lock comes before any row lock of the upsert and the two never wait on
  // each other; every record table, and a profile write that sets a field needing the consent.
  for (const table of recordTables) {
    assert.equal(schema.triggers.get(`${table}.${table}_sync_consent`), `create trigger ${table}_sync_consent\n`
      + `  before insert on public.${table}\n  for each statement execute function public.require_sync_consent()`, table);
  }
  assert.equal(schema.triggers.get('profiles.profiles_sync_consent'), 'create trigger profiles_sync_consent\n'
    + '  before insert or update on public.profiles\n'
    + "  for each row when (new.dress_style is not null or new.style_aesthetics <> '{}')\n"
    + '  execute function public.require_sync_consent()');
});

test('the functions the app and the Worker call exist with the parameters they send', () => {
  // supabase-account-remote.ts calls withdraw_sync_consent; apps/worker supabase-keep-alive.ts
  // calls keep_alive with an empty body.
  assert.match(finalFunction('withdraw_sync_consent'), /^create (?:or replace )?function public\.withdraw_sync_consent\(p_text_version text, p_answered_at timestamptz\)/u);
  assert.match(code, /grant execute on function public\.withdraw_sync_consent\(text, timestamptz\) to authenticated;/u);
  assert.match(finalFunction('keep_alive'), /^create (?:or replace )?function public\.keep_alive\(\)/u);
  assert.match(code, /grant execute on function public\.keep_alive\(\) to service_role;/u);
  assert.doesNotMatch(code, /grant execute on function public\.keep_alive\(\) to (?:authenticated|anon|public)/u);
  assert.equal(schema.functions.has('purge_withdrawn_sync_copies'), false);
});

test('each record table keeps its cursor index, and the profile, found by its key, has none', () => {
  for (const table of recordTables) {
    assert.ok(schema.indexes.has(`${table}_user_server_updated_at`), table);
  }
  assert.equal(schema.indexes.has('profiles_user_server_updated_at'), false);
});

test('every cap check holds its account\'s lock alone before it counts, so parallel uploads cannot pass a cap together', () => {
  // A count sees committed rows and its own transaction's, never another upload's uncommitted
  // rows, so two uploads that each fit the cap could both commit past it. Each check first takes
  // a transaction advisory lock of the account alone: the second upload waits for the first to
  // commit and then counts its rows too. The record tables share one lock per account, so uploads
  // to different tables also measure the account's size one after the other.
  const caps = {
    enforce_user_row_cap: "hashtextextended('kuyara.row_cap:' || auth.uid()::text, 0)",
    enforce_consent_record_cap: "hashtextextended('kuyara.consent_records:' || auth.uid()::text, 0)",
  };
  for (const [name, key] of Object.entries(caps)) {
    const body = finalFunction(name);
    const lock = body.indexOf(`perform pg_advisory_xact_lock(${key});`);
    assert.ok(lock > 0, name);
    assert.ok(lock < body.indexOf('select count(*)'), name);
    assert.doesNotMatch(body, /pg_advisory_xact_lock_shared/u, name);
  }
  const userCap = finalFunction('enforce_user_row_cap');
  assert.ok(userCap.indexOf('pg_advisory_xact_lock(') < userCap.indexOf('pg_database_size'));
  // Every capped table checks through one of the two functions.
  for (const table of recordTables) {
    assert.match(schema.triggers.get(`${table}.${table}_row_cap`) ?? '', /execute function public\.enforce_user_row_cap\('\d+'\)$/u, table);
  }
  assert.match(schema.triggers.get('sync_consent_records.sync_consent_records_row_cap') ?? '', /execute function public\.enforce_consent_record_cap\(\)$/u);
});
