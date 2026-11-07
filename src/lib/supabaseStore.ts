import { createUuid } from "@/lib/uuid";
import { imagePath, thumbnailPath } from "./exerciseImages";
import type { SessionSet } from "@/lib/bodyweight";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { requireUserId, AuthSessionError } from "./authSession";
import { readAllPages } from "./pagination";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
export interface ExerciseWithSessions extends Exercise { sessions: Session[] }
type RequestOptions = { userId?: string; signal?: AbortSignal };
type WriteOptions = RequestOptions & { id?: string; valueMultiplier?: number };
const signalFor = (signal?: AbortSignal) => signal ?? AbortSignal.timeout(25_000);

export const buildSessionPayload = (session: { date: string; sets: SessionSet[] }, valueMultiplier = 1) => ({
  date: session.date, sets: session.sets, series: session.sets.length,
  reps: session.sets[0]?.reps ?? 0, weight: session.sets[0]?.weight ?? 0,
  value: Math.round(session.sets.reduce((sum, set) => sum + set.reps * set.weight, 0) * valueMultiplier),
  value_multiplier: valueMultiplier,
});

async function authenticateWrite(expected?: string) {
  const userId = requireUserId(expected);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw new AuthSessionError("Sign in again to synchronize changes.");
  requireUserId(userId);
  return userId;
}
function group(exercises: ExerciseWithSessions[], sessions: Session[]) {
  const grouped = new Map(exercises.map((exercise) => [exercise.id, { ...exercise, sessions: [] as Session[] }]));
  for (const session of sessions) grouped.get(session.exercise_id)?.sessions.push(session);
  return [...grouped.values()];
}
const summaryColumns = "id,exercise_id,date,series,reps,weight,value,value_multiplier,created_at,superset_id,is_superset_secondary,exercises!inner(user_id)";

export const supabaseStore = {
  getAll: async (options: RequestOptions = {}): Promise<ExerciseWithSessions[]> => {
    const userId = requireUserId(options.userId);
    const rows = await readAllPages((from, to) => supabase.rpc("get_exercise_overview", { p_user_id: userId })
      .range(from, to).abortSignal(signalFor(options.signal)));
    requireUserId(userId);
    return rows.map((row) => ({ ...(row.exercise as unknown as Exercise), sessions: row.sessions as unknown as Session[] }));
  },
  getById: async (id: string, options: RequestOptions = {}): Promise<ExerciseWithSessions | null> => {
    const userId = requireUserId(options.userId);
    const { data: exercise, error } = await supabase.from("exercises").select("*").eq("id", id).eq("user_id", userId)
      .abortSignal(signalFor(options.signal)).maybeSingle();
    if (error) throw error;
    if (!exercise) return null;
    const sessions = await readAllPages((from, to) => supabase.from("sessions").select("*").eq("exercise_id", id)
      .order("date").order("id").range(from, to).abortSignal(signalFor(options.signal)));
    requireUserId(userId);
    return { ...exercise, sessions };
  },
  getHistory: async (options: RequestOptions = {}): Promise<ExerciseWithSessions[]> => {
    const userId = requireUserId(options.userId);
    const [exercises, rows] = await Promise.all([
      supabaseStore.getAll(options),
      readAllPages((from, to) => supabase.from("sessions").select(summaryColumns).eq("exercises.user_id", userId)
        .order("date").order("id").range(from, to).abortSignal(signalFor(options.signal))),
    ]);
    requireUserId(userId);
    return group(exercises, rows.map(({ exercises: _owner, ...session }) => ({ ...session, sets: null })));
  },
  getForDate: async (date: string, options: RequestOptions = {}): Promise<ExerciseWithSessions[]> => {
    const userId = requireUserId(options.userId);
    const [exercises, sessions] = await Promise.all([
      supabaseStore.getAll(options),
      readAllPages((from, to) => supabase.from("sessions").select("*,exercises!inner(user_id)").eq("date", date)
        .eq("exercises.user_id", userId).order("id").range(from, to).abortSignal(signalFor(options.signal))),
    ]);
    requireUserId(userId);
    return group(exercises, sessions);
  },
  addExercise: async (exercise: Omit<ExerciseInsert, "id" | "user_id" | "created_at">, options: WriteOptions = {}): Promise<Exercise> => {
    const userId = await authenticateWrite(options.userId); const id = options.id ?? createUuid();
    const { error } = await supabase.from("exercises").upsert({ ...exercise, id, user_id: userId }, { onConflict: "id", ignoreDuplicates: true })
      .abortSignal(signalFor(options.signal));
    if (error) throw error;
    const result = await supabase.from("exercises").select("*").eq("id", id).eq("user_id", userId)
      .abortSignal(signalFor(options.signal)).single();
    if (result.error) throw result.error; requireUserId(userId); return result.data;
  },
  addSession: async (exerciseId: string, session: { date: string; sets: SessionSet[] }, options: WriteOptions = {}): Promise<Session> => {
    const userId = await authenticateWrite(options.userId); const id = options.id ?? createUuid();
    const { error } = await supabase.from("sessions").upsert({ ...buildSessionPayload(session, options.valueMultiplier), id, exercise_id: exerciseId },
      { onConflict: "id", ignoreDuplicates: true }).abortSignal(signalFor(options.signal));
    if (error) throw error;
    const result = await supabase.from("sessions").select("*").eq("id", id).abortSignal(signalFor(options.signal)).single();
    if (result.error) throw result.error; requireUserId(userId); return result.data;
  },
  addSupersetSession: async (primaryExerciseId: string, secondaryExerciseId: string, date: string, primarySets: SessionSet[], secondarySets: SessionSet[], multiplier = 1.2,
    options: RequestOptions & { primaryId?: string; secondaryId?: string; supersetId?: string } = {}): Promise<{ primary: Session; secondary: Session }> => {
    const userId = await authenticateWrite(options.userId);
    if (primaryExerciseId === secondaryExerciseId) throw new Error("Choose two different exercises.");
    const primaryId = options.primaryId ?? createUuid(), secondaryId = options.secondaryId ?? createUuid();
    const supersetId = options.supersetId ?? createUuid();
    // One statement: validation/RLS failure rolls back both rows. Stable IDs make retries idempotent.
    const { error } = await supabase.from("sessions").upsert([
      { ...buildSessionPayload({ date, sets: primarySets }), id: primaryId, exercise_id: primaryExerciseId, superset_id: supersetId, is_superset_secondary: false },
      { ...buildSessionPayload({ date, sets: secondarySets }, multiplier), id: secondaryId, exercise_id: secondaryExerciseId, superset_id: supersetId, is_superset_secondary: true },
    ], { onConflict: "id", ignoreDuplicates: true }).abortSignal(signalFor(options.signal));
    if (error) throw error;
    const result = await supabase.from("sessions").select("*").in("id", [primaryId, secondaryId]).abortSignal(signalFor(options.signal));
    if (result.error) throw result.error;
    const primary = result.data?.find((session) => session.id === primaryId), secondary = result.data?.find((session) => session.id === secondaryId);
    if (!primary || !secondary) throw new Error("Superset incomplete: retry synchronization.");
    requireUserId(userId); return { primary, secondary };
  },
  deleteExercise: async (id: string, options: RequestOptions & { imageUrl?: string } = {}) => {
    const userId = await authenticateWrite(options.userId);
    const { error } = await supabase.from("exercises").delete().eq("id", id).eq("user_id", userId).abortSignal(signalFor(options.signal));
    if (error) throw error; requireUserId(userId);
    if (options.imageUrl) await supabaseStore.deleteImage(options.imageUrl, options);
  },
  deleteImage: async (url: string, options: RequestOptions = {}) => {
    const userId = await authenticateWrite(options.userId); const path = imagePath(url);
    if (!path) return;
    const references = await supabase.from("exercises").select("id").eq("user_id", userId).eq("image_url", url).limit(1)
      .abortSignal(signalFor(options.signal));
    if (references.error) throw references.error;
    if (references.data.length) return;
    requireUserId(userId);
    const { error } = await supabase.storage.from("exercise-images").remove([...new Set([path, thumbnailPath(path)])]);
    if (error) throw error; requireUserId(userId);
  },
  deleteSession: async (id: string, options: RequestOptions = {}) => {
    const userId = await authenticateWrite(options.userId);
    const { error } = await supabase.from("sessions").delete().eq("id", id).abortSignal(signalFor(options.signal));
    if (error) throw error; requireUserId(userId);
  },
  updateSession: async (id: string, session: { date: string; sets: SessionSet[] }, options: WriteOptions = {}): Promise<Session> => {
    const userId = await authenticateWrite(options.userId);
    const { data, error } = await supabase.from("sessions").update(buildSessionPayload(session, options.valueMultiplier))
      .eq("id", id).abortSignal(signalFor(options.signal)).select().single();
    if (error) throw error; requireUserId(userId); return data;
  },
};
