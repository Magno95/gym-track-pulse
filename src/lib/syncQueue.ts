import { createUuid } from "@/lib/uuid";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { SessionSet } from "./bodyweight";
import { supabaseStore } from "./supabaseStore";
import { getCurrentUserId, requireUserId } from "./authSession";
import { syncFailureKind } from "./syncErrors";

export type SyncPayload = {
  cleanupAfter?: number; imageUrl?: string; exerciseId?: string; sessionId?: string; primaryExerciseId?: string; secondaryExerciseId?: string;
  tempId?: string; primaryTempId?: string; secondaryTempId?: string; supersetId?: string | null; isSupersetSecondary?: boolean;
  date?: string; sets?: SessionSet[]; primarySets?: SessionSet[]; secondarySets?: SessionSet[];
  multiplier?: number; valueMultiplier?: number; name?: string; category?: string;
};
export interface SyncOperation {
  id: string; userId: string; version: string;
  type: "add_session" | "update_session" | "delete_session" | "add_exercise" | "delete_exercise" | "add_superset_session" | "delete_image";
  payload: SyncPayload;
  timestamp: number; retries: number; nextAttemptAt: number; lastError?: string;
  failureKind?: "validation" | "auth" | "temporary";
}
interface OutboxDB extends DBSchema {
  operations: { key: string; value: SyncOperation; indexes: { user: string } };
  leases: { key: string; value: { userId: string; token: string; expiresAt: number } };
}
let databasePromise: Promise<IDBPDatabase<OutboxDB>> | undefined;
function db() {
  if (!databasePromise) {
    databasePromise = openDB<OutboxDB>("gym-track-outbox", 1, {
      upgrade(database) {
        database.createObjectStore("operations", { keyPath: "id" }).createIndex("user", "userId");
        database.createObjectStore("leases", { keyPath: "userId" });
      },
      blocking() { void databasePromise?.then((database) => database.close()); databasePromise = undefined; },
      terminated() { databasePromise = undefined; },
    }).catch((error: unknown) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}
const snapshots = new Map<string, SyncOperation[]>();
const listeners = new Set<() => void>();
const EMPTY: SyncOperation[] = [];
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("gym-track-outbox") : null;

export function subscribeToSync(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit(userId: string, broadcast = true) {
  if (userId === getCurrentUserId()) for (const listener of listeners) listener();
  if (broadcast) channel?.postMessage(userId);
}
export async function initSyncQueue(userId = getCurrentUserId()) {
  if (!userId) { for (const listener of listeners) listener(); return; }
  const database = await db();
  const queue = await database.getAllFromIndex("operations", "user", userId);
  queue.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const previous = snapshots.get(userId);
  if (!previous || previous.length !== queue.length || queue.some((op, i) => op.id !== previous[i].id || op.version !== previous[i].version || op.retries !== previous[i].retries)) {
    snapshots.set(userId, queue); emit(userId, false);
  }
}
channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.data === getCurrentUserId()) void initSyncQueue().catch(console.error);
});
export function getSyncQueue(): SyncOperation[] {
  const owner = getCurrentUserId();
  return owner ? snapshots.get(owner) ?? EMPTY : EMPTY;
}
export function hasPendingChanges() { return getSyncQueue().length > 0; }

// Commit to IndexedDB before notifying the UI; unsuccessful writes cannot appear saved.
export async function addToSyncQueue(input: Pick<SyncOperation, "type" | "payload">, expectedUserId: string | null): Promise<SyncOperation> {
  const userId = requireUserId(expectedUserId ?? null);
  const database = await db(); requireUserId(userId);
  const tx = database.transaction("operations", "readwrite");
  const queue = (await tx.store.index("user").getAll(userId)).sort((a, b) => a.timestamp - b.timestamp);
  const previous = input.payload.sessionId
    ? [...queue].reverse().find((op) => op.payload.sessionId === input.payload.sessionId) : undefined;
  const replace = input.type === "update_session" && previous?.type === "update_session" ? previous : undefined;
  const payload = { ...input.payload };
  if (input.type === "delete_image") payload.cleanupAfter ??= Date.now() + 10 * 60_000;
  if (input.type === "add_exercise" || input.type === "add_session") payload.tempId ??= createUuid();
  if (input.type === "add_superset_session") {
    payload.primaryTempId ??= createUuid(); payload.secondaryTempId ??= createUuid();
    payload.supersetId ??= createUuid();
  }
  const operation: SyncOperation = {
    ...input, payload, userId, id: replace?.id ?? createUuid(), version: createUuid(),
    timestamp: replace?.timestamp ?? Math.max(Date.now(), (queue[queue.length - 1]?.timestamp ?? 0) + 1),
    retries: 0, nextAttemptAt: 0,
  };
  await tx.store.put(operation); await tx.done;
  await initSyncQueue(userId); channel?.postMessage(userId); requireUserId(userId);
  return operation;
}

const running = new Map<string, Promise<void>>();
async function acquireLease(userId: string, token: string) {
  const database = await db(); const tx = database.transaction("leases", "readwrite");
  const lease = await tx.store.get(userId);
  const available = !lease || lease.token === token || lease.expiresAt < Date.now();
  if (available) await tx.store.put({ userId, token, expiresAt: Date.now() + 60_000 });
  await tx.done; return available;
}
async function flush(userId: string, force: boolean) {
  const token = createUuid();
  if (!await acquireLease(userId, token)) return;
  const renewal = setInterval(() => { void acquireLease(userId, token).catch(console.error); }, 20_000);
  try {
    await initSyncQueue(userId);
    for (const op of snapshots.get(userId) ?? []) {
      if (getCurrentUserId() !== userId || (typeof navigator !== "undefined" && !navigator.onLine)) break;
      if (op.type === "delete_image" && (op.payload.cleanupAfter ?? 0) > Date.now()) continue;
      if (!force && op.failureKind === "validation") { if (op.type === "delete_image") continue; break; }
      if (!force && op.nextAttemptAt > Date.now()) { if (op.type === "delete_image") continue; break; }
      if (!await acquireLease(userId, token)) break;
      try {
        const p = op.payload; const options = { userId };
        switch (op.type) {
          case "add_exercise": await supabaseStore.addExercise({ name: p.name!, category: p.category! }, { ...options, id: p.tempId! }); break;
          case "add_session": await supabaseStore.addSession(p.exerciseId!, { date: p.date!, sets: p.sets! }, { ...options, id: p.tempId! }); break;
          case "update_session": await supabaseStore.updateSession(p.sessionId!, { date: p.date!, sets: p.sets! }, { ...options, valueMultiplier: p.valueMultiplier ?? 1 }); break;
          case "delete_session": await supabaseStore.deleteSession(p.sessionId!, options); break;
          case "delete_exercise": await supabaseStore.deleteExercise(p.exerciseId!, { ...options, imageUrl: p.imageUrl }); break;
          case "delete_image": await supabaseStore.deleteImage(p.imageUrl!, options); break;
          case "add_superset_session": await supabaseStore.addSupersetSession(p.primaryExerciseId!, p.secondaryExerciseId!, p.date!, p.primarySets!, p.secondarySets!, p.multiplier ?? 1.2,
            { ...options, primaryId: p.primaryTempId!, secondaryId: p.secondaryTempId!, supersetId: p.supersetId! }); break;
        }
        requireUserId(userId);
        const database = await db(); const tx = database.transaction("operations", "readwrite");
        const current = await tx.store.get(op.id);
        if (current?.version === op.version) await tx.store.delete(op.id);
        await tx.done;
      } catch (error) {
        const database = await db(); const tx = database.transaction("operations", "readwrite");
        const current = await tx.store.get(op.id);
        if (current?.version === op.version) {
          current.retries++;
          current.failureKind = syncFailureKind(error);
          current.lastError = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
          current.nextAttemptAt = Date.now() + Math.min(300_000, 2 ** Math.min(current.retries, 8) * 1000);
          await tx.store.put(current);
        }
        await tx.done;
        if (op.type !== "delete_image") break; // Image cleanup must not block independent workout changes.
      } finally { await initSyncQueue(userId); channel?.postMessage(userId); }
    }
  } finally {
    clearInterval(renewal);
    const database = await db(); const tx = database.transaction("leases", "readwrite");
    if ((await tx.store.get(userId))?.token === token) await tx.store.delete(userId);
    await tx.done;
  }
}
export function processQueue({ force = false }: { force?: boolean } = {}): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return Promise.resolve();
  const existing = running.get(userId); if (existing) return existing;
  const work = typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(`gym-track-sync:${userId}`, { ifAvailable: true }, (lock) => lock ? flush(userId, force) : undefined)
    : flush(userId, force);
  const promise = Promise.resolve(work).finally(() => { running.delete(userId); });
  running.set(userId, promise); return promise;
}
