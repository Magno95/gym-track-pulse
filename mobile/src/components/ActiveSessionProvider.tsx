import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Vibration } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ActiveSessionContext } from '../active-session';
import { localRunDate, WorkoutRunStore, type WorkoutRun } from '../data/workout-run';
import { useWorkout } from '../workout';
import { allowRestNotifications, cancelRestNotification, scheduleRestNotification, vibrateRestComplete } from '../session-notifications';
import { syncSessionActivity } from '../session-activity';
import type { SessionActivityStatus } from '../data/session-activity';
import { outbox } from '../data/native-store';

const message = (error: unknown) => error instanceof Error ? error.message : 'Salvataggio del timer non riuscito.';
export function ActiveSessionProvider({ children }: PropsWithChildren) {
  const w = useWorkout(); const owner = w.data.userId;
  const [initial] = useState(() => {
    try { return { store: new WorkoutRunStore(localStorage, owner), error: null }; }
    catch (error) { return { store: null, error: message(error) }; }
  });
  const store = initial.store;
  const [runs, setRuns] = useState<WorkoutRun[]>(() => store?.snapshot() ?? []);
  const [error, setError] = useState<string | null>(initial.error);
  const [notice, setNotice] = useState<string | null>(null);
  const [activityStatus, setActivityStatus] = useState<SessionActivityStatus>('idle');
  const alive = useRef(true); const restRevision = useRef(0); const scheduling = useRef(false);
  const active = runs.find((run) => run.endedAt === null);
  const count = active ? w.data.exercises.filter((exercise) => exercise.sessions.some((session) => session.date === active.date)).length : 0;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      Vibration.cancel();
      const rest = store?.snapshot().find((run) => run.endedAt === null)?.rest;
      if (rest) void cancelRestNotification(rest.notificationId).catch(() => {});
      void syncSessionActivity(null, 0);
    };
  }, [store]);
  useEffect(() => {
    let cancelled = false;
    function sync() {
      void syncSessionActivity(active ?? null, count).then((status) => {
        if (alive.current && !cancelled) setActivityStatus(status);
      });
    }
    sync();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') sync(); });
    return () => { cancelled = true; listener.remove(); };
  }, [active, count]);
  useEffect(() => {
    if (!active?.rest || !store) return;
    const runId = active.id; const rest = active.rest;
    function complete() {
      if (!alive.current || AppState.currentState !== 'active') return;
      if (store!.snapshot().find((run) => run.id === runId)?.rest?.notificationId !== rest.notificationId) return;
      try {
        setRuns(store!.rest(runId, null));
        setNotice('Timer terminato. Il tempo impostato è trascorso.');
        // Do not replay an old alert when reopening the app much later.
        if (Date.now() - rest.endsAt < 5000) vibrateRestComplete();
        void cancelRestNotification(rest.notificationId).catch(() => {});
      } catch (error) { setError(message(error)); }
    }
    const timer = setTimeout(complete, Math.max(0, rest.endsAt - Date.now()));
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active' && Date.now() >= rest.endsAt) complete(); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [active, store]);
  // Restore a future reminder after login/relaunch, including one cancelled at logout.
  useEffect(() => {
    const rest = store?.snapshot().find((run) => run.endedAt === null)?.rest;
    if (rest && rest.endsAt > Date.now()) void scheduleRestNotification(rest).catch(() => {
      if (alive.current) setNotice('Avviso a schermo bloccato non disponibile. Il timer vibra quando l’app è aperta.');
    });
  }, [store]);
  function requireStore() {
    if (!alive.current) throw new Error('L’account è cambiato. Riapri la sessione e riprova.');
    if (!store) throw new Error(initial.error ?? 'Timer non disponibile.');
    return store;
  }
  function cancelReminder(id: string) {
    void cancelRestNotification(id).catch(() => {
      if (alive.current) setNotice('Non è stato possibile annullare l’avviso del timer. Potresti riceverlo ancora.');
    });
  }
  function start() {
    const current = requireStore();
    const next = current.start(randomUUID());
    setRuns(next); setError(null);
    return next.find((run) => run.endedAt === null) ?? next.find((run) => run.date === localRunDate(Date.now()))!;
  }
  function close() {
    const current = requireStore(); const run = current.snapshot().find((run) => run.endedAt === null);
    if (!run) return;
    const next = current.close(run.id);
    restRevision.current++; setRuns(next); setError(null); setNotice(null); Vibration.cancel();
    if (run.rest) cancelReminder(run.rest.notificationId);
  }
  function remove(id: string) {
    const current = requireStore(); const run = current.snapshot().find((run) => run.id === id);
    if (!run) return;
    if (run.endedAt === null) throw new Error('Chiudi la sessione prima di eliminarla.');
    const ids = outbox.state(owner).exercises.flatMap((exercise) => exercise.sessions.filter((session) => session.date === run.date).map((session) => session.id));
    // Persist the exercise deletion before removing the clock. If the clock write fails,
    // its retained summary can be deleted again; the exercise deletion remains retryable.
    if (ids.length) w.enqueue({ type: 'delete_sessions', sessionIds: ids });
    try { setRuns(current.remove(id)); }
    catch (error) {
      throw new Error(ids.length ? 'Eliminazione delle serie salvata. Non è stato possibile eliminare il riepilogo: riprova.' : message(error), { cause: error });
    }
    setError(null);
  }
  function cancelRest(notificationId?: string) {
    // A dismissed sheet can only cancel its own timer, including after logout.
    if (notificationId && !alive.current) return;
    const current = requireStore(); const run = current.snapshot().find((run) => run.endedAt === null);
    if (notificationId && run?.rest?.notificationId !== notificationId) return;
    restRevision.current++;
    if (!run) return;
    setRuns(current.rest(run.id, null)); setError(null); setNotice(null); Vibration.cancel();
    if (run.rest) cancelReminder(run.rest.notificationId);
  }
  async function startRest(seconds: number) {
    if (scheduling.current) return;
    const current = requireStore(); const run = current.snapshot().find((run) => run.endedAt === null);
    if (!run) return;
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error('Scegli una durata tra 1 secondo e 60 minuti.');
    scheduling.current = true;
    const revision = ++restRevision.current;
    try {
      let allowed = false;
      try { allowed = await allowRestNotifications(); } catch { /* Foreground timer works without the native module. */ }
      if (!alive.current || revision !== restRevision.current || current.snapshot().find((item) => item.id === run.id)?.endedAt !== null) return;
      const now = Date.now();
      const rest = { startedAt: now, endsAt: now + seconds * 1000, notificationId: `gymtrack-rest:${owner}:${randomUUID()}` };
      const previous = current.snapshot().find((item) => item.id === run.id)?.rest;
      setRuns(current.rest(run.id, rest)); setError(null);
      setNotice(allowed ? null : 'Notifiche disattivate. Il timer vibra con l’app aperta; abilita le notifiche nelle Impostazioni per l’avviso a schermo bloccato.');
      if (previous) cancelReminder(previous.notificationId);
      if (allowed) {
        try {
          await scheduleRestNotification(rest);
          if (!alive.current || revision !== restRevision.current || current.snapshot().find((item) => item.id === run.id)?.rest?.notificationId !== rest.notificationId) cancelReminder(rest.notificationId);
        } catch { if (alive.current) setNotice('Avviso a schermo bloccato non disponibile. Il timer vibra quando l’app è aperta.'); }
      }
      if (alive.current && revision === restRevision.current && current.snapshot().find((item) => item.id === run.id)?.rest?.notificationId === rest.notificationId) return rest;
    } finally { scheduling.current = false; }
  }
  return <ActiveSessionContext.Provider value={{ runs, active, error, notice, activityStatus, start, close, remove, startRest, cancelRest }}>{children}</ActiveSessionContext.Provider>;
}
