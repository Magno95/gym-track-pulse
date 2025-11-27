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
    session: Omit<SessionInsert, "id" | "exercise_id" | "value" | "created_at">
  ): Promise<Session> => {
    const value = session.series * session.reps * session.weight;
    
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        ...session,
        exercise_id: exerciseId,
        value,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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
};
