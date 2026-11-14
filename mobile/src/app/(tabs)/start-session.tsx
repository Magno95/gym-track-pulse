import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useActiveSession } from '@/active-session';
import { ScreenState } from '@/components/ScreenState';

// Keep existing /start-session links working; preloading must never start a workout.
export default function StartSessionAction() {
  const { start } = useActiveSession();
  const startRef = useRef(start);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { startRef.current = start; }, [start]);
  const begin = useCallback(() => {
    setError(null);
    try {
      const run = startRef.current();
      router.navigate({ pathname: '/session', params: { date: run.date } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Riprova.'); }
  }, []);
  useFocusEffect(begin);
  return <ScreenState title={error ? 'Sessione non avviata' : 'Apriamo la tua sessione'} message={error ?? undefined} loading={!error} onRetry={error ? begin : undefined} />;
}
