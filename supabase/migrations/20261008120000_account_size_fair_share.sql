-- kuyara optional accounts: a database size guard that a few accounts cannot trip for every member
-- (ADR 0041, section 3). Runs once, after 20261007230000_revoke_default_privileges.sql, as one
-- script: it replaces public.enforce_user_row_cap and keeps every trigger, bound, cap and row.
--
-- One account filled to its caps with incompressible values takes 33.4 MB of disk, rows, indexes
-- and TOAST together: History 15.6 MB, Closet 6.2 MB, daily choices 6.4 MB, departures 5.0 MB and
-- consent answers 0.2 MB (measured on copies of the tables). Thirteen such accounts take an empty
-- project past the 400 MB guard, and from then on every signed-in upload is refused, every member's
-- alike, until the accounts are deleted by hand.
--
-- So the guard has two steps:
-- - Past 200 MB, an upload is refused when the uploading account holds more than 1 MB of rows
--   (pg_column_size of its rows in the four record tables, the upload's own rows included). The
--   app's largest rows, two looks every day with every slot filled and a daily choice and
--   departure, come to 0.73 MB a year, so a member stays under it for more than a year at that
--   extreme and several years in ordinary use, while an account at its caps holds 30 MB. An
--   account under 1 MB costs at most 2.6 MB of disk (the smallest rows, deletion markers, have the
--   largest index and page overhead per byte, and the 401 consent answers are counted in full), so
--   the 200 MB between the two steps holds at least 75 such accounts.
-- - Past 400 MB, every signed-in insert or upsert is refused, as before, short of the Free plan's
--   500 MB read-only limit. Supabase measures that limit over every database of the project, so
--   the two template databases' 15 MB count against the 100 MB margin.
-- Below 200 MB nothing changes and no account size is read. A refusal keeps the guard's error, so
-- an installed app treats it as before: a failed sync request, tried again later.
--
-- The check now holds one lock per account instead of one per account and table, so the
-- account's uploads to different tables also measure one after the other and cannot pass the
-- 1 MB allowance together; a transaction that writes two tables takes the same lock twice, so
-- the cap checks still cannot wait on each other. The secret key (no auth.uid()) takes no lock and
-- is not limited, as before.
create or replace function public.enforce_user_row_cap()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
  database_bytes bigint;
  account_bytes bigint;
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended('kuyara.row_cap:' || auth.uid()::text, 0));
    database_bytes := pg_database_size(current_database());
    if database_bytes > 400 * 1024 * 1024 then
      raise exception 'database size guard reached' using errcode = '53100';
    end if;
    if database_bytes > 200 * 1024 * 1024 then
      select coalesce(sum(row_bytes), 0) into account_bytes from (
        select pg_column_size(r.*) as row_bytes from public.wardrobe_items r where r.user_id = auth.uid()
        union all select pg_column_size(r.*) from public.outfit_history r where r.user_id = auth.uid()
        union all select pg_column_size(r.*) from public.dressing_day_choices r where r.user_id = auth.uid()
        union all select pg_column_size(r.*) from public.dressing_day_departures r where r.user_id = auth.uid()
      ) account_rows;
      if account_bytes > 1024 * 1024 then
        raise exception 'database size guard reached' using errcode = '53100';
      end if;
    end if;
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
