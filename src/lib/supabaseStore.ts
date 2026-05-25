import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionSet = { reps: number; weight: number };

export interface ExerciseWithSessions extends Exercise {
  sessions: Session[];
}

const buildSessionPayload = (
  session: { date: string; sets: SessionSet[] },
  valueMultiplier: number = 1
) => {
  const rawValue = session.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
  const value = Math.round(rawValue * valueMultiplier);

  return {
    date: session.date,
    sets: session.sets,
    series: session.sets.length,
    reps: session.sets[0]?.reps || 0,
    weight: session.sets[0]?.weight || 0,
    value,
  };
};

export const supabaseStore = {
  getAll: async (): Promise<ExerciseWithSessions[]> => {
    const { data: exercises, error: exercisesError } = await supabase
      .from("exercises")
      .select("*")
      .order("created_at", { ascending: false });

    if (exercisesError) throw exercisesError;
    if (!exercises) return [];

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .order("date", { ascending: true });

    if (sessionsError) throw sessionsError;

    return exercises.map((exercise) => ({
      ...exercise,
      sessions: sessions?.filter((s) => s.exercise_id === exercise.id) || [],
    }));
  },

  getById: async (id: string): Promise<ExerciseWithSessions | null> => {
    const { data: exercise, error: exerciseError } = await supabase
      .from("exercises")
      .select("*")
      .eq("id", id)
      .single();

    if (exerciseError) throw exerciseError;
    if (!exercise) return null;

    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("*")
      .eq("exercise_id", id)
      .order("date", { ascending: true });

    if (sessionsError) throw sessionsError;

    return {
      ...exercise,
      sessions: sessions || [],
    };
  },

  addExercise: async (
    exercise: Omit<ExerciseInsert, "id" | "user_id" | "created_at">
  ): Promise<Exercise> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    const { data, error } = await supabase
      .from("exercises")
      .insert({ ...exercise, user_id: user.id })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  addSession: async (
    exerciseId: string,
    session: { date: string; sets: SessionSet[] },
    options?: { valueMultiplier?: number }
  ): Promise<Session> => {
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        ...buildSessionPayload(session, options?.valueMultiplier),
        exercise_id: exerciseId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  addSupersetSession: async (
    primaryExerciseId: string,
    secondaryExerciseId: string,
    date: string,
    primarySets: SessionSet[],
    secondarySets: SessionSet[],
    multiplier: number = 1.2
  ): Promise<{ primary: Session; secondary: Session }> => {
    const supersetId = crypto.randomUUID();

    // Insert primary session
    const { data: primaryData, error: primaryError } = await supabase
      .from("sessions")
      .insert({
        ...buildSessionPayload({ date, sets: primarySets }),
        exercise_id: primaryExerciseId,
        superset_id: supersetId,
        is_superset_secondary: false,
      })
      .select()
      .single();

    if (primaryError) throw primaryError;

    // Insert secondary session with custom multiplier
    const { data: secondaryData, error: secondaryError } = await supabase
      .from("sessions")
      .insert({
        ...buildSessionPayload({ date, sets: secondarySets }, multiplier),
        exercise_id: secondaryExerciseId,
        superset_id: supersetId,
        is_superset_secondary: true,
      })
      .select()
      .single();

    if (secondaryError) throw secondaryError;

    return { primary: primaryData, secondary: secondaryData };
  },

  deleteExercise: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from("exercises")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  deleteSession: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", id);

    if (error) throw error;
  },

  updateSession: async (
    sessionId: string,
    session: { date: string; sets: SessionSet[] },
    options?: { valueMultiplier?: number }
  ): Promise<Session> => {
    const { data, error } = await supabase
      .from("sessions")
      .update(buildSessionPayload(session, options?.valueMultiplier))
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
