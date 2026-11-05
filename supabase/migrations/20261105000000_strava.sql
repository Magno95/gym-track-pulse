BEGIN;

-- Credentials and OAuth state are accessible exclusively by the Edge Function.
CREATE TABLE public.strava_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id bigint NOT NULL UNIQUE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  scope text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.strava_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX strava_oauth_states_expiry ON public.strava_oauth_states(expires_at);
CREATE TABLE public.strava_publications (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  athlete_id bigint NOT NULL,
  upload_id text,
  activity_id text,
  status text NOT NULL CHECK (status IN ('uploading', 'processing', 'published', 'failed', 'uncertain')),
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_date)
);
CREATE TABLE public.strava_locks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.strava_connections, public.strava_oauth_states, public.strava_publications, public.strava_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.strava_connections, public.strava_oauth_states, public.strava_publications, public.strava_locks TO service_role;

-- Serialize token rotation and uploads across tabs / function instances.
CREATE FUNCTION public.claim_strava_lock(p_user_id uuid, p_token uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE acquired uuid;
BEGIN
  INSERT INTO public.strava_locks(user_id, token, expires_at)
    VALUES(p_user_id, p_token, now() + interval '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
      WHERE strava_locks.expires_at < now()
    RETURNING token INTO acquired;
  RETURN acquired IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_strava_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_strava_lock(uuid, uuid) TO service_role;

COMMIT;
