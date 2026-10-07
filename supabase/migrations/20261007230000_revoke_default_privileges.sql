-- Objects created later in public start with no access for anon and authenticated. Supabase's
-- default privileges grant both roles everything on new tables, sequences and functions, so a
-- future migration that forgot its revokes would expose the new object to the API; functions are
-- also executable by public unless revoked. Each migration now grants exactly what it needs.
-- Existing objects and their grants are unchanged, and service_role keeps its default access.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
