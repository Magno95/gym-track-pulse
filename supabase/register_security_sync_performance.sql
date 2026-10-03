-- Only for a migration executed manually in Lovable Cloud's SQL editor.
-- Apply both 20261003000000 and 20261003001000, then run
-- verify_security_sync_performance.sql and confirm all checks are true.
-- This records migration history; it does not apply the migration.
-- Supabase CLI db push already registers migrations automatically.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('public.get_exercise_overview(uuid)') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.sessions'::regclass
      AND attname = 'value_multiplier' AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sessions'::regclass
      AND tgname = 'derive_session_values' AND tgenabled = 'O')
    OR has_function_privilege('anon', to_regprocedure('public.get_exercise_overview(uuid)'), 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Apply and verify migrations 20261003000000 and 20261003001000 before registering them';
  END IF;
END;
$$;
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20261003000000'), ('20261003001000') ON CONFLICT (version) DO NOTHING;
COMMIT;
