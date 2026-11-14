import { bodyWeightForEdit, findBodyWeight, isBodyweightSession, isTimedBodyweightSession, materializeSets, validateSession } from '../domain.ts';
import type { WorkoutState, WorkoutSession, ExerciseOverview } from './model.ts';
import type { Json } from '../../../src/integrations/supabase/types';

export type DraftSet = { reps: string; weight: string };
export function numberInput(value: string) { return value.trim() ? Number(value.trim().replace(',', '.')) : NaN; }
export function parseSets(sets: DraftSet[]) {
  const parsed = sets.map((set) => ({ reps: numberInput(set.reps), weight: numberInput(set.weight) }));
  if (!parsed.length || parsed.length > 100 || parsed.some((set) => !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 10000
    || !Number.isFinite(set.weight) || set.weight < 0 || set.weight > 100000)) {
    throw new Error('Inserisci da 1 a 100 serie, ripetizioni intere da 1 a 10.000 e un carico da 0 a 100.000.');
  }
  return parsed;
}
export function buildSession(state: WorkoutState, exercise: ExerciseOverview, date: string, draft: DraftSet[], id: string,
  multiplier = 1, supersetId: string | null = null, secondary = false): WorkoutSession {
  if (exercise.user_id !== state.userId) throw new Error('Account non corrispondente.');
  const previous = exercise.sessions.find((session) => session.id === id);
  const bodyweight = previous ? isBodyweightSession(previous) : exercise.is_bodyweight;
  const bodyWeight = previous ? bodyWeightForEdit(previous, date, state.measurements) : findBodyWeight(state.measurements, date);
  if (bodyweight && bodyWeight === null) throw new Error('Aggiungi nel profilo un peso valido alla data dell’allenamento.');
  const unit = previous && bodyweight ? (isTimedBodyweightSession(previous) ? 'time' : 'weight') : exercise.unit;
  const sets = materializeSets(parseSets(draft), bodyweight, bodyWeight, unit);
  validateSession({ date, sets }, multiplier);
  return { id, exercise_id: exercise.id, date, created_at: previous?.created_at ?? new Date().toISOString(),
    sets: sets as unknown as Json, series: sets.length, reps: sets[0].reps, weight: sets[0].weight,
    value: Math.round(sets.reduce((sum, set) => sum + set.reps * set.weight, 0) * multiplier), value_multiplier: multiplier,
    superset_id: supersetId, is_superset_secondary: secondary };
}
export function newExercise(owner: string, id: string): ExerciseOverview {
  return { id, user_id: owner, name: '', category: 'arms', description: null, image_url: null, is_bodyweight: false,
    unit: 'weight', superset_multiplier: 1.2, personal_records: [], created_at: new Date().toISOString(), sessions: [] };
}
