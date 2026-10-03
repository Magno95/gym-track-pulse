BEGIN;

-- Existing images remain readable; mutations require the JWT owner, including legacy paths.
DROP POLICY IF EXISTS "Users can upload exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their exercise images" ON storage.objects;
CREATE POLICY "Owners upload exercise images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercise-images' AND owner_id = (SELECT auth.uid())::text
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text);
CREATE POLICY "Owners update exercise images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exercise-images' AND owner_id = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'exercise-images' AND owner_id = (SELECT auth.uid())::text
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text);
CREATE POLICY "Owners delete exercise images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercise-images' AND owner_id = (SELECT auth.uid())::text);
UPDATE storage.buckets SET file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  WHERE id = 'exercise-images';

DROP POLICY "Users can view their own exercises" ON public.exercises;
DROP POLICY "Users can create their own exercises" ON public.exercises;
DROP POLICY "Users can update their own exercises" ON public.exercises;
DROP POLICY "Users can delete their own exercises" ON public.exercises;
CREATE POLICY "Owners manage exercises" ON public.exercises FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY "Users can view their own sessions" ON public.sessions;
DROP POLICY "Users can create sessions for their exercises" ON public.sessions;
DROP POLICY "Users can update their own sessions" ON public.sessions;
DROP POLICY "Users can delete their own sessions" ON public.sessions;
CREATE POLICY "Owners manage sessions" ON public.sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = exercise_id AND e.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e WHERE e.id = exercise_id AND e.user_id = (SELECT auth.uid())));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises, public.sessions TO authenticated;
CREATE INDEX idx_exercises_owner_created ON public.exercises(user_id, created_at DESC, id DESC);
CREATE INDEX idx_sessions_exercise_date_id ON public.sessions(exercise_id, date DESC, id DESC);

CREATE FUNCTION public.valid_session_sets(items jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE item jsonb; reps numeric; weight numeric;
BEGIN
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(items) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(item->'reps') IS DISTINCT FROM 'number'
      OR jsonb_typeof(item->'weight') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    reps := (item->>'reps')::numeric; weight := (item->>'weight')::numeric;
    IF reps NOT BETWEEN 1 AND 10000 OR reps <> trunc(reps) OR weight NOT BETWEEN 0 AND 100000 THEN RETURN false; END IF;
    IF item ? 'body_weight' OR item ? 'additional_weight' THEN
      IF jsonb_typeof(item->'body_weight') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item->'additional_weight') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      IF (item->>'body_weight')::numeric NOT BETWEEN 0.01 AND 1000
        OR (item->>'additional_weight')::numeric NOT BETWEEN 0 AND 100000
        OR abs(weight - round((item->>'body_weight')::numeric + (item->>'additional_weight')::numeric, 2)) > 0.005
        THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE FUNCTION public.valid_personal_records(items jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE item jsonb; record_date date;
BEGIN
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(items) > 3 THEN RETURN false; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item->'text') IS DISTINCT FROM 'string' OR length(btrim(item->>'text')) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(item->'date') IS DISTINCT FROM 'string' OR (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      THEN RETURN false; END IF;
    record_date := (item->>'date')::date;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

-- NOT VALID leaves historical records untouched; PostgreSQL still checks all future writes.
ALTER TABLE public.exercises ADD CONSTRAINT exercises_name_valid CHECK (length(btrim(name)) BETWEEN 1 AND 100) NOT VALID;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_category_valid CHECK (category IN ('arms','chest','back','legs','core','cardio')) NOT VALID;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_description_valid CHECK (description IS NULL OR length(description) <= 1000) NOT VALID;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_multiplier_valid CHECK (superset_multiplier IS NOT NULL AND superset_multiplier BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE public.exercises ADD CONSTRAINT exercises_records_valid CHECK (public.valid_personal_records(personal_records)) NOT VALID;
ALTER TABLE public.sessions ADD COLUMN value_multiplier numeric NOT NULL DEFAULT 1;
-- Infer old secondary multipliers without recomputing any saved session value or load.
UPDATE public.sessions s SET value_multiplier = CASE WHEN total.raw > 0 AND s.value / total.raw BETWEEN 1 AND 5
  THEN s.value / total.raw ELSE least(5, greatest(1, coalesce(e.superset_multiplier, 1.2))) END
FROM public.exercises e,
  (SELECT id, sum((item->>'reps')::numeric * (item->>'weight')::numeric) AS raw
   FROM public.sessions, LATERAL jsonb_array_elements(CASE WHEN public.valid_session_sets(sets) THEN sets ELSE '[]'::jsonb END) item
   GROUP BY id) total
WHERE s.exercise_id = e.id AND total.id = s.id AND s.is_superset_secondary;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_multiplier_valid CHECK (value_multiplier BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_superset_valid CHECK (NOT coalesce(is_superset_secondary, false) OR superset_id IS NOT NULL) NOT VALID;
ALTER TABLE public.sessions ADD CONSTRAINT sessions_sets_valid CHECK (public.valid_session_sets(sets)) NOT VALID;

-- Omitted multipliers from older clients are derived by the trigger.
ALTER TABLE public.sessions ALTER COLUMN value_multiplier SET DEFAULT NULL;

CREATE FUNCTION public.derive_session_values() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE raw numeric;
BEGIN
  IF NOT public.valid_session_sets(NEW.sets) THEN RAISE EXCEPTION 'Invalid session sets' USING ERRCODE = '23514'; END IF;
  IF NOT coalesce(NEW.is_superset_secondary, false) THEN NEW.value_multiplier := 1;
  ELSIF NEW.value_multiplier IS NULL THEN
    SELECT superset_multiplier INTO NEW.value_multiplier FROM public.exercises WHERE id = NEW.exercise_id;
  END IF;
  IF NEW.value_multiplier IS NULL OR NEW.value_multiplier NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid multiplier' USING ERRCODE = '23514'; END IF;
  SELECT sum((item->>'reps')::numeric * (item->>'weight')::numeric) INTO raw FROM jsonb_array_elements(NEW.sets) item;
  NEW.series := jsonb_array_length(NEW.sets);
  NEW.reps := (NEW.sets->0->>'reps')::integer;
  NEW.weight := (NEW.sets->0->>'weight')::numeric;
  NEW.value := round(raw * NEW.value_multiplier);
  RETURN NEW;
END;
$$;
CREATE TRIGGER derive_session_values BEFORE INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.derive_session_values();

CREATE FUNCTION public.get_exercise_overview(p_user_id uuid)
RETURNS TABLE (exercise jsonb, sessions jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT to_jsonb(e), coalesce(recent.sessions, '[]'::jsonb)
  FROM public.exercises e
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.date, s.id) AS sessions FROM (
      SELECT * FROM public.sessions WHERE exercise_id = e.id ORDER BY date DESC, id DESC LIMIT 2
    ) s
  ) recent ON true
  WHERE e.user_id = p_user_id AND p_user_id = (SELECT auth.uid())
  ORDER BY e.created_at DESC, e.id DESC;
$$;
REVOKE ALL ON FUNCTION public.get_exercise_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exercise_overview(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
