import { supabaseStore, ExerciseWithSessions } from "./supabaseStore";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Session = Database["public"]["Tables"]["sessions"]["Row"];
type SessionSet = Array<{ reps: number; weight: number }>;
type SyncPayload = {
  exerciseId?: string;
  sessionId?: string;
  primaryExerciseId?: string;
  secondaryExerciseId?: string;
  tempId?: string;
  primaryTempId?: string;
  secondaryTempId?: string;
  date?: string;
  sets?: SessionSet;
  primarySets?: SessionSet;
  secondarySets?: SessionSet;
  multiplier?: number;
  valueMultiplier?: number;
  name?: string;
  category?: string;
};

const CACHE_KEY = 'gym-tracker-cache';
const QUEUE_KEY = 'gym-tracker-sync-queue';
const ID_MAP_KEY = 'gym-tracker-id-map';

export interface SyncOperation {
  id: string;
  type: 'add_session' | 'update_session' | 'delete_session' | 'add_exercise' | 'delete_exercise' | 'add_superset_session';
  payload: SyncPayload;
  timestamp: number;
  retries: number;
}

// --- Cache ---
export function getCachedExercises(): ExerciseWithSessions[] | null {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function setCachedExercises(exercises: ExerciseWithSessions[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(exercises));
  } catch (e) {
    console.warn('Failed to write cache:', e);
  }
}

// --- ID Mapping (temp local IDs → real DB IDs) ---
function getIdMap(): Record<string, string> {
  try {
    const data = localStorage.getItem(ID_MAP_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function setIdMap(map: Record<string, string>): void {
  localStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
}

function resolveId(id: string): string {
  return getIdMap()[id] || id;
}

function addIdMapping(tempId: string, realId: string): void {
  const map = getIdMap();
  map[tempId] = realId;
  setIdMap(map);
}

// --- Sync Queue ---
export function getSyncQueue(): SyncOperation[] {
  try {
    const data = localStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSyncQueue(queue: SyncOperation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function addToSyncQueue(op: Omit<SyncOperation, 'id' | 'timestamp' | 'retries'>): void {
  const queue = getSyncQueue();

  if (op.type === 'update_session') {
    const sessionId = op.payload.sessionId;
    const queuedUpdate = queue.find((queuedOp) =>
      queuedOp.type === 'update_session' && queuedOp.payload.sessionId === sessionId
    );
    if (queuedUpdate) {
      queuedUpdate.payload = op.payload;
      queuedUpdate.timestamp = Date.now();
      queuedUpdate.retries = 0;
      saveSyncQueue(queue);
      return;
    }
  }

  queue.push({
    ...op,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    retries: 0,
  });
  saveSyncQueue(queue);
}

export function hasPendingChanges(): boolean {
  return getSyncQueue().length > 0;
}

// --- Apply pending operations on top of DB data ---
export function applyPendingOperations(dbData: ExerciseWithSessions[]): ExerciseWithSessions[] {
  const queue = getSyncQueue();
  if (queue.length === 0) return dbData;

  let result = dbData.map(e => ({ ...e, sessions: [...e.sessions] }));

  for (const op of queue) {
    switch (op.type) {
      case 'add_session': {
        const ex = result.find(e => e.id === op.payload.exerciseId);
        if (ex && !ex.sessions.some(s => s.id === op.payload.tempId)) {
          const sets = op.payload.sets as Array<{ reps: number; weight: number }>;
          const value = sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
          ex.sessions.push({
            id: op.payload.tempId,
            exercise_id: op.payload.exerciseId,
            date: op.payload.date,
            sets: op.payload.sets,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: null,
            is_superset_secondary: false,
          } as Session);
        }
        break;
      }
      case 'update_session': {
        const sessionId = op.payload.sessionId ? resolveId(op.payload.sessionId) : undefined;
        for (const ex of result) {
          const idx = ex.sessions.findIndex(s => s.id === sessionId || s.id === op.payload.sessionId);
          if (idx >= 0) {
            const sets = op.payload.sets as Array<{ reps: number; weight: number }>;
            const rawValue = sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
            const value = Math.round(rawValue * (op.payload.valueMultiplier ?? 1));
            ex.sessions[idx] = {
              ...ex.sessions[idx],
              date: op.payload.date,
              sets: op.payload.sets,
              series: sets.length,
              reps: sets[0]?.reps || 0,
              weight: sets[0]?.weight || 0,
              value,
            };
            break;
          }
        }
        break;
      }
      case 'delete_session': {
        const sessionId = op.payload.sessionId ? resolveId(op.payload.sessionId) : undefined;
        for (const ex of result) {
          ex.sessions = ex.sessions.filter(s => s.id !== sessionId && s.id !== op.payload.sessionId);
        }
        break;
      }
      case 'add_exercise': {
        if (!result.some(e => e.id === op.payload.tempId)) {
          result.unshift({
            id: op.payload.tempId,
            name: op.payload.name,
            category: op.payload.category,
            user_id: 'local',
            created_at: new Date(op.timestamp).toISOString(),
            description: null,
            image_url: null,
            personal_records: null,
            superset_multiplier: 1.2,
            unit: 'weight',
            sessions: [],
          });
        }
        break;
      }
      case 'delete_exercise': {
        result = result.filter(e => e.id !== op.payload.exerciseId);
        break;
      }
      case 'add_superset_session': {
        const supersetId = `temp-superset-${op.timestamp}`;
        // Primary
        const primaryEx = result.find(e => e.id === op.payload.primaryExerciseId);
        if (primaryEx && !primaryEx.sessions.some(s => s.id === op.payload.primaryTempId)) {
          const sets = op.payload.primarySets as Array<{ reps: number; weight: number }>;
          const value = sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
          primaryEx.sessions.push({
            id: op.payload.primaryTempId,
            exercise_id: op.payload.primaryExerciseId,
            date: op.payload.date,
            sets: op.payload.primarySets,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: supersetId,
            is_superset_secondary: false,
          } as Session);
        }
        // Secondary
        const secondaryEx = result.find(e => e.id === op.payload.secondaryExerciseId);
        if (secondaryEx && !secondaryEx.sessions.some(s => s.id === op.payload.secondaryTempId)) {
          const sets = op.payload.secondarySets as Array<{ reps: number; weight: number }>;
          const value = Math.round(sets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * op.payload.multiplier);
          secondaryEx.sessions.push({
            id: op.payload.secondaryTempId,
            exercise_id: op.payload.secondaryExerciseId,
            date: op.payload.date,
            sets: op.payload.secondarySets,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: supersetId,
            is_superset_secondary: true,
          } as Session);
        }
        break;
      }
    }
  }

  return result;
}

// --- Process Queue (sync to DB) ---
const MAX_RETRIES = 3;

export async function processQueue(): Promise<void> {
  const queue = getSyncQueue();
  if (queue.length === 0) return;

  console.log(`[Sync] Processing ${queue.length} pending operations...`);

  for (const op of queue) {
    try {
      const p = { ...op.payload };
      let shouldRemoveOperation = true;

      // Resolve temp IDs to real DB IDs
      if (p.exerciseId) p.exerciseId = resolveId(p.exerciseId);
      if (p.sessionId) p.sessionId = resolveId(p.sessionId);
      if (p.primaryExerciseId) p.primaryExerciseId = resolveId(p.primaryExerciseId);
      if (p.secondaryExerciseId) p.secondaryExerciseId = resolveId(p.secondaryExerciseId);

      switch (op.type) {
        case 'add_session': {
          const result = await supabaseStore.addSession(p.exerciseId, {
            date: p.date,
            sets: p.sets,
          });
          if (p.tempId) addIdMapping(p.tempId, result.id);
          break;
        }
        case 'update_session': {
          if (p.sessionId.startsWith('temp-')) {
            shouldRemoveOperation = false;
            break;
          }
          await supabaseStore.updateSession(p.sessionId, {
            date: p.date,
            sets: p.sets,
          }, {
            valueMultiplier: p.valueMultiplier ?? 1,
          });
          break;
        }
        case 'delete_session': {
          if (p.sessionId.startsWith('temp-')) break;
          await supabaseStore.deleteSession(p.sessionId);
          break;
        }
        case 'add_exercise': {
          const result = await supabaseStore.addExercise({
            name: p.name,
            category: p.category,
          });
          if (p.tempId) addIdMapping(p.tempId, result.id);
          break;
        }
        case 'delete_exercise': {
          if (p.exerciseId.startsWith('temp-')) break;
          await supabaseStore.deleteExercise(p.exerciseId);
          break;
        }
        case 'add_superset_session': {
          const result = await supabaseStore.addSupersetSession(
            p.primaryExerciseId,
            p.secondaryExerciseId,
            p.date,
            p.primarySets,
            p.secondarySets,
            p.multiplier
          );
          if (p.primaryTempId) addIdMapping(p.primaryTempId, result.primary.id);
          if (p.secondaryTempId) addIdMapping(p.secondaryTempId, result.secondary.id);
          break;
        }
      }

      // Remove successfully processed operation
      if (shouldRemoveOperation) {
        const currentQueue = getSyncQueue();
        saveSyncQueue(currentQueue.filter(q => q.id !== op.id || q.timestamp !== op.timestamp));
        console.log(`[Sync] ✓ ${op.type}`);
      } else {
        console.log(`[Sync] → ${op.type} waiting for ID mapping`);
      }
    } catch (error) {
      console.error(`[Sync] ✗ ${op.type}:`, error);
      const currentQueue = getSyncQueue();
      const idx = currentQueue.findIndex(q => q.id === op.id);
      if (idx >= 0) {
        currentQueue[idx].retries = (currentQueue[idx].retries || 0) + 1;
        if (currentQueue[idx].retries >= MAX_RETRIES) {
          currentQueue.splice(idx, 1);
          toast.error(`Sincronizzazione fallita per ${op.type}. I dati potrebbero non essere stati salvati.`);
        }
        saveSyncQueue(currentQueue);
      }
    }
  }

  const remaining = getSyncQueue();
  if (remaining.length === 0) {
    console.log('[Sync] Tutto sincronizzato ✓');
  } else {
    console.log(`[Sync] ${remaining.length} operazioni in attesa`);
  }
}
