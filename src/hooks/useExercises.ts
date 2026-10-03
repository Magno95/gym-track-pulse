import { saveQueryCache } from "@/lib/queryCache";
import { useCachedQuery } from "./useCachedQuery";
import { useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseStore, type ExerciseWithSessions } from "@/lib/supabaseStore";
import { getCachedExercises, getCacheUpdatedAt, setCachedExercises, applyPendingOperations, getSyncQueue, subscribeToSync } from "@/lib/localCache";
import { useAuth } from "./useAuth";

export const exercisesKey = (userId: string | null) => ["exercises", userId];
export const exerciseKey = (userId: string | null, id: string | undefined) => ["exercise", userId, id];

function usePendingOverlay(data: ExerciseWithSessions[] | undefined) {
  const queue = useSyncExternalStore(subscribeToSync, getSyncQueue);
  return useMemo(() => applyPendingOperations(data ?? [], queue), [data, queue]);
}
export function useExercises() {
  const { userId } = useAuth();
  const query = useQuery({
    queryKey: exercisesKey(userId), enabled: !!userId,
    queryFn: async ({ signal }) => {
      const data = await supabaseStore.getAll({ userId: userId!, signal });
      setCachedExercises(data, userId); return data;
    },
    staleTime: 60_000, gcTime: 30 * 60_000,
    initialData: () => getCachedExercises(userId) ?? undefined,
    initialDataUpdatedAt: () => getCacheUpdatedAt(userId),
  });
  return { ...query, data: usePendingOverlay(query.data) };
}
export function useExercise(id: string | undefined) {
  const { userId } = useAuth(); const client = useQueryClient();
  useCachedQuery<ExerciseWithSessions | null>(exerciseKey(userId, id), userId);
  const query = useQuery<ExerciseWithSessions | null>({
    queryKey: exerciseKey(userId, id), enabled: !!id && !!userId,
    queryFn: async ({ signal }) => {
      const data = await supabaseStore.getById(id!, { userId: userId!, signal });
      await saveQueryCache(exerciseKey(userId, id), userId!, data); return data;
    },
    staleTime: 60_000, gcTime: 30 * 60_000,
    // An overview contains only the latest two sessions, so it cannot seed a full-history query.
    placeholderData: () => client.getQueryData<ExerciseWithSessions[]>(exercisesKey(userId))?.find((exercise) => exercise.id === id)
      ?? getCachedExercises(userId)?.find((exercise) => exercise.id === id),
  });
  const fallback = query.data ?? client.getQueryData<ExerciseWithSessions[]>(exercisesKey(userId))?.find((exercise) => exercise.id === id)
    ?? getCachedExercises(userId)?.find((exercise) => exercise.id === id);
  const base = useMemo(() => fallback ? [fallback] : [], [fallback]);
  const data = usePendingOverlay(base).find((exercise) => exercise.id === id) ?? null;
  return { ...query, data, hasCompleteHistory: !!query.data && !query.isPlaceholderData };
}
export function useSessionHistory(enabled: boolean) {
  const { userId } = useAuth();
  useCachedQuery<ExerciseWithSessions[]>(["session-history", userId], userId);
  const query = useQuery({ queryKey: ["session-history", userId], enabled: !!userId && enabled,
    queryFn: async ({ signal }) => { const data = await supabaseStore.getHistory({ userId: userId!, signal });
      await saveQueryCache(["session-history", userId], userId!, data); return data; }, staleTime: 60_000 });
  const base = useMemo(() => query.data ?? (getCachedExercises(userId) ?? []).map((exercise) => ({ ...exercise, sessions: [] })), [query.data, userId]);
  return { ...query, data: usePendingOverlay(base), hasCompleteHistory: !!query.data };
}
export function useDaySession(date: string | undefined) {
  const { userId } = useAuth();
  useCachedQuery<ExerciseWithSessions[]>(["day-session", userId, date], userId);
  const query = useQuery({ queryKey: ["day-session", userId, date], enabled: !!userId && !!date,
    queryFn: async ({ signal }) => { const data = await supabaseStore.getForDate(date!, { userId: userId!, signal });
      await saveQueryCache(["day-session", userId, date], userId!, data); return data; }, staleTime: 60_000 });
  const base = useMemo(() => query.data ?? (getCachedExercises(userId) ?? []).map((exercise) => ({ ...exercise, sessions: [] })), [query.data, userId]);
  const data = usePendingOverlay(base);
  return { ...query, data, hasCompleteHistory: !!query.data };
}
export function useInvalidateExercises() {
  const client = useQueryClient(); const { userId } = useAuth();
  return {
    invalidateAll: () => client.invalidateQueries({ queryKey: exercisesKey(userId) }),
    invalidateOne: async (id: string) => {
      await Promise.all([client.invalidateQueries({ queryKey: exerciseKey(userId, id) }),
        client.invalidateQueries({ queryKey: exercisesKey(userId) }), client.invalidateQueries({ queryKey: ["day-session", userId] }),
        client.invalidateQueries({ queryKey: ["session-history", userId] })]);
    },
  };
}
