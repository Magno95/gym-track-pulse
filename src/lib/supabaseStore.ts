import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type Exercise = Database["public"]["Tables"]["exercises"]["Row"];
type Session = Database["public"]["Tables"]["sessions"]["Row"];
type ExerciseInsert = Database["public"]["Tables"]["exercises"]["Insert"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

export interface ExerciseWithSessions extends Exercise {
  sessions: Session[];
}

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
    session: { date: string; sets: Array<{ reps: number; weight: number }> }
  ): Promise<Session> => {
    // Calculate total value from all sets
    const value = session.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
    
    // For backward compatibility, set series to number of sets, and use first set's values
    const series = session.sets.length;
    const reps = session.sets[0]?.reps || 0;
    const weight = session.sets[0]?.weight || 0;
    
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        date: session.date,
        exercise_id: exerciseId,
        sets: session.sets,
        series,
        reps,
        weight,
        value,
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
    primarySets: Array<{ reps: number; weight: number }>,
    secondarySets: Array<{ reps: number; weight: number }>
  ): Promise<{ primary: Session; secondary: Session }> => {
    const supersetId = crypto.randomUUID();
    
    // Calculate values
    const primaryValue = primarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
    const secondaryValue = Math.round(secondarySets.reduce((sum, set) => sum + (set.reps * set.weight), 0) * 1.2);
    
    // Insert primary session
    const { data: primaryData, error: primaryError } = await supabase
      .from("sessions")
      .insert({
        date,
        exercise_id: primaryExerciseId,
        sets: primarySets,
        series: primarySets.length,
        reps: primarySets[0]?.reps || 0,
        weight: primarySets[0]?.weight || 0,
        value: primaryValue,
        superset_id: supersetId,
        is_superset_secondary: false,
      })
      .select()
      .single();

    if (primaryError) throw primaryError;

    // Insert secondary session with 1.2x multiplier
    const { data: secondaryData, error: secondaryError } = await supabase
      .from("sessions")
      .insert({
        date,
        exercise_id: secondaryExerciseId,
        sets: secondarySets,
        series: secondarySets.length,
        reps: secondarySets[0]?.reps || 0,
        weight: secondarySets[0]?.weight || 0,
        value: secondaryValue,
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
    session: { date: string; sets: Array<{ reps: number; weight: number }> }
  ): Promise<Session> => {
    // Calculate total value from all sets
    const value = session.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
    
    // For backward compatibility, set series to number of sets, and use first set's values
    const series = session.sets.length;
    const reps = session.sets[0]?.reps || 0;
    const weight = session.sets[0]?.weight || 0;
    
    const { data, error } = await supabase
      .from("sessions")
      .update({
        date: session.date,
        sets: session.sets,
        series,
        reps,
        weight,
        value,
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
