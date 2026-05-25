import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExerciseWithSessions } from "@/lib/supabaseStore";
import { EXERCISES_QUERY_KEY } from "./useExercises";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";
import { getCachedExercises, setCachedExercises, addToSyncQueue } from "@/lib/localCache";

type Session = Database["public"]["Tables"]["sessions"]["Row"];
type SessionSet = Array<{ reps: number; weight: number }>;
type UpdateSessionParams = {
  sessionId: string;
  date: string;
  sets: SessionSet;
  valueMultiplier?: number;
  suppressToast?: boolean;
};

function createSessionObject(
  id: string,
  exerciseId: string,
  date: string,
  sets: SessionSet,
  supersetId: string | null = null,
  isSupersetSecondary: boolean = false,
  valueMultiplier: number = 1
): Session {
  const rawValue = sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
  const value = Math.round(rawValue * valueMultiplier);
  return {
    id,
    exercise_id: exerciseId,
    date,
    sets: sets as unknown as Database["public"]["Tables"]["sessions"]["Row"]["sets"],
    series: sets.length,
    reps: sets[0]?.reps || 0,
    weight: sets[0]?.weight || 0,
    value,
    created_at: new Date().toISOString(),
    superset_id: supersetId,
    is_superset_secondary: isSupersetSecondary,
  };
}

function updateExerciseInAllCaches(
  exerciseId: string,
  updater: (ex: ExerciseWithSessions) => ExerciseWithSessions,
  queryClient: ReturnType<typeof useQueryClient>
) {
  // Update react-query exercise detail cache
  queryClient.setQueryData<ExerciseWithSessions>(["exercise", exerciseId], (old) => {
    if (!old) return old;
    return updater(old);
  });

  // Update react-query exercises list cache
  queryClient.setQueryData<ExerciseWithSessions[]>(EXERCISES_QUERY_KEY, (old) => {
    if (!old) return old;
    return old.map(e => e.id === exerciseId ? updater(e) : e);
  });

  // Update localStorage cache
  const cache = getCachedExercises();
  if (cache) {
    const idx = cache.findIndex(e => e.id === exerciseId);
    if (idx >= 0) {
      cache[idx] = updater(cache[idx]);
    }
    setCachedExercises(cache);
  }
}

// --- Add Session (local-first) ---
export function useAddSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { date: string; sets: SessionSet }) => {
      const tempId = `temp-${Date.now()}`;
      const session = createSessionObject(tempId, exerciseId, params.date, params.sets);

      // Update all caches instantly
      updateExerciseInAllCaches(exerciseId, (ex) => ({
        ...ex,
        sessions: [...ex.sessions, session],
      }), queryClient);

      // Queue for background DB sync
      addToSyncQueue({
        type: 'add_session',
        payload: { exerciseId, date: params.date, sets: params.sets, tempId },
      });

      return session;
    },
    onSuccess: (_, params) => {
      const totalValue = params.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      toast.success(`${params.sets.length} sets logged (Total: ${totalValue})`);
    },
  });
}

// --- Add Superset Session (local-first) ---
export function useAddSupersetSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      primaryExerciseId: string;
      secondaryExerciseId: string;
      date: string;
      primarySets: SessionSet;
      secondarySets: SessionSet;
      multiplier: number;
    }) => {
      const supersetId = crypto.randomUUID();
      const primaryTempId = `temp-primary-${Date.now()}`;
      const secondaryTempId = `temp-secondary-${Date.now()}`;

      const primarySession = createSessionObject(
        primaryTempId, params.primaryExerciseId, params.date, params.primarySets, supersetId, false
      );
      const secondarySession = createSessionObject(
        secondaryTempId, params.secondaryExerciseId, params.date, params.secondarySets, supersetId, true, params.multiplier
      );

      updateExerciseInAllCaches(params.primaryExerciseId, (ex) => ({
        ...ex,
        sessions: [...ex.sessions, primarySession],
      }), queryClient);

      updateExerciseInAllCaches(params.secondaryExerciseId, (ex) => ({
        ...ex,
        sessions: [...ex.sessions, secondarySession],
      }), queryClient);

      addToSyncQueue({
        type: 'add_superset_session',
        payload: {
          primaryExerciseId: params.primaryExerciseId,
          secondaryExerciseId: params.secondaryExerciseId,
          date: params.date,
          primarySets: params.primarySets,
          secondarySets: params.secondarySets,
          multiplier: params.multiplier,
          primaryTempId,
          secondaryTempId,
        },
      });

      return { primary: primarySession, secondary: secondarySession };
    },
    onSuccess: (_, params) => {
      const primaryValue = params.primarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      const secondaryValue = Math.round(params.secondarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * params.multiplier);
      toast.success(`Superset logged! (${primaryValue} + ${secondaryValue} with ${params.multiplier}x bonus)`);
    },
  });
}

// --- Update Session (local-first) ---
export function useUpdateSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSessionParams) => {
      const rawValue = params.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      const value = Math.round(rawValue * (params.valueMultiplier ?? 1));
      const updatedFields = {
        date: params.date,
        sets: params.sets as unknown as Database["public"]["Tables"]["sessions"]["Row"]["sets"],
        series: params.sets.length,
        reps: params.sets[0]?.reps || 0,
        weight: params.sets[0]?.weight || 0,
        value,
      };

      updateExerciseInAllCaches(exerciseId, (ex) => ({
        ...ex,
        sessions: ex.sessions.map(s =>
          s.id === params.sessionId ? { ...s, ...updatedFields } : s
        ),
      }), queryClient);

      addToSyncQueue({
        type: 'update_session',
        payload: {
          sessionId: params.sessionId,
          date: params.date,
          sets: params.sets,
          valueMultiplier: params.valueMultiplier ?? 1,
        },
      });
    },
    onSuccess: (_, params) => {
      if (!params.suppressToast) {
        toast.success("Session updated successfully");
      }
    },
  });
}

// --- Delete Session (local-first) ---
export function useDeleteSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      updateExerciseInAllCaches(exerciseId, (ex) => ({
        ...ex,
        sessions: ex.sessions.filter(s => s.id !== sessionId),
      }), queryClient);

      addToSyncQueue({
        type: 'delete_session',
        payload: { sessionId },
      });
    },
    onSuccess: () => {
      toast.success("Session deleted successfully");
    },
  });
}
