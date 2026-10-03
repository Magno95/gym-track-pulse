BEGIN;

-- Public object URLs keep serving illustrations through the public bucket.
-- Listing file names and metadata requires ownership, including legacy paths.
DROP POLICY IF EXISTS "Exercise images are publicly accessible" ON storage.objects;
CREATE POLICY "Owners read exercise image metadata"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'exercise-images' AND owner_id = (SELECT auth.uid())::text);

-- Additional permissive policies must not expose this bucket's metadata.
CREATE POLICY "Exercise image metadata requires ownership"
ON storage.objects AS RESTRICTIVE FOR SELECT TO public
USING (bucket_id <> 'exercise-images' OR
  (current_user = 'authenticated' AND owner_id = (SELECT auth.uid())::text));

COMMIT;
