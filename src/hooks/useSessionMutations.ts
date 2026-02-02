import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseStore, ExerciseWithSessions } from "@/lib/supabaseStore";
import { EXERCISES_QUERY_KEY } from "./useExercises";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt}/${retries} failed:`, error);
      
      if (attempt < retries) {
        // Exponential backoff
        await sleep(delay * attempt);
      }
    }
  }
  
  throw lastError;
}

interface AddSessionParams {
  exerciseId: string;
  date: string;
  sets: Array<{ reps: number; weight: number }>;
}

interface AddSupersetParams {
  primaryExerciseId: string;
  secondaryExerciseId: string;
  date: string;
  primarySets: Array<{ reps: number; weight: number }>;
  secondarySets: Array<{ reps: number; weight: number }>;
  multiplier: number;
}

interface UpdateSessionParams {
  sessionId: string;
  date: string;
  sets: Array<{ reps: number; weight: number }>;
}

export function useAddSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: Omit<AddSessionParams, 'exerciseId'>) => {
      return retryOperation(() => 
        supabaseStore.addSession(exerciseId, {
          date: params.date,
          sets: params.sets,
        })
      );
    },
    onMutate: async (params) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: EXERCISES_QUERY_KEY });
      await queryClient.cancelQueries({ queryKey: ["exercise", exerciseId] });

      // Snapshot the previous values
      const previousExercises = queryClient.getQueryData<ExerciseWithSessions[]>(EXERCISES_QUERY_KEY);
      const previousExercise = queryClient.getQueryData<ExerciseWithSessions>(["exercise", exerciseId]);

      // Calculate optimistic session
      const value = params.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      const optimisticSession: Partial<Session> = {
        id: `temp-${Date.now()}`,
        exercise_id: exerciseId,
        date: params.date,
        sets: params.sets as unknown as Database["public"]["Tables"]["sessions"]["Row"]["sets"],
        series: params.sets.length,
        reps: params.sets[0]?.reps || 0,
        weight: params.sets[0]?.weight || 0,
        value,
        created_at: new Date().toISOString(),
        superset_id: null,
        is_superset_secondary: false,
      };

      // Optimistically update the exercise detail cache
      if (previousExercise) {
        queryClient.setQueryData<ExerciseWithSessions>(["exercise", exerciseId], {
          ...previousExercise,
          sessions: [...previousExercise.sessions, optimisticSession as Session],
        });
      }

      return { previousExercises, previousExercise };
    },
    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previousExercises) {
        queryClient.setQueryData(EXERCISES_QUERY_KEY, context.previousExercises);
      }
      if (context?.previousExercise) {
        queryClient.setQueryData(["exercise", exerciseId], context.previousExercise);
      }
      console.error("Failed to add session:", err);
      toast.error("Failed to save session. Please try again.");
    },
    onSuccess: (data, params) => {
      const totalValue = params.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      toast.success(`${params.sets.length} sets logged (Total: ${totalValue})`);
    },
    onSettled: () => {
      // Always refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["exercise", exerciseId] });
    },
  });
}

export function useAddSupersetSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddSupersetParams) => {
      return retryOperation(() =>
        supabaseStore.addSupersetSession(
          params.primaryExerciseId,
          params.secondaryExerciseId,
          params.date,
          params.primarySets,
          params.secondarySets,
          params.multiplier
        )
      );
    },
    onError: (err) => {
      console.error("Failed to add superset session:", err);
      toast.error("Failed to save superset. Please try again.");
    },
    onSuccess: (data, params) => {
      const primaryValue = params.primarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
      const secondaryValue = Math.round(params.secondarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * params.multiplier);
      toast.success(`Superset logged! (${primaryValue} + ${secondaryValue} with ${params.multiplier}x bonus)`);
    },
    onSettled: (data, error, params) => {
      queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["exercise", params.primaryExerciseId] });
      queryClient.invalidateQueries({ queryKey: ["exercise", params.secondaryExerciseId] });
    },
  });
}

export function useUpdateSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateSessionParams) => {
      return retryOperation(() =>
        supabaseStore.updateSession(params.sessionId, {
          date: params.date,
          sets: params.sets,
        })
      );
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["exercise", exerciseId] });

      const previousExercise = queryClient.getQueryData<ExerciseWithSessions>(["exercise", exerciseId]);

      if (previousExercise) {
        const value = params.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
        const updatedSessions = previousExercise.sessions.map(session =>
          session.id === params.sessionId
            ? {
                ...session,
                date: params.date,
                sets: params.sets as unknown as Database["public"]["Tables"]["sessions"]["Row"]["sets"],
                series: params.sets.length,
                reps: params.sets[0]?.reps || 0,
                weight: params.sets[0]?.weight || 0,
                value,
              }
            : session
        );

        queryClient.setQueryData<ExerciseWithSessions>(["exercise", exerciseId], {
          ...previousExercise,
          sessions: updatedSessions,
        });
      }

      return { previousExercise };
    },
    onError: (err, params, context) => {
      if (context?.previousExercise) {
        queryClient.setQueryData(["exercise", exerciseId], context.previousExercise);
      }
      console.error("Failed to update session:", err);
      toast.error("Failed to update session. Please try again.");
    },
    onSuccess: () => {
      toast.success("Session updated successfully");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["exercise", exerciseId] });
    },
  });
}

export function useDeleteSession(exerciseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return retryOperation(() => supabaseStore.deleteSession(sessionId));
    },
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: ["exercise", exerciseId] });

      const previousExercise = queryClient.getQueryData<ExerciseWithSessions>(["exercise", exerciseId]);

      if (previousExercise) {
        queryClient.setQueryData<ExerciseWithSessions>(["exercise", exerciseId], {
          ...previousExercise,
          sessions: previousExercise.sessions.filter(s => s.id !== sessionId),
        });
      }

      return { previousExercise };
    },
    onError: (err, sessionId, context) => {
      if (context?.previousExercise) {
        queryClient.setQueryData(["exercise", exerciseId], context.previousExercise);
      }
      console.error("Failed to delete session:", err);
      toast.error("Failed to delete session. Please try again.");
    },
    onSuccess: () => {
      toast.success("Session deleted successfully");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["exercise", exerciseId] });
    },
  });
}
