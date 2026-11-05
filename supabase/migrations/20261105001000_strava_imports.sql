BEGIN;

-- Keep an authenticated snapshot so a rejected duplicate can be retried after
-- the user manually removes the original Strava activity.
CREATE TABLE public.strava_imports (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  athlete_id bigint NOT NULL,
  activity jsonb NOT NULL CHECK (jsonb_typeof(activity) = 'object'),
  streams jsonb CHECK (jsonb_typeof(streams) = 'object'),
  PRIMARY KEY (user_id, session_date)
);

ALTER TABLE public.strava_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strava_imports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.strava_imports TO service_role;

COMMIT;
