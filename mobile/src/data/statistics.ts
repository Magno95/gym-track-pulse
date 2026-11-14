import { getSessionSets, isTimedBodyweightSession, todayLocal } from '../domain.ts';
import type { ExerciseOverview } from './exercises.ts';
export function workoutDays(exercises: ExerciseOverview[]) {
  const days = new Map<string, { date: string; score: number; sets: number; reps: number; seconds: number; count: number }>();
  for (const exercise of exercises) for (const session of exercise.sessions) {
    const day = days.get(session.date) ?? { date: session.date, score: 0, sets: 0, reps: 0, seconds: 0, count: 0 };
    day.score += session.value; day.sets += session.series; day.count++;
    const timed = isTimedBodyweightSession(session);
    day.reps += timed ? 0 : getSessionSets(session).reduce((sum, set) => sum + set.reps, 0);
    day.seconds += timed ? getSessionSets(session).reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0) : 0;
    days.set(day.date, day);
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
export function weeklyFrequency(exercises: ExerciseOverview[], date = todayLocal()) {
  const end = new Date(`${date}T12:00:00`);
  end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
  const days = workoutDays(exercises);
  return Array.from({ length: 8 }, (_, index) => {
    const start = new Date(end); start.setDate(start.getDate() - (7 - index) * 7);
    const next = new Date(start); next.setDate(next.getDate() + 7);
    return { date: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      value: days.filter((day) => { const value = new Date(`${day.date}T12:00:00`); return value >= start && value < next; }).length };
  });
}
