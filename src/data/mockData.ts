export interface Exercise {
  id: string;
  name: string;
  category: "arms" | "chest" | "back" | "legs";
  sessions: Session[];
}

export interface Session {
  id: string;
  date: string;
  series: number;
  reps: number;
  weight: number;
  value: number; // series * reps * weight
}

export const mockExercises: Exercise[] = [
  // Arms
  {
    id: "bicep-curl",
    name: "Bicep Curl",
    category: "arms",
    sessions: [
      { id: "1", date: "2025-01-15", series: 3, reps: 12, weight: 15, value: 540 },
      { id: "2", date: "2025-01-18", series: 3, reps: 12, weight: 17.5, value: 630 },
      { id: "3", date: "2025-01-22", series: 4, reps: 10, weight: 17.5, value: 700 },
      { id: "4", date: "2025-01-25", series: 4, reps: 12, weight: 17.5, value: 840 },
    ],
  },
  {
    id: "tricep-dips",
    name: "Tricep Dips",
    category: "arms",
    sessions: [
      { id: "1", date: "2025-01-14", series: 3, reps: 10, weight: 0, value: 0 },
      { id: "2", date: "2025-01-17", series: 3, reps: 12, weight: 0, value: 0 },
      { id: "3", date: "2025-01-21", series: 4, reps: 10, weight: 5, value: 200 },
      { id: "4", date: "2025-01-24", series: 4, reps: 12, weight: 5, value: 240 },
    ],
  },
  {
    id: "hammer-curl",
    name: "Hammer Curl",
    category: "arms",
    sessions: [
      { id: "1", date: "2025-01-16", series: 3, reps: 12, weight: 12.5, value: 450 },
      { id: "2", date: "2025-01-19", series: 3, reps: 12, weight: 15, value: 540 },
      { id: "3", date: "2025-01-23", series: 4, reps: 10, weight: 15, value: 600 },
    ],
  },
  // Chest
  {
    id: "bench-press",
    name: "Bench Press",
    category: "chest",
    sessions: [
      { id: "1", date: "2025-01-13", series: 4, reps: 8, weight: 60, value: 1920 },
      { id: "2", date: "2025-01-16", series: 4, reps: 8, weight: 65, value: 2080 },
      { id: "3", date: "2025-01-20", series: 4, reps: 10, weight: 65, value: 2600 },
      { id: "4", date: "2025-01-23", series: 5, reps: 8, weight: 67.5, value: 2700 },
    ],
  },
  {
    id: "push-ups",
    name: "Push Ups",
    category: "chest",
    sessions: [
      { id: "1", date: "2025-01-14", series: 3, reps: 20, weight: 0, value: 0 },
      { id: "2", date: "2025-01-17", series: 3, reps: 25, weight: 0, value: 0 },
      { id: "3", date: "2025-01-21", series: 4, reps: 20, weight: 0, value: 0 },
      { id: "4", date: "2025-01-24", series: 4, reps: 25, weight: 0, value: 0 },
    ],
  },
  {
    id: "incline-press",
    name: "Incline Press",
    category: "chest",
    sessions: [
      { id: "1", date: "2025-01-15", series: 3, reps: 10, weight: 45, value: 1350 },
      { id: "2", date: "2025-01-18", series: 3, reps: 10, weight: 50, value: 1500 },
      { id: "3", date: "2025-01-22", series: 4, reps: 10, weight: 50, value: 2000 },
    ],
  },
  // Back
  {
    id: "deadlift",
    name: "Deadlift",
    category: "back",
    sessions: [
      { id: "1", date: "2025-01-12", series: 4, reps: 6, weight: 100, value: 2400 },
      { id: "2", date: "2025-01-15", series: 4, reps: 6, weight: 105, value: 2520 },
      { id: "3", date: "2025-01-19", series: 4, reps: 8, weight: 105, value: 3360 },
      { id: "4", date: "2025-01-22", series: 5, reps: 6, weight: 110, value: 3300 },
    ],
  },
  {
    id: "pull-ups",
    name: "Pull Ups",
    category: "back",
    sessions: [
      { id: "1", date: "2025-01-13", series: 3, reps: 8, weight: 0, value: 0 },
      { id: "2", date: "2025-01-16", series: 3, reps: 10, weight: 0, value: 0 },
      { id: "3", date: "2025-01-20", series: 4, reps: 8, weight: 5, value: 160 },
      { id: "4", date: "2025-01-23", series: 4, reps: 10, weight: 5, value: 200 },
    ],
  },
  {
    id: "barbell-row",
    name: "Barbell Row",
    category: "back",
    sessions: [
      { id: "1", date: "2025-01-14", series: 3, reps: 10, weight: 50, value: 1500 },
      { id: "2", date: "2025-01-17", series: 3, reps: 10, weight: 55, value: 1650 },
      { id: "3", date: "2025-01-21", series: 4, reps: 10, weight: 55, value: 2200 },
    ],
  },
  // Legs
  {
    id: "squat",
    name: "Squat",
    category: "legs",
    sessions: [
      { id: "1", date: "2025-01-11", series: 4, reps: 8, weight: 80, value: 2560 },
      { id: "2", date: "2025-01-14", series: 4, reps: 8, weight: 85, value: 2720 },
      { id: "3", date: "2025-01-18", series: 4, reps: 10, weight: 85, value: 3400 },
      { id: "4", date: "2025-01-21", series: 5, reps: 8, weight: 90, value: 3600 },
    ],
  },
  {
    id: "leg-press",
    name: "Leg Press",
    category: "legs",
    sessions: [
      { id: "1", date: "2025-01-12", series: 3, reps: 12, weight: 120, value: 4320 },
      { id: "2", date: "2025-01-15", series: 3, reps: 12, weight: 130, value: 4680 },
      { id: "3", date: "2025-01-19", series: 4, reps: 12, weight: 130, value: 6240 },
      { id: "4", date: "2025-01-22", series: 4, reps: 12, weight: 140, value: 6720 },
    ],
  },
  {
    id: "lunges",
    name: "Lunges",
    category: "legs",
    sessions: [
      { id: "1", date: "2025-01-13", series: 3, reps: 10, weight: 20, value: 600 },
      { id: "2", date: "2025-01-16", series: 3, reps: 12, weight: 20, value: 720 },
      { id: "3", date: "2025-01-20", series: 4, reps: 10, weight: 25, value: 1000 },
    ],
  },
];
