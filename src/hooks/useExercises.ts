import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";

export const EXERCISES_QUERY_KEY = ["exercises"];

export function useExercises() {
  return useQuery({
    queryKey: EXERCISES_QUERY_KEY,
    queryFn: () => supabaseStore.getAll(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });
}

export function useExercise(id: string | undefined) {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ["exercise", id],
    queryFn: () => supabaseStore.getById(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    initialData: () => {
      // Try to get data from the exercises list cache
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
