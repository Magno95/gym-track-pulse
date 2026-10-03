CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  height_cm numeric CHECK (height_cm > 0 AND height_cm <= 300)
);

CREATE TABLE public.body_weight_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  weight_kg numeric NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_date)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_weight_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own profile" ON public.profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage their own weight history" ON public.body_weight_history
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_weight_history TO authenticated;

ALTER TABLE public.exercises ADD COLUMN is_bodyweight boolean NOT NULL DEFAULT false;
ALTER TABLE public.exercises ADD CONSTRAINT bodyweight_requires_weight_unit
  CHECK (NOT is_bodyweight OR unit IS NOT DISTINCT FROM 'weight');

COMMENT ON COLUMN public.body_weight_history.effective_date IS
  'Weight applies from this local calendar date until the next measurement. One measurement per day.';
COMMENT ON COLUMN public.exercises.is_bodyweight IS
  'Default for new sessions only. Saved sets carry body_weight and additional_weight snapshots; existing sessions stay unchanged.';

NOTIFY pgrst, 'reload schema';
