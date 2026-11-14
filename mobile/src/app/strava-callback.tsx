import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth';
import { completeStrava } from '@/strava';
import { ScreenState } from '@/components/ScreenState';

export default function StravaCallback() {
  const params = useLocalSearchParams<Record<string, string>>();
  const { session } = useAuth(); const [error, setError] = useState<string | null>(null);
  const owner = session?.user.id;
  const { state, code, scope, error: denied } = params;
  useEffect(() => {
    if (!owner) return;
    let active = true;
    const url = new URL('gymtrack://strava-callback');
    for (const [key, value] of Object.entries({ state, code, scope, error: denied })) if (value) url.searchParams.set(key, value);
    void Promise.resolve().then(() => completeStrava(owner, url.href)).then((result) => {
      if (!active) return;
      if (result.date) router.replace({ pathname: '/strava', params: { date: result.date, notice: result.result } });
      else setError('Collegamento scaduto. Riprova dalla sessione.');
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Collegamento non riuscito.'); });
    return () => { active = false; };
  }, [owner, state, code, scope, denied]);
  return <ScreenState title={error ? 'Collegamento non riuscito' : 'Collegamento a Strava'} loading={!error && !!owner}
    message={!owner ? 'Accedi allo stesso account GymTrack con cui hai avviato il collegamento.' : error ?? 'Completiamo l’autorizzazione…'} />;
}
