-- Only after manually applying and verifying 20261003003000 in Lovable Cloud.
-- Supabase CLI db push records migration history automatically.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Exercise images are publicly accessible')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Owners read exercise image metadata' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[] AND qual LIKE '%owner_id%' AND qual LIKE '%auth.uid%')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Exercise image metadata requires ownership' AND permissive = 'RESTRICTIVE'
      AND qual LIKE '%current_user%' AND qual LIKE '%owner_id%')
  THEN
    RAISE EXCEPTION 'Apply and verify 20261003003000 before registering it';
  END IF;
END;
$$;
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20261003003000') ON CONFLICT (version) DO NOTHING;
COMMIT;
