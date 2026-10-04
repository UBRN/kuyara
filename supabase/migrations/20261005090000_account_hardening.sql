-- kuyara optional accounts: tighter size bounds and row caps, a database size guard, uploads that
-- cannot race a consent withdrawal, and one index fewer (ADR 0041, sections 4, 10, 11 and 12).
-- Runs once, after 20261004120000_accounts.sql, as one script: every statement replaces or drops
-- an object of that file and keeps every row. Written while no account holds any row.

-- Size bounds at the app's real maximum with a margin, in bytes (UTF-8, up to 4 bytes a character).
-- The other bounds of 20261004120000_accounts.sql stay as they are.
-- - worn outfit: every one of the ten slots filled with the longest garment type
--   (`long_sleeve_t_shirt`), with the longest archetype (`weekend_relaxed`), dress style and
--   source, printed as Postgres prints jsonb (a space after each colon and comma): 441 bytes: 1024.
-- - piece colours: the ten slots, each with the longest swatch (`blackdenim`): 255 bytes: 512.
-- - Closet name: at most 200 characters in the app (WARDROBE_NAME_MAX_LENGTH): 800.
-- - Closet colour text: no screen writes it; it is held to the name's bound: 800.
alter table public.outfit_history drop constraint if exists outfit_history_bounds;
alter table public.outfit_history add constraint outfit_history_bounds check (
  octet_length(day_key) <= 64 and octet_length(outfit_json::text) <= 1024 and octet_length(piece_colors_json::text) <= 512
);

alter table public.wardrobe_items drop constraint if exists wardrobe_items_bounds;
alter table public.wardrobe_items add constraint wardrobe_items_bounds check (
  octet_length(name) <= 800 and octet_length(color) <= 800 and octet_length(category) <= 64
  and octet_length(entry_state) <= 64 and octet_length(garment_type_id) <= 64 and octet_length(color_family) <= 64
  and octet_length(color_option_id) <= 64 and octet_length(color_custom_hex) <= 16
  and octet_length(thermal_level_override) <= 64 and octet_length(water_protection_override) <= 64
  and octet_length(wind_protection_override) <= 64 and octet_length(breathability_override) <= 64
  and octet_length(arm_coverage_override) <= 64 and octet_length(leg_coverage_override) <= 64
  and octet_length(traction_suitability_override) <= 64
);

-- Rows one user may hold in each table, tombstones included: 2000 Closet pieces (a large
-- wardrobe and years of removed pieces), 7300 History looks (two a day for ten years), and 7300
-- daily choices and 7300 departures (a day and its evening for ten years). The consent answers
-- keep their cap of 401.
--
-- One account's worst case at these caps and bounds, with row and index overhead: Closet
-- 2000 x 2 KB = 4 MB, History 7300 x 1.7 KB = 12.4 MB, choices and departures 7300 x 0.45 KB
-- each = 6.6 MB, consent answers 401 x 0.2 KB = 0.1 MB, about 23 MB in all.
--
-- The caps bound one account, not many. Supabase's Free plan makes the whole database read-only
-- past 500 MB ("Free Plan projects enter read-only mode when your database size exceeds 500 MB",
-- https://supabase.com/docs/guides/platform/database-size, read on 4 October 2026), which would
-- stop account deletion too. So the cap check also refuses any insert or upsert by a signed-in
-- person once the database is past 400 MB: the 100 MB left holds more than four accounts' worst
-- case, and deleting rows, withdrawing the consent and deleting the account keep working.
-- Deleting rows does not shrink the database files, so after the abusing accounts are deleted
-- the space is reclaimed with `vacuum full` of the affected public tables (or pg_repack), and
-- `select pg_database_size(current_database())` confirms the size is back under 400 MB; until
-- then every signed-in insert or upsert stays refused.
create or replace function public.enforce_user_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  if auth.uid() is not null and pg_database_size(current_database()) > 400 * 1024 * 1024 then
    raise exception 'database size guard reached' using errcode = '53100';
  end if;
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into held using auth.uid();
  if held > tg_argv[0]::bigint then
    raise exception 'row cap reached' using errcode = '54000';
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_user_row_cap() from public, anon, authenticated;

drop trigger if exists wardrobe_items_row_cap on public.wardrobe_items;
create trigger wardrobe_items_row_cap
  after insert on public.wardrobe_items
  for each statement execute function public.enforce_user_row_cap('2000');
drop trigger if exists outfit_history_row_cap on public.outfit_history;
create trigger outfit_history_row_cap
  after insert on public.outfit_history
  for each statement execute function public.enforce_user_row_cap('7300');
drop trigger if exists dressing_day_choices_row_cap on public.dressing_day_choices;
create trigger dressing_day_choices_row_cap
  after insert on public.dressing_day_choices
  for each statement execute function public.enforce_user_row_cap('7300');
drop trigger if exists dressing_day_departures_row_cap on public.dressing_day_departures;
create trigger dressing_day_departures_row_cap
  after insert on public.dressing_day_departures
  for each statement execute function public.enforce_user_row_cap('7300');

-- An upload and a consent withdrawal of the same account run one at a time, so no upload commits
-- a copy into a withdrawn account. Without this, rows an upload inserted before the withdrawal
-- and committed after it are invisible to the withdrawal's deletes and survive. The withdrawal
-- holds the account's lock alone for its whole transaction; every upload of a record, and every
-- profile write that sets a field needing the consent, holds it shared before it touches a row
-- and then reads the consent again with a fresh snapshot (the trigger function is volatile, so
-- each statement in it sees what has committed by then). Read committed, both orders:
-- - the withdrawal locks first: the upload waits, then reads the withdrawn answer and is refused
--   whole;
-- - the upload locks first: the withdrawal waits until the upload commits, and its deletes then
--   see and remove the uploaded rows.
-- The upload takes the lock before any row lock (a statement trigger before insert, and for a
-- profile a row trigger before insert, which the app's upsert fires before its conflict check),
-- so the two never wait on each other. The secret key (no auth.uid()) is not limited, as row
-- level security does not limit it.
create or replace function public.withdraw_sync_consent(p_text_version text, p_answered_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('kuyara.sync:' || (select auth.uid())::text, 0));
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

create function public.require_sync_consent()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('kuyara.sync:' || (select auth.uid())::text, 0));
  if not public.has_sync_consent() then
    raise exception 'sync consent withdrawn' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.require_sync_consent() from public, anon, authenticated;

create trigger wardrobe_items_sync_consent
  before insert on public.wardrobe_items
  for each statement execute function public.require_sync_consent();
create trigger outfit_history_sync_consent
  before insert on public.outfit_history
  for each statement execute function public.require_sync_consent();
create trigger dressing_day_choices_sync_consent
  before insert on public.dressing_day_choices
  for each statement execute function public.require_sync_consent();
create trigger dressing_day_departures_sync_consent
  before insert on public.dressing_day_departures
  for each statement execute function public.require_sync_consent();
create trigger profiles_sync_consent
  before insert or update on public.profiles
  for each row when (new.dress_style is not null or new.style_aesthetics <> '{}')
  execute function public.require_sync_consent();

-- A profile is one row per user, found through its primary key; this index served no query.
drop index if exists public.profiles_user_server_updated_at;
