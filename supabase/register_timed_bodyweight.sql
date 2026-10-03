-- Only after applying and verifying 20261003002000 manually in Lovable Cloud.
-- Supabase CLI db push records migration history automatically.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.exercises'::regclass
      AND conname = 'bodyweight_requires_supported_unit' AND convalidated)
    OR NOT public.valid_session_sets('[{"reps":60,"weight":80,"body_weight":80,"additional_weight":0,"duration_seconds":60}]'::jsonb)
    OR public.valid_session_sets('[{"reps":60,"weight":80,"body_weight":80,"additional_weight":0,"duration_seconds":61}]'::jsonb)
  THEN
    RAISE EXCEPTION 'Apply and verify 20261003002000 before registering it';
  END IF;
END;
$$;
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20261003002000') ON CONFLICT (version) DO NOTHING;
COMMIT;
