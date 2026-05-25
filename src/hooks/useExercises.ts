import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { getCachedExercises, setCachedExercises, applyPendingOperations } from "@/lib/localCache";

export const EXERCISES_QUERY_KEY = ["exercises"];

export function useExercises() {
  return useQuery({
    queryKey: EXERCISES_QUERY_KEY,
    queryFn: async () => {
      const dbData = await supabaseStore.getAll();
      // Apply any pending local changes on top of DB data
      const merged = applyPendingOperations(dbData);
      setCachedExercises(merged);
      return merged;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Use localStorage cache for instant initial display
    initialData: () => getCachedExercises() ?? undefined,
  });
}

export function useExercise(id: string | undefined) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ["exercise", id],
    queryFn: async () => {
      const data = await supabaseStore.getById(id!);
      if (data) {
        // Apply pending operations for this exercise
        const merged = applyPendingOperations([data]);
        return merged[0] || null;
      }
      return null;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    initialData: () => {
      // Try localStorage cache first
      const cached = getCachedExercises();
      const fromCache = cached?.find((e) => e.id === id);
      if (fromCache) return fromCache;
      // Then try react-query exercises list
      const exercises = queryClient.getQueryData<ExerciseWithSessions[]>(EXERCISES_QUERY_KEY);
      return exercises?.find((e) => e.id === id) ?? undefined;
    },
  });
}

export function useInvalidateExercises() {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY }),
    invalidateOne: (id: string) => {
      queryClient.invalidateQueries({ queryKey: ["exercise", id] });
      queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
    },
  };
}
