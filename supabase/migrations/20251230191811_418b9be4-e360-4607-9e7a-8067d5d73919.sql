-- Add superset fields to sessions table
ALTER TABLE public.sessions 
ADD COLUMN superset_id uuid DEFAULT NULL,
ADD COLUMN is_superset_secondary boolean DEFAULT false;

-- Create index for faster superset lookups
CREATE INDEX idx_sessions_superset_id ON public.sessions(superset_id) WHERE superset_id IS NOT NULL;