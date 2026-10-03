BEGIN;

-- Timed bodyweight exercises keep seconds and kilograms separate.
ALTER TABLE public.exercises DROP CONSTRAINT bodyweight_requires_weight_unit;
ALTER TABLE public.exercises ADD CONSTRAINT bodyweight_requires_supported_unit
  CHECK (NOT is_bodyweight OR (unit IS NOT NULL AND unit IN ('weight', 'time')));

CREATE OR REPLACE FUNCTION public.valid_session_sets(items jsonb) RETURNS boolean
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
    IF item ? 'duration_seconds' THEN
      IF jsonb_typeof(item->'duration_seconds') IS DISTINCT FROM 'number'
        OR (item->>'duration_seconds')::numeric <> reps
        OR NOT (item ? 'body_weight' AND item ? 'additional_weight') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

COMMENT ON COLUMN public.exercises.is_bodyweight IS
  'Default for new weight or timed sessions. Timed sets carry duration_seconds equal to reps and a kilograms snapshot; existing sessions stay unchanged.';
NOTIFY pgrst, 'reload schema';
COMMIT;
