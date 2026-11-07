import { createUuid } from "@/lib/uuid";
import type { SessionSet } from "@/lib/bodyweight";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { addToSyncQueue } from "@/lib/localCache";
import { buildSessionPayload } from "@/lib/supabaseStore";
import { validateSession } from "@/lib/validation";
import { useAuth } from "./useAuth";

const onError = (error: Error) => toast.error(error.message || "Could not save changes on this device. Please retry.");
type UpdateSessionParams = { sessionId: string; date: string; sets: SessionSet[]; valueMultiplier?: number;
  supersetId?: string | null; isSupersetSecondary?: boolean };

export function useAddSession(exerciseId: string) {
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async (params: { date: string; sets: SessionSet[] }) => {
      validateSession(params);
      const id = createUuid();
      await addToSyncQueue({ type: "add_session", payload: { exerciseId, ...params, tempId: id } }, userId);
      return { id, exercise_id: exerciseId, ...buildSessionPayload(params) };
    }, onError,
  });
}
export function useAddSupersetSession() {
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async (params: { primaryExerciseId: string; secondaryExerciseId: string; date: string; primarySets: SessionSet[]; secondarySets: SessionSet[]; multiplier: number }) => {
      validateSession({ date: params.date, sets: params.primarySets });
      validateSession({ date: params.date, sets: params.secondarySets }, params.multiplier);
      if (params.primaryExerciseId === params.secondaryExerciseId) throw new Error("Choose two different exercises.");
      const primaryTempId = createUuid(), secondaryTempId = createUuid(), supersetId = createUuid();
      await addToSyncQueue({ type: "add_superset_session", payload: { ...params, primaryTempId, secondaryTempId, supersetId } }, userId);
      return { primary: { id: primaryTempId }, secondary: { id: secondaryTempId }, supersetId };
    }, onError,
  });
}
export function useUpdateSession(exerciseId: string) {
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async (params: UpdateSessionParams) => {
      validateSession(params, params.valueMultiplier ?? 1);
      await addToSyncQueue({ type: "update_session", payload: { exerciseId, sessionId: params.sessionId, date: params.date,
        sets: params.sets, valueMultiplier: params.valueMultiplier ?? 1, supersetId: params.supersetId,
        isSupersetSecondary: params.isSupersetSecondary } }, userId);
    },
    onError,
  });
}
export function useDeleteSession(_exerciseId: string) {
  const { userId } = useAuth();
  return useMutation({ mutationFn: async (sessionId: string) => { await addToSyncQueue({ type: "delete_session", payload: { sessionId } }, userId); }, onError });
}
