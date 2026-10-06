-- kuyara optional accounts: cap checks that parallel uploads cannot pass together (ADR 0041,
-- section 4). Runs once, after 20261005090000_account_hardening.sql, as one script: it replaces
-- the two cap functions and keeps every trigger, bound, cap and row.
--
-- A cap check counts the rows it can see: the committed ones and its own transaction's, never
-- another transaction's uncommitted rows. Two uploads of one account that each fit under a cap
-- could both pass and both commit past it, and the same holds for the database size guard and the
-- consent answers cap. So each check first takes a transaction advisory lock of the account (and,
-- for the record tables, of the table) alone, and only then reads the size and counts. A second
-- upload of the same account and table waits for the first to commit, then counts with a fresh
-- snapshot (each statement of a plpgsql function takes its own under read committed), which
-- includes the first upload's rows. The lock is released at commit or rollback.
--
-- The lock is taken after the insert, in the statement trigger, so the uploads themselves still
-- run side by side; only the counts are one at a time. No transaction holds two of these locks:
-- the app writes one table per request, and a consent withdrawal inserts only a consent answer.
-- The upload's shared lock of 20261005090000_account_hardening.sql is a different key, so a
-- withdrawal and an upload still wait for each other only through that one.
--
-- The secret key (no auth.uid()) takes no lock and is not limited, as before.
create or replace function public.enforce_user_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended('kuyara.row_cap:' || tg_table_name || ':' || auth.uid()::text, 0));
  end if;
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

create or replace function public.enforce_consent_record_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended('kuyara.consent_records:' || auth.uid()::text, 0));
  end if;
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
