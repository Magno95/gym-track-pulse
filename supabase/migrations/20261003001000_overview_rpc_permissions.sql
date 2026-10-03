BEGIN;
-- Supabase can grant anon explicit EXECUTE through default privileges.
-- Revoking PUBLIC alone would leave that separate grant in place.
REVOKE EXECUTE ON FUNCTION public.get_exercise_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exercise_overview(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
