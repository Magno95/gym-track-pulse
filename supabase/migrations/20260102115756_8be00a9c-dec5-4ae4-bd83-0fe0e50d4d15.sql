-- Add unit and superset_multiplier columns to exercises table
ALTER TABLE public.exercises 
ADD COLUMN unit text DEFAULT 'weight' CHECK (unit IN ('weight', 'distance', 'time')),
ADD COLUMN superset_multiplier numeric DEFAULT 1.2;