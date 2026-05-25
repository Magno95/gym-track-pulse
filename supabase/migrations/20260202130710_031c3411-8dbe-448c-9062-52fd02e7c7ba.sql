-- Add personal_records column to exercises table
ALTER TABLE public.exercises 
ADD COLUMN personal_records jsonb DEFAULT '[]'::jsonb;

-- Add a comment to document the structure
COMMENT ON COLUMN public.exercises.personal_records IS 'Array of up to 3 personal records: [{text: string, date: string}]. Newest first.';