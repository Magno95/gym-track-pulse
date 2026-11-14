export type RestTimer = { startedAt: number; endsAt: number; notificationId: string };
export type WorkoutRun = {
  id: string; date: string; startedAt: number; endedAt: number | null; utcOffset: number;
  rest: RestTimer | null;
};

export function elapsedSeconds(run: WorkoutRun, now = Date.now()) {
  return Math.max(0, Math.floor(((run.endedAt ?? now) - run.startedAt) / 1000));
}
export function formatTimer(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const tail = `${String(minutes % 60).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${tail}` : tail;
}
export function localRunDate(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function publicationTiming(run: WorkoutRun) {
  const elapsedTime = elapsedSeconds(run);
  if (run.endedAt === null) throw new Error('Chiudi la sessione prima di pubblicare.');
  if (elapsedTime < 1 || elapsedTime > 86400) throw new Error('La durata deve essere compresa tra 1 secondo e 24 ore.');
  return { startTime: new Date(run.startedAt).toISOString(), utcOffset: run.utcOffset, elapsedTime, useImportedActivity: false };
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
// One workout per calendar day, matching the server's daily Strava publication.
// Writes finish before React is notified: a failed write never advances the timer.
export class WorkoutRunStore {
  private key: string;
  private runs: WorkoutRun[];
  private storage: Storage;
  constructor(storage: Storage, owner: string) {
    this.storage = storage;
    this.key = `gymtrack-workout-runs:${owner}`;
    const raw = storage.getItem(this.key);
    if (!raw) { this.runs = []; return; }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.some((run) => !run || typeof run.id !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(run.date) || !Number.isFinite(run.startedAt)
        || (run.endedAt !== null && (!Number.isFinite(run.endedAt) || run.endedAt < run.startedAt))
        || !Number.isInteger(run.utcOffset) || Math.abs(run.utcOffset) > 50400
        || (run.rest !== null && (!run.rest || !Number.isFinite(run.rest.startedAt) || !Number.isFinite(run.rest.endsAt)
          || run.rest.endsAt <= run.rest.startedAt || typeof run.rest.notificationId !== 'string')))
        || new Set(parsed.map((run) => run.date)).size !== parsed.length
        || parsed.filter((run) => run.endedAt === null).length > 1) throw new Error();
      this.runs = parsed;
    } catch { throw new Error('Non riusciamo a leggere il timer salvato. Riapri l’app prima di avviare una nuova sessione.'); }
  }
  snapshot = () => this.runs;
  private write(runs: WorkoutRun[]) {
    this.storage.setItem(this.key, JSON.stringify(runs));
    this.runs = runs;
    return runs;
  }
  start(id: string, now = Date.now()) {
    if (this.runs.some((run) => run.endedAt === null)) return this.runs;
    const date = localRunDate(now);
    if (this.runs.some((run) => run.date === date)) return this.runs;
    return this.write([...this.runs, { id, date, startedAt: now, endedAt: null, utcOffset: -new Date(now).getTimezoneOffset() * 60, rest: null }]);
  }
  close(id: string, now = Date.now()) {
    return this.write(this.runs.map((run) => run.id === id && run.endedAt === null
      ? { ...run, endedAt: Math.max(run.startedAt, now), rest: null } : run));
  }
  remove(id: string) {
    if (this.runs.some((run) => run.id === id && run.endedAt === null)) throw new Error('Chiudi la sessione prima di eliminarla.');
    return this.write(this.runs.filter((run) => run.id !== id));
  }
  rest(id: string, rest: RestTimer | null) {
    return this.write(this.runs.map((run) => run.id === id && run.endedAt === null ? { ...run, rest } : run));
  }
}
