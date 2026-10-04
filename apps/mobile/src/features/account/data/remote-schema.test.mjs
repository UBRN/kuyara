import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

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

// The remote schema is a SQL file applied by hand, so this test is the only
// thing that keeps it in step with the record shapes the app reads and writes.
const sqlPath = path.join(import.meta.dirname, '../../../../../../supabase/migrations/20261004120000_accounts.sql');
const sql = readFileSync(sqlPath, 'utf8');
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

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
    const body = tableBody(table);
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

test('each record table and the consent records cap the rows one user holds', () => {
  const caps = { wardrobe_items: 5000, outfit_history: 20000, dressing_day_choices: 20000, dressing_day_departures: 20000 };
  for (const [table, cap] of Object.entries(caps)) {
    assert.match(code, new RegExp(`create trigger ${table}_row_cap\\n\\s+after insert on public\\.${table}\\n`
      + `\\s+for each statement execute function public\\.enforce_user_row_cap\\('${cap}'\\);`, 'u'), table);
  }
  assert.match(code, /raise exception 'row cap reached' using errcode = '54000';/u);
});

test('past 400 consent answers only one withdrawal of a still given consent lands, so withdrawal works and the table stays bounded', () => {
  assert.match(code, new RegExp('create trigger sync_consent_records_row_cap\\n\\s+after insert on public\\.sync_consent_records\\n'
    + '\\s+referencing new table as inserted_records\\n'
    + '\\s+for each statement execute function public\\.enforce_consent_record_cap\\(\\);', 'u'));
  const body = code.match(/create function public\.enforce_consent_record_cap\(\)[\s\S]*?\n\$\$;/u)?.[0] ?? '';
  assert.match(body, /if held > 400 and \(\s+exists \(select 1 from inserted_records where answer = 'given'\)\s+or \(select count\(\*\) from inserted_records\) > 1\s+or coalesce\(/u);
  assert.match(body, /\), ''\) <> 'given'\s+\) then\s+raise exception 'row cap reached' using errcode = '54000';/u);
  assert.doesNotMatch(code, /enforce_user_row_cap\('400'\)/u);
});
