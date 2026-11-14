import type { Database, Json } from '../../../src/integrations/supabase/types';
import type { ExerciseOverview, WorkoutSession } from './exercises.ts';
export type { ExerciseOverview, WorkoutSession } from './exercises.ts';
export type Measurement = Database['public']['Tables']['body_weight_history']['Row'];
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type WorkoutState = { userId: string; exercises: ExerciseOverview[]; measurements: Measurement[]; profile: Profile | null; updatedAt: number };
export type ImageUpload = { uri: string; width: number; height: number; path: string };
export type Change =
  | { type: 'save_exercise'; exercise: ExerciseOverview; image?: ImageUpload; previousImage?: string | null; mode?: 'create' | 'update' }
  | { type: 'delete_exercise'; exerciseId: string; imageUrl?: string | null }
  | { type: 'save_sessions'; sessions: WorkoutSession[]; mode?: 'create' | 'update' }
  | { type: 'delete_session'; sessionId: string }
  | { type: 'delete_sessions'; sessionIds: string[] }
  | { type: 'save_height'; height: number }
  | { type: 'save_weight'; measurement: Measurement }
  | { type: 'delete_image'; imageUrl: string };
export type Operation = { id: string; owner: string; change: Change; timestamp: number; attempts: number; nextAttempt: number; error?: string; permanent?: boolean };
export type PersonalRecord = { text: string; date: string };
export const emptyState = (userId: string): WorkoutState => ({ userId, exercises: [], measurements: [], profile: null, updatedAt: 0 });

export function projectState(base: WorkoutState, operations: Operation[], owner: string): WorkoutState {
  if (base.userId !== owner) throw new Error('Account non corrispondente.');
  const state: WorkoutState = { ...base, exercises: base.exercises.map((exercise) => ({ ...exercise, sessions: [...exercise.sessions] })), measurements: [...base.measurements] };
  for (const op of operations) {
    if (op.owner !== owner) continue;
    const c = op.change;
    switch (c.type) {
      case 'save_exercise': {
        if (c.exercise.user_id !== owner) throw new Error('Proprietario esercizio non valido.');
        const old = state.exercises.find((exercise) => exercise.id === c.exercise.id);
        state.exercises = [{ ...c.exercise, sessions: old?.sessions ?? c.exercise.sessions }, ...state.exercises.filter((exercise) => exercise.id !== c.exercise.id)];
        break;
      }
      case 'delete_exercise': state.exercises = state.exercises.filter((exercise) => exercise.id !== c.exerciseId); break;
      case 'save_sessions':
        for (const session of c.sessions) {
          const exercise = state.exercises.find((item) => item.id === session.exercise_id);
          if (!exercise) throw new Error('Esercizio non disponibile per questo account.');
          exercise.sessions = [...exercise.sessions.filter((item) => item.id !== session.id), session];
        }
        break;
      case 'delete_session':
        for (const exercise of state.exercises) exercise.sessions = exercise.sessions.filter((session) => session.id !== c.sessionId);
        break;
      case 'delete_sessions': {
        const ids = new Set(c.sessionIds);
        for (const exercise of state.exercises) exercise.sessions = exercise.sessions.filter((session) => !ids.has(session.id));
        break;
      }
      case 'save_height': state.profile = { user_id: owner, height_cm: c.height }; break;
      case 'save_weight':
        if (c.measurement.user_id !== owner) throw new Error('Proprietario misurazione non valido.');
        state.measurements = [...state.measurements.filter((item) => item.effective_date !== c.measurement.effective_date), c.measurement];
        break;
      case 'delete_image': break;
    }
  }
  for (const exercise of state.exercises) exercise.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  state.measurements.sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  return state;
}
export function personalRecords(value: Json | null): PersonalRecord[] {
  return Array.isArray(value) ? value.filter((item): item is PersonalRecord => !!item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.text === 'string' && typeof item.date === 'string') : [];
}
