-- Read-only verification after 20261003000000_security_sync_performance.sql
-- and 20261003001000_overview_rpc_permissions.sql.
-- Run in Lovable Cloud > SQL editor. Every row must have ok = true.
-- The migration deliberately leaves historical CHECK constraints NOT VALID.
WITH checks(check_name, ok) AS (
  VALUES
  ('overview RPC exists', to_regprocedure('public.get_exercise_overview(uuid)') IS NOT NULL),
  ('overview respects caller RLS', EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.get_exercise_overview(uuid)') AND NOT prosecdef
  )),
  ('overview restricted to authenticated users', coalesce(
    has_function_privilege('authenticated', to_regprocedure('public.get_exercise_overview(uuid)'), 'EXECUTE')
    AND NOT has_function_privilege('anon', to_regprocedure('public.get_exercise_overview(uuid)'), 'EXECUTE'), false
  )),
  ('exercise and session RLS enabled', (
    SELECT count(*) = 2 FROM pg_class WHERE oid IN ('public.exercises'::regclass, 'public.sessions'::regclass) AND relrowsecurity
  )),
  ('owner policies on application tables', (
    SELECT count(*) = 2 FROM pg_policies WHERE schemaname = 'public'
      AND (tablename, policyname) IN (('exercises', 'Owners manage exercises'), ('sessions', 'Owners manage sessions'))
      AND cmd = 'ALL' AND roles = ARRAY['authenticated']::name[]
  )),
  ('owner policies on image writes', (
    SELECT count(*) = 3 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname, cmd) IN (('Owners upload exercise images', 'INSERT'),
        ('Owners update exercise images', 'UPDATE'), ('Owners delete exercise images', 'DELETE'))
      AND roles = ARRAY['authenticated']::name[]
  )),
  ('old permissive image write policies removed', NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('Users can upload exercise images', 'Users can update their exercise images', 'Users can delete their exercise images')
  )),
  ('image size and MIME restrictions', EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'exercise-images' AND file_size_limit = 5242880
      AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp'] AND cardinality(allowed_mime_types) = 3
  )),
  ('session multiplier persisted and required', EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.sessions'::regclass
      AND attname = 'value_multiplier' AND attnotnull AND NOT attisdropped
  )),
  ('session derivation trigger enabled', EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.sessions'::regclass
      AND tgname = 'derive_session_values' AND tgenabled = 'O' AND NOT tgisinternal
  )),
  ('validation functions installed', to_regprocedure('public.valid_session_sets(jsonb)') IS NOT NULL
    AND to_regprocedure('public.valid_personal_records(jsonb)') IS NOT NULL),
  ('all eight write constraints installed', (
    SELECT count(*) = 8 FROM pg_constraint WHERE
      (conrelid = 'public.exercises'::regclass AND conname IN ('exercises_name_valid', 'exercises_category_valid',
        'exercises_description_valid', 'exercises_multiplier_valid', 'exercises_records_valid'))
      OR (conrelid = 'public.sessions'::regclass AND conname IN ('sessions_multiplier_valid', 'sessions_superset_valid', 'sessions_sets_valid'))
  )),
  ('query indexes ready', (
    SELECT count(*) = 2 FROM pg_index WHERE indexrelid IN
      (to_regclass('public.idx_exercises_owner_created'), to_regclass('public.idx_sessions_exercise_date_id'))
      AND indisvalid AND indisready
  ))
)
SELECT check_name, ok FROM checks ORDER BY check_name;

-- Inspect every storage write policy as well: an unexpected permissive policy
-- can override owner restrictions, even if all named policies above exist.
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd <> 'SELECT'
ORDER BY policyname;
