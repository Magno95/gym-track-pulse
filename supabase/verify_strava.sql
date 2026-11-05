-- Read-only checks after applying both Strava migrations.
SELECT count(*) = 5 AS five_tables,
  bool_and(c.relrowsecurity) AS rls_enabled,
  bool_and(NOT has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS browser_roles_blocked,
  bool_and(has_table_privilege('service_role', c.oid, 'SELECT')
    AND has_table_privilege('service_role', c.oid, 'INSERT')
    AND has_table_privilege('service_role', c.oid, 'UPDATE')
    AND has_table_privilege('service_role', c.oid, 'DELETE')) AS backend_access,
  NOT has_function_privilege('anon', 'public.claim_strava_lock(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.claim_strava_lock(uuid,uuid)', 'EXECUTE') AS lock_rpc_private
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('strava_connections', 'strava_oauth_states', 'strava_publications', 'strava_locks', 'strava_imports');

SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20261105000000', '20261105001000') ORDER BY version;
