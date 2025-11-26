import { Exercise, Session, mockExercises } from "@/data/mockData";

const STORAGE_KEY = "gym-tracker-exercises";

export const exerciseStore = {
  getAll: (): Exercise[] => {
    if (typeof window === "undefined") return mockExercises;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : mockExercises;
  },

  save: (exercises: Exercise[]) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(exercises));
  },

  addExercise: (exercise: Omit<Exercise, "id" | "sessions">): Exercise => {
    const exercises = exerciseStore.getAll();
    const newExercise: Exercise = {
      ...exercise,
      id: exercise.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
      sessions: [],
    };
    exercises.push(newExercise);
    exerciseStore.save(exercises);
    return newExercise;
  },

  addSession: (exerciseId: string, session: Omit<Session, "id" | "value">): Session => {
    const exercises = exerciseStore.getAll();
    const exercise = exercises.find((ex) => ex.id === exerciseId);
    if (!exercise) throw new Error("Exercise not found");

    const newSession: Session = {
      ...session,
      id: Date.now().toString(),
      value: session.series * session.reps * session.weight,
    };
    exercise.sessions.push(newSession);
    exerciseStore.save(exercises);
    return newSession;
  },

  getById: (id: string): Exercise | undefined => {
    return exerciseStore.getAll().find((ex) => ex.id === id);
  },
};
