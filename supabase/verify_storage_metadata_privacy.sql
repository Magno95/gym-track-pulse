-- Read-only checks after 20261003003000_storage_metadata_privacy.sql.
WITH checks(check_name, ok) AS (
  VALUES
  ('legacy public metadata policy removed', NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Exercise images are publicly accessible'
  )),
  ('owners can read their own metadata', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Owners read exercise image metadata' AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[] AND qual LIKE '%owner_id%' AND qual LIKE '%auth.uid%'
  )),
  ('restrictive ownership guard active', EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Exercise image metadata requires ownership' AND cmd = 'SELECT'
      AND permissive = 'RESTRICTIVE' AND roles = ARRAY['public']::name[]
      AND qual ILIKE '%current_user%' AND qual LIKE '%owner_id%'
  )),
  ('public image URLs remain available', EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'exercise-images' AND public
  )),
  ('storage row security enabled', EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'storage.objects'::regclass AND relrowsecurity
  ))
)
SELECT check_name, ok FROM checks ORDER BY check_name;
