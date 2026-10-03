-- Read-only checks after 20261003002000_timed_bodyweight.sql. All must be true.
WITH checks(check_name, ok) AS (
  VALUES
  ('timed bodyweight unit allowed', EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.exercises'::regclass
      AND conname = 'bodyweight_requires_supported_unit' AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%time%'
  )),
  ('old weight-only restriction removed', NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.exercises'::regclass
      AND conname = 'bodyweight_requires_weight_unit'
  )),
  ('timed bodyweight snapshot accepted', public.valid_session_sets(
    '[{"reps":60,"weight":80,"body_weight":80,"additional_weight":0,"duration_seconds":60}]'::jsonb
  )),
  ('duration must match stored seconds', NOT public.valid_session_sets(
    '[{"reps":60,"weight":80,"body_weight":80,"additional_weight":0,"duration_seconds":61}]'::jsonb
  )),
  ('duration requires bodyweight snapshot', NOT public.valid_session_sets(
    '[{"reps":60,"weight":80,"duration_seconds":60}]'::jsonb
  )),
  ('legacy and weight snapshots still accepted', public.valid_session_sets('[{"reps":10,"weight":20}]'::jsonb)
    AND public.valid_session_sets('[{"reps":10,"weight":80,"body_weight":80,"additional_weight":0}]'::jsonb))
)
SELECT check_name, ok FROM checks ORDER BY check_name;
