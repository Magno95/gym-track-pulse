
import { ExerciseWithSessions } from "./supabaseStore";
import type { Database, Json } from "@/integrations/supabase/types";


type Session = Database["public"]["Tables"]["sessions"]["Row"];
import { getCurrentUserId } from "./authSession";
import { getSyncQueue } from "./syncQueue";
export { getSyncQueue, addToSyncQueue, processQueue, hasPendingChanges, initSyncQueue, subscribeToSync } from "./syncQueue";
export type { SyncOperation } from "./syncQueue";

const cacheKey = (owner: string) => `gym-track-overview:v2:${owner}`;
type Cache = { userId: string; updatedAt: number; data: ExerciseWithSessions[] };
function readCache(owner: string | null): Cache | null {
  if (!owner) return null;
  try {
    const value: Cache | null = JSON.parse(localStorage.getItem(cacheKey(owner)) ?? "null");
    if (!value || value.userId !== owner || !Array.isArray(value.data) || !Number.isFinite(value.updatedAt)) return null;
    if (value.data.some((exercise) => exercise.user_id !== owner || !Array.isArray(exercise.sessions))) return null;
    return value;
  } catch { return null; }
}
export function getCachedExercises(owner = getCurrentUserId()) { return readCache(owner)?.data ?? null; }
export function getCacheUpdatedAt(owner = getCurrentUserId()) { return readCache(owner)?.updatedAt ?? 0; }
export function setCachedExercises(exercises: ExerciseWithSessions[], owner = getCurrentUserId()) {
  if (!owner || owner !== getCurrentUserId()) return;
  try {
    const data = exercises.filter((exercise) => exercise.user_id === owner)
      .map((exercise) => ({ ...exercise, sessions: exercise.sessions.slice(-2) }));
    localStorage.setItem(cacheKey(owner), JSON.stringify({ userId: owner, updatedAt: Date.now(), data }));
  } catch (error) { console.warn("Cache non disponibile", error); }
}

// --- Apply pending operations on top of DB data ---
export function applyPendingOperations(dbData: ExerciseWithSessions[], queue = getSyncQueue()): ExerciseWithSessions[] {
  if (queue.length === 0) return dbData;

  let result = dbData.map(e => ({ ...e, sessions: [...e.sessions] }));

  for (const op of queue) {
    if (op.userId !== getCurrentUserId()) continue;
    switch (op.type) {
      case 'add_session': {
        const ex = result.find(e => e.id === op.payload.exerciseId);
        if (ex && !ex.sessions.some(s => s.id === op.payload.tempId)) {
          const sets = op.payload.sets as Array<{ reps: number; weight: number }>;
          const value = Math.round(sets.reduce((sum, set) => sum + (set.reps * set.weight), 0));
          ex.sessions.push({
            id: op.payload.tempId!,
            exercise_id: op.payload.exerciseId,
            date: op.payload.date!,
            sets: op.payload.sets as unknown as Json,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            value_multiplier: 1,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: null,
            is_superset_secondary: false,
          } as Session);
        }
        break;
      }
      case 'update_session': {
        const sessionId = op.payload.sessionId;
        const sets = op.payload.sets as Array<{ reps: number; weight: number }>;
        const fields = {
          date: op.payload.date!, sets: op.payload.sets as unknown as Json,
          series: sets.length, reps: sets[0]?.reps || 0, weight: sets[0]?.weight || 0,
          value: Math.round(sets.reduce((sum, set) => sum + set.reps * set.weight, 0) * (op.payload.valueMultiplier ?? 1)),
          value_multiplier: op.payload.valueMultiplier ?? 1,
        };
        let found = false;
        for (const ex of result) {
          const idx = ex.sessions.findIndex(s => s.id === sessionId);
          if (idx >= 0) {
            ex.sessions[idx] = { ...ex.sessions[idx], ...fields };
            found = true;
            break;
          }
        }
        // A date-filtered query may not contain the original row. Project its edit
        // using the metadata persisted with the operation, including superset identity.
        const exercise = !found && result.find((ex) => ex.id === op.payload.exerciseId);
        if (exercise && sessionId) exercise.sessions.push({
          ...fields, id: sessionId, exercise_id: exercise.id, created_at: new Date(op.timestamp).toISOString(),
          superset_id: op.payload.supersetId ?? null, is_superset_secondary: op.payload.isSupersetSecondary ?? false,
        });
        break;
      }
      case 'delete_session': {
        const sessionId = op.payload.sessionId ? op.payload.sessionId : undefined;
        for (const ex of result) {
          ex.sessions = ex.sessions.filter(s => s.id !== sessionId && s.id !== op.payload.sessionId);
        }
        break;
      }
      case 'add_exercise': {
        if (!result.some(e => e.id === op.payload.tempId)) {
          result.unshift({
            id: op.payload.tempId!,
            name: op.payload.name!,
            category: op.payload.category!,
            user_id: op.userId,
            created_at: new Date(op.timestamp).toISOString(),
            description: null,
            image_url: null,
            personal_records: null,
            superset_multiplier: 1.2,
            unit: 'weight',
            is_bodyweight: false,
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
        const supersetId = op.payload.supersetId!;
        // Primary
        const primaryEx = result.find(e => e.id === op.payload.primaryExerciseId);
        if (primaryEx && !primaryEx.sessions.some(s => s.id === op.payload.primaryTempId)) {
          const sets = op.payload.primarySets as Array<{ reps: number; weight: number }>;
          const value = Math.round(sets.reduce((sum, set) => sum + (set.reps * set.weight), 0));
          primaryEx.sessions.push({
            id: op.payload.primaryTempId,
            exercise_id: op.payload.primaryExerciseId,
            date: op.payload.date!,
            sets: op.payload.primarySets as unknown as Json,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            value_multiplier: 1,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: supersetId,
            is_superset_secondary: false,
          } as Session);
        }
        // Secondary
        const secondaryEx = result.find(e => e.id === op.payload.secondaryExerciseId);
        if (secondaryEx && !secondaryEx.sessions.some(s => s.id === op.payload.secondaryTempId)) {
          const sets = op.payload.secondarySets as Array<{ reps: number; weight: number }>;
          const value = Math.round(sets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * (op.payload.multiplier ?? 1.2));
          secondaryEx.sessions.push({
            id: op.payload.secondaryTempId,
            exercise_id: op.payload.secondaryExerciseId,
            date: op.payload.date!,
            sets: op.payload.secondarySets as unknown as Json,
            series: sets.length,
            reps: sets[0]?.reps || 0,
            weight: sets[0]?.weight || 0,
            value,
            value_multiplier: op.payload.multiplier ?? 1.2,
            created_at: new Date(op.timestamp).toISOString(),
            superset_id: supersetId,
            is_superset_secondary: true,
          } as Session);
        }
        break;
      }
    }
  }

  for (const exercise of result) exercise.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return result;
}
