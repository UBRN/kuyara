-- kuyara optional accounts: a database size guard that a few accounts cannot trip for every member
-- (ADR 0041, section 3). Runs once, after 20261007230000_revoke_default_privileges.sql, as one
-- script: it replaces public.enforce_user_row_cap, adds its update triggers and keeps every bound,
-- cap and row.
--
-- One account at its caps takes 33.4 MB of disk (measured), so thirteen of them took an empty project
-- past the 400 MB guard, and every member's upload was refused from then on. Now:
-- - past 200 MB, an insert or update is refused when the account holds more than 1 MB of rows in
--   the four record tables, the statement's own rows included;
-- - past 400 MB, every signed-in insert or update is refused, short of the Free plan's 500 MB.
-- Updates are judged as inserts are, so rows inserted small cannot be rewritten large past either
-- step; an upsert fires both triggers. The lock is one per account, not per table, so an account's
-- statements on different tables cannot pass the allowance together. A refusal keeps the guard's
-- error, which installed apps treat as a failed request. The secret key (no auth.uid()) is not limited.
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

drop trigger if exists wardrobe_items_row_cap_update on public.wardrobe_items;
create trigger wardrobe_items_row_cap_update
  after update on public.wardrobe_items
  for each statement execute function public.enforce_user_row_cap('2000');
drop trigger if exists outfit_history_row_cap_update on public.outfit_history;
create trigger outfit_history_row_cap_update
  after update on public.outfit_history
  for each statement execute function public.enforce_user_row_cap('7300');
drop trigger if exists dressing_day_choices_row_cap_update on public.dressing_day_choices;
create trigger dressing_day_choices_row_cap_update
  after update on public.dressing_day_choices
  for each statement execute function public.enforce_user_row_cap('7300');
drop trigger if exists dressing_day_departures_row_cap_update on public.dressing_day_departures;
create trigger dressing_day_departures_row_cap_update
  after update on public.dressing_day_departures
  for each statement execute function public.enforce_user_row_cap('7300');
