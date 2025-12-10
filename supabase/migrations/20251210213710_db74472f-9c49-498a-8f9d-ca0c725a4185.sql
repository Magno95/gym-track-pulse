-- Add image_url and description columns to exercises table
ALTER TABLE public.exercises 
ADD COLUMN image_url TEXT,
ADD COLUMN description TEXT;