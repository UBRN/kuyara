-- kuyara optional accounts: remote schema (ADR 0041, sections 3, 4, 10, 11 and 12).
-- Not idempotent: applied once to the project, in one transaction.

-- Written by a trigger on every insert and update, so a client value never survives. Pulls
-- order rows by it (arrival at the server), never by a device clock.
create function public.set_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_server_updated_at() from public, anon, authenticated;

-- Size bounds. Every text, jsonb and array column carries a bound, so no row grows without
-- limit; a row past one is refused and the phone reports a sync failure. Each bound is the app's
-- own maximum with a wide margin, in bytes (UTF-8, up to 4 bytes a character):
-- - identifiers (gender, dress style, category, entry state, garment type, colour family and
--   option, the overrides, formality, source): closed lists whose longest member has 21 ASCII
--   characters (`long_sleeve_t_shirt`): 64.
-- - display name: 2 to 30 characters in the app, at most 120 bytes: 480.
-- - Closet name and colour: free text with no limit in the app; a garment name is a few words:
--   2000 (500 four-byte characters).
-- - custom colour: `#RRGGBB`, 7 characters: 16.
-- - day key: `YYYY-MM-DD` or `YYYY-MM-DD:evening`, 18 characters: 64.
-- - time zone: an IANA name, at most 100 characters in the weather contract: 256.
-- - style aesthetics: at most 3 of 5 known values, each at most 10 characters: 12 entries and
--   256 bytes together.
-- - worn outfit and piece colours: every one of the ten slots filled with the longest garment
--   type and the longest archetype gives 415 bytes of JSON, more than any real look: 4096.
-- - consent text version: a date, 10 characters: 64.

-- One row per user, keyed by user_id. Dress style and aesthetics are stored only with the sync
-- consent (the policies below); birth date and device settings never reach this table.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  gender text,
  dress_style text,
  style_aesthetics text[] not null default '{}',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz check (deleted_at is null),
  server_updated_at timestamptz not null,
  constraint profiles_bounds check (
    octet_length(display_name) <= 480 and octet_length(gender) <= 64 and octet_length(dress_style) <= 64
    and cardinality(style_aesthetics) <= 12 and octet_length(array_to_string(style_aesthetics, ',')) <= 256
  )
);

-- Each record table is keyed by (user_id, id): a phone keeps its record UUIDs when it links to
-- another account, and every account holds its own copy under them. The day-keyed tables hold
-- one row per user and day besides.

create table public.wardrobe_items (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text,
  category text,
  entry_state text,
  garment_type_id text,
  color text,
  color_family text,
  color_option_id text,
  color_custom_hex text,
  thermal_level_override text,
  water_protection_override text,
  wind_protection_override text,
  breathability_override text,
  arm_coverage_override text,
  leg_coverage_override text,
  traction_suitability_override text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null,
  constraint wardrobe_items_pkey primary key (user_id, id),
  constraint wardrobe_items_live_content check (deleted_at is not null or (category is not null and entry_state is not null)),
  constraint wardrobe_items_bounds check (
    octet_length(name) <= 2000 and octet_length(color) <= 2000 and octet_length(category) <= 64
    and octet_length(entry_state) <= 64 and octet_length(garment_type_id) <= 64 and octet_length(color_family) <= 64
    and octet_length(color_option_id) <= 64 and octet_length(color_custom_hex) <= 16
    and octet_length(thermal_level_override) <= 64 and octet_length(water_protection_override) <= 64
    and octet_length(wind_protection_override) <= 64 and octet_length(breathability_override) <= 64
    and octet_length(arm_coverage_override) <= 64 and octet_length(leg_coverage_override) <= 64
    and octet_length(traction_suitability_override) <= 64
  )
);

create table public.dressing_day_choices (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_key text not null,
  formality text,
  source text,
  style_aesthetics text[],
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null,
  constraint dressing_day_choices_pkey primary key (user_id, id),
  constraint dressing_day_choices_user_day_key unique (user_id, day_key),
  constraint dressing_day_choices_live_content check (deleted_at is not null or (formality is not null and source is not null)),
  constraint dressing_day_choices_bounds check (
    octet_length(day_key) <= 64 and octet_length(formality) <= 64 and octet_length(source) <= 64
    and cardinality(style_aesthetics) <= 12 and octet_length(array_to_string(style_aesthetics, ',')) <= 256
  )
);

create table public.dressing_day_departures (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_key text not null,
  departure_at timestamptz,
  time_zone text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null,
  constraint dressing_day_departures_pkey primary key (user_id, id),
  constraint dressing_day_departures_user_day_key unique (user_id, day_key),
  constraint dressing_day_departures_live_content check (deleted_at is not null or (departure_at is not null and time_zone is not null)),
  constraint dressing_day_departures_bounds check (octet_length(day_key) <= 64 and octet_length(time_zone) <= 256)
);

create table public.outfit_history (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  day_key text not null,
  outfit_json jsonb,
  piece_colors_json jsonb,
  worn_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null,
  constraint outfit_history_pkey primary key (user_id, id),
  constraint outfit_history_live_content check (deleted_at is not null or (outfit_json is not null and worn_at is not null)),
  constraint outfit_history_bounds check (
    octet_length(day_key) <= 64 and octet_length(outfit_json::text) <= 4096 and octet_length(piece_colors_json::text) <= 4096
  )
);

-- Every answer is kept and never edited: the proof of the consent. answered_at is the client's
-- clock; recorded_at is the server's and is not writable by the app (column grants below).
create table public.sync_consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text_version text not null,
  answer text not null check (answer in ('given', 'withdrawn')),
  answered_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint sync_consent_records_bounds check (octet_length(text_version) <= 64)
);

create index sync_consent_records_latest
  on public.sync_consent_records (user_id, recorded_at desc, id desc);

-- A generous cap on the rows one user holds in each table, so no account grows without bound:
-- 5000 Closet pieces, 20000 History looks (several looks a day for years), 20000 daily choices
-- and 20000 departures (one a day, tombstones included, for more than 50 years), and 400 consent
-- answers. It runs once per statement after the insert and counts the caller's rows, so an
-- upsert that only rewrites rows the account already holds always passes, and a batch that
-- would cross the cap is refused whole.
create function public.enforce_user_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into held using auth.uid();
  if held > tg_argv[0]::bigint then
    raise exception 'row cap reached' using errcode = '54000';
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_user_row_cap() from public, anon, authenticated;

create trigger wardrobe_items_row_cap
  after insert on public.wardrobe_items
  for each statement execute function public.enforce_user_row_cap('5000');
create trigger outfit_history_row_cap
  after insert on public.outfit_history
  for each statement execute function public.enforce_user_row_cap('20000');
create trigger dressing_day_choices_row_cap
  after insert on public.dressing_day_choices
  for each statement execute function public.enforce_user_row_cap('20000');
create trigger dressing_day_departures_row_cap
  after insert on public.dressing_day_departures
  for each statement execute function public.enforce_user_row_cap('20000');

-- The consent answers cap only refuses a statement that inserts a 'given' record past 400: a
-- withdrawal always lands, so consent can be withdrawn however many answers an account holds.
create function public.enforce_consent_record_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  select count(*) into held from public.sync_consent_records where user_id = auth.uid();
  -- Past the cap only a single withdrawal of a consent that is still given lands, so a
  -- withdrawal always works and the table stays bounded.
  if held > 400 and (
    exists (select 1 from inserted_records where answer = 'given')
    or (select count(*) from inserted_records) > 1
    or coalesce((
      select r.answer from public.sync_consent_records r
      where r.user_id = auth.uid() and r.id not in (select id from inserted_records)
      order by r.recorded_at desc, r.id desc
      limit 1
    ), '') <> 'given'
  ) then
    raise exception 'row cap reached' using errcode = '54000';
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_consent_record_cap() from public, anon, authenticated;

create trigger sync_consent_records_row_cap
  after insert on public.sync_consent_records
  referencing new table as inserted_records
  for each statement execute function public.enforce_consent_record_cap();

create index profiles_user_server_updated_at on public.profiles (user_id, server_updated_at);
create trigger profiles_server_updated_at
  before insert or update on public.profiles
  for each row execute function public.set_server_updated_at();

create index wardrobe_items_user_server_updated_at on public.wardrobe_items (user_id, server_updated_at);
create trigger wardrobe_items_server_updated_at
  before insert or update on public.wardrobe_items
  for each row execute function public.set_server_updated_at();

create index dressing_day_choices_user_server_updated_at on public.dressing_day_choices (user_id, server_updated_at);
create trigger dressing_day_choices_server_updated_at
  before insert or update on public.dressing_day_choices
  for each row execute function public.set_server_updated_at();

create index dressing_day_departures_user_server_updated_at on public.dressing_day_departures (user_id, server_updated_at);
create trigger dressing_day_departures_server_updated_at
  before insert or update on public.dressing_day_departures
  for each row execute function public.set_server_updated_at();

create index outfit_history_user_server_updated_at on public.outfit_history (user_id, server_updated_at);
create trigger outfit_history_server_updated_at
  before insert or update on public.outfit_history
  for each row execute function public.set_server_updated_at();

-- A soft-deleted row keeps no content on the server: it stays a tombstone (id, owner, day key,
-- clocks) so other phones learn the deletion, and every content column is cleared. A live row
-- must still carry the columns the pull requires (the *_live_content checks above).

create function public.wardrobe_items_clear_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.name := null;
    new.category := null;
    new.entry_state := null;
    new.garment_type_id := null;
    new.color := null;
    new.color_family := null;
    new.color_option_id := null;
    new.color_custom_hex := null;
    new.thermal_level_override := null;
    new.water_protection_override := null;
    new.wind_protection_override := null;
    new.breathability_override := null;
    new.arm_coverage_override := null;
    new.leg_coverage_override := null;
    new.traction_suitability_override := null;
  end if;
  return new;
end;
$$;

revoke all on function public.wardrobe_items_clear_tombstone() from public, anon, authenticated;

create trigger wardrobe_items_clear_tombstone
  before insert or update on public.wardrobe_items
  for each row execute function public.wardrobe_items_clear_tombstone();

create function public.dressing_day_choices_clear_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.formality := null;
    new.source := null;
    new.style_aesthetics := null;
  end if;
  return new;
end;
$$;

revoke all on function public.dressing_day_choices_clear_tombstone() from public, anon, authenticated;

create trigger dressing_day_choices_clear_tombstone
  before insert or update on public.dressing_day_choices
  for each row execute function public.dressing_day_choices_clear_tombstone();

create function public.dressing_day_departures_clear_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.departure_at := null;
    new.time_zone := null;
  end if;
  return new;
end;
$$;

revoke all on function public.dressing_day_departures_clear_tombstone() from public, anon, authenticated;

create trigger dressing_day_departures_clear_tombstone
  before insert or update on public.dressing_day_departures
  for each row execute function public.dressing_day_departures_clear_tombstone();

create function public.outfit_history_clear_tombstone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    new.outfit_json := null;
    new.piece_colors_json := null;
    new.worn_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.outfit_history_clear_tombstone() from public, anon, authenticated;

create trigger outfit_history_clear_tombstone
  before insert or update on public.outfit_history
  for each row execute function public.outfit_history_clear_tombstone();

-- True when the caller's latest consent answer is 'given'. Runs as the caller, so the policy on
-- sync_consent_records limits it to the caller's own records.
create function public.has_sync_consent()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select answer = 'given'
    from public.sync_consent_records
    where user_id = (select auth.uid())
    order by recorded_at desc, id desc
    limit 1
  ), false);
$$;

revoke all on function public.has_sync_consent() from public, anon;
grant execute on function public.has_sync_consent() to authenticated;

-- Supabase grants anon and authenticated everything on new objects by default privileges, so
-- the revokes are explicit. service_role keeps its default access.

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.wardrobe_items from public, anon, authenticated;
revoke all on table public.dressing_day_choices from public, anon, authenticated;
revoke all on table public.dressing_day_departures from public, anon, authenticated;
revoke all on table public.outfit_history from public, anon, authenticated;
revoke all on table public.sync_consent_records from public, anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.wardrobe_items to authenticated;
grant select, insert, update, delete on table public.dressing_day_choices to authenticated;
grant select, insert, update, delete on table public.dressing_day_departures to authenticated;
grant select, insert, update, delete on table public.outfit_history to authenticated;
grant select on table public.sync_consent_records to authenticated;
grant insert (user_id, text_version, answer, answered_at) on table public.sync_consent_records to authenticated;

alter table public.profiles enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.dressing_day_choices enable row level security;
alter table public.dressing_day_departures enable row level security;
alter table public.outfit_history enable row level security;
alter table public.sync_consent_records enable row level security;

create policy wardrobe_items_select_own on public.wardrobe_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy wardrobe_items_insert_own on public.wardrobe_items
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy wardrobe_items_update_own on public.wardrobe_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy wardrobe_items_delete_own on public.wardrobe_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy dressing_day_choices_select_own on public.dressing_day_choices
  for select to authenticated using (user_id = (select auth.uid()));
create policy dressing_day_choices_insert_own on public.dressing_day_choices
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy dressing_day_choices_update_own on public.dressing_day_choices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy dressing_day_choices_delete_own on public.dressing_day_choices
  for delete to authenticated using (user_id = (select auth.uid()));

create policy dressing_day_departures_select_own on public.dressing_day_departures
  for select to authenticated using (user_id = (select auth.uid()));
create policy dressing_day_departures_insert_own on public.dressing_day_departures
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy dressing_day_departures_update_own on public.dressing_day_departures
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy dressing_day_departures_delete_own on public.dressing_day_departures
  for delete to authenticated using (user_id = (select auth.uid()));

create policy outfit_history_select_own on public.outfit_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy outfit_history_insert_own on public.outfit_history
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy outfit_history_update_own on public.outfit_history
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.has_sync_consent()));
create policy outfit_history_delete_own on public.outfit_history
  for delete to authenticated using (user_id = (select auth.uid()));

create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()) and ((select public.has_sync_consent()) or (dress_style is null and style_aesthetics = '{}')));
create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and ((select public.has_sync_consent()) or (dress_style is null and style_aesthetics = '{}')));
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- No update or delete policy and no such grant: a consent record is never edited.
create policy sync_consent_records_select_own on public.sync_consent_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy sync_consent_records_insert_own on public.sync_consent_records
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Giving consent is a plain insert of a 'given' record by the app. Withdrawing is one
-- transaction: the record first (so the gate closes), then the copies, then the profile fields
-- that need the consent. Rows are deleted outright, not soft-deleted.
create function public.withdraw_sync_consent(p_text_version text, p_answered_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.sync_consent_records (user_id, text_version, answer, answered_at)
  values ((select auth.uid()), p_text_version, 'withdrawn', p_answered_at);
  delete from public.wardrobe_items where user_id = (select auth.uid());
  delete from public.dressing_day_choices where user_id = (select auth.uid());
  delete from public.dressing_day_departures where user_id = (select auth.uid());
  delete from public.outfit_history where user_id = (select auth.uid());
  update public.profiles
    set dress_style = null, style_aesthetics = '{}'
    where user_id = (select auth.uid());
end;
$$;

revoke all on function public.withdraw_sync_consent(text, timestamptz) from public, anon, authenticated;
grant execute on function public.withdraw_sync_consent(text, timestamptz) to authenticated;

-- The Worker's daily keep-alive call (secret key only): a constant, no table is read.
create function public.keep_alive()
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keep_alive() from public, anon, authenticated;
grant execute on function public.keep_alive() to service_role;
