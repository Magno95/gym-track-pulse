import { emptyState, projectState, type Change, type Operation, type WorkoutState } from './model.ts';

type SqlValue = string | number | null;
export interface SqlDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...params: SqlValue[]): unknown;
  getAllSync<T>(sql: string, ...params: SqlValue[]): T[];
}
export class Outbox {
  private listeners = new Set<() => void>();
  private revision = 0;
  private projected = new Map<string, { revision: number; state: WorkoutState }>();
  private db: SqlDatabase;
  private currentOwner: () => string | null;
  constructor(db: SqlDatabase, currentOwner: () => string | null) {
    this.db = db; this.currentOwner = currentOwner;
    db.execSync(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS snapshots(owner TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, owner TEXT NOT NULL, timestamp INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS outbox_owner ON outbox(owner,timestamp,id);`);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  version = () => this.revision;
  private emit() { this.revision++; this.listeners.forEach((listener) => listener()); }
  assertOwner(owner: string) { if (!owner || owner !== this.currentOwner()) throw new Error('L’account è cambiato. Riapri il modulo e riprova.'); }
  pending(owner: string): Operation[] {
    return this.db.getAllSync<{ value: string }>('SELECT value FROM outbox WHERE owner=? ORDER BY timestamp,id', owner).map(({ value }) => JSON.parse(value));
  }
  base(owner: string): WorkoutState {
    const row = this.db.getAllSync<{ value: string }>('SELECT value FROM snapshots WHERE owner=?', owner)[0];
    const state = row ? JSON.parse(row.value) as WorkoutState : emptyState(owner);
    if (state.userId !== owner || state.exercises.some((item) => item.user_id !== owner) || state.measurements.some((item) => item.user_id !== owner)) {
      throw new Error('Cache locale non valida per questo account.');
    }
    return state;
  }
  state(owner: string) {
    const cached = this.projected.get(owner);
    if (cached?.revision === this.revision) return cached.state;
    const state = projectState(this.base(owner), this.pending(owner), owner);
    this.projected.set(owner, { revision: this.revision, state });
    return state;
  }
  private writeBase(state: WorkoutState) { this.db.runSync('INSERT INTO snapshots(owner,value) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value', state.userId, JSON.stringify(state)); }
  snapshot(state: WorkoutState, expectedRevision: number) {
    this.assertOwner(state.userId);
    if (this.revision !== expectedRevision) return false;
    projectState(state, this.pending(state.userId), state.userId);
    this.writeBase({ ...state, updatedAt: Date.now() }); this.emit(); return true;
  }
  enqueue(owner: string, change: Change, id: string): Operation {
    this.assertOwner(owner);
    const queue = this.pending(owner);
    const operation: Operation = { id, owner, change, timestamp: Math.max(Date.now(), (queue.at(-1)?.timestamp ?? 0) + 1), attempts: 0, nextAttempt: 0 };
    // Validate the complete projection before committing. Persistence precedes UI success.
    projectState(this.state(owner), [operation], owner);
    this.db.runSync('INSERT INTO outbox(id,owner,timestamp,value) VALUES(?,?,?,?)', id, owner, operation.timestamp, JSON.stringify(operation));
    this.emit(); return operation;
  }
  acknowledge(operation: Operation) {
    this.assertOwner(operation.owner);
    this.db.execSync('BEGIN IMMEDIATE');
    try {
      const existing = this.db.getAllSync<{ value: string }>('SELECT value FROM outbox WHERE id=? AND owner=?', operation.id, operation.owner)[0];
      if (existing) {
        this.writeBase(projectState(this.base(operation.owner), [operation], operation.owner));
        this.db.runSync('DELETE FROM outbox WHERE id=? AND owner=?', operation.id, operation.owner);
      }
      this.db.execSync('COMMIT');
    } catch (error) { this.db.execSync('ROLLBACK'); throw error; }
    this.emit();
  }
  failed(operation: Operation, error: unknown) {
    const detail = error as { code?: string; status?: number; message?: string };
    const permanent = ['23514', '23503', '23502', '22P02', '22003', '42501', 'PGRST116'].includes(detail?.code ?? '');
    const next = { ...operation, attempts: operation.attempts + 1, permanent,
      error: detail?.message ?? String(error), nextAttempt: Date.now() + Math.min(300_000, 2 ** Math.min(operation.attempts + 1, 8) * 1000) };
    this.db.runSync('UPDATE outbox SET value=? WHERE id=? AND owner=?', JSON.stringify(next), operation.id, operation.owner); this.emit();
  }
}
