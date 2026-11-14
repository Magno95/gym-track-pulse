import type { Database } from '../../../src/integrations/supabase/types';

export type Exercise = Database['public']['Tables']['exercises']['Row'];
export type WorkoutSession = Database['public']['Tables']['sessions']['Row'];
export type ExerciseOverview = Exercise & { sessions: WorkoutSession[] };

export function decodeOverview(rows: { exercise: unknown; sessions: unknown }[], userId: string): ExerciseOverview[] {
  return rows.map((row) => {
    const exercise = row.exercise as Exercise | null;
    if (!exercise || exercise.user_id !== userId) throw new Error('Account non corrispondente. Accedi di nuovo.');
    if (!Array.isArray(row.sessions) || row.sessions.some((session) => session?.exercise_id !== exercise.id)) {
      throw new Error('Allenamenti non validi. Riprova ad aggiornare.');
    }
    return { ...exercise, sessions: row.sessions as WorkoutSession[] };
  });
}

export const categories = [
  { id: 'arms', label: 'Braccia' }, { id: 'chest', label: 'Petto' },
  { id: 'back', label: 'Schiena' }, { id: 'legs', label: 'Gambe' },
  { id: 'core', label: 'Core' }, { id: 'cardio', label: 'Cardio' },
];
export function categoryLabel(category: string) {
  return categories.find(({ id }) => id === category)?.label ?? category;
}

type Page<T> = { data: T[] | null; error: unknown };
export async function readAllPages<T>(read: (from: number, to: number) => PromiseLike<Page<T>>, pageSize = 100) {
  const result: T[] = [];
  for (;;) {
    const { data, error } = await read(result.length, result.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) return result;
    result.push(...data);
  }
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
export function exerciseSections(exercises: ExerciseOverview[], search: string, category: string | null) {
  const term = normalize(search.trim());
  const filtered = exercises.filter((exercise) => (!category || exercise.category === category)
    && normalize(`${exercise.name} ${categoryLabel(exercise.category)}`).includes(term));
  const ids = [...new Set([...categories.map(({ id }) => id), ...filtered.map((exercise) => exercise.category)])];
  return ids.map((id) => ({ title: categoryLabel(id), data: filtered.filter((exercise) => exercise.category === id)
    .sort((a, b) => a.name.localeCompare(b.name, 'it')) })).filter((section) => section.data.length);
}

export function latestSession(sessions: WorkoutSession[]) {
  return sessions.reduce<WorkoutSession | null>((latest, session) => !latest
    || `${session.date}:${session.id}` > `${latest.date}:${latest.id}` ? session : latest, null);
}

export function formatDate(date: string) {
  // Date-only values describe a local workout day, not a UTC timestamp.
  return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function sessionSummary(session: WorkoutSession, exercise: Pick<Exercise, 'unit'>) {
  const first = Array.isArray(session.sets) ? session.sets[0] : null;
  const bodyweight = first && typeof first === 'object' && 'body_weight' in first && typeof first.body_weight === 'number';
  const unit = bodyweight ? 'kg' : exercise.unit === 'time' ? 's' : exercise.unit === 'distance' ? 'm' : 'kg';
  const timedBodyweight = bodyweight && first && 'duration_seconds' in first && typeof first.duration_seconds === 'number';
  return `${session.series} × ${session.reps}${timedBodyweight ? ' s' : ''} · ${Number(session.weight).toLocaleString('it-IT')} ${unit}${bodyweight ? ' totali' : ''}`;
}
