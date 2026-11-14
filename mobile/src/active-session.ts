import { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { RestTimer, WorkoutRun } from './data/workout-run';
import type { SessionActivityStatus } from './data/session-activity';

export const ActiveSessionContext = createContext<{
  runs: WorkoutRun[]; active: WorkoutRun | undefined; error: string | null; notice: string | null;
  activityStatus: SessionActivityStatus;
  start: () => WorkoutRun; close: () => void; remove: (id: string) => void; startRest: (seconds: number) => Promise<RestTimer | undefined>; cancelRest: (notificationId?: string) => void;
} | null>(null);
export function useActiveSession() {
  const context = useContext(ActiveSessionContext);
  if (!context) throw new Error('Sessione non disponibile.');
  return context;
}
export function useNow(enabled: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [enabled]);
  return now;
}
