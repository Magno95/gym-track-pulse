import { getEditableSets, isCalendarDate, todayLocal } from '../domain.ts';
import { buildSession, numberInput, type DraftSet } from './actions.ts';
import type { ExerciseOverview, WorkoutSession, WorkoutState, Change } from './model.ts';
import { latestSession } from './exercises.ts';

/** Compare workout days, excluding today's autosaved rows and later sessions. */
export function previousExerciseSession(exercise: ExerciseOverview, date: string) {
  return latestSession(exercise.sessions.filter((session) => session.date < date));
}

export function draftSets(session?: WorkoutSession, bodyweight = false): DraftSet[] {
  return session ? getEditableSets(session).map((set) => ({ reps: String(set.reps), weight: String(set.weight) }))
    : [{ reps: '', weight: bodyweight ? '0' : '' }];
}

export function isEmptyDraft(sets: DraftSet[], bodyweight = false): boolean {
  return sets.every((set) => !set.reps.trim() && (!set.weight.trim() || (bodyweight && numberInput(set.weight) === 0)));
}

/** Save completed rows; keep the last saved values while an existing row is being edited. */
export function completedDraftSets<T extends DraftSet & { key: string }>(sets: T[], saved: T[] = []): T[] {
  return sets.flatMap((set) => {
    if (set.reps.trim() && set.weight.trim()) return [set];
    const previous = saved.find((item) => item.key === set.key);
    return previous ? [previous] : [];
  });
}

/** Use the same scoring rules as persistence, including historical body weight and supersets. */
export function draftSetSummary(state: WorkoutState, exercise: ExerciseOverview, date: string, sets: DraftSet[], id: string, multiplier = 1) {
  try {
    return { series: sets.length, score: buildSession(state, exercise, date, sets, id, multiplier).value };
  } catch {
    return { series: sets.length, score: null };
  }
}

export function sessionEditorInitial(state: WorkoutState, params: { exerciseId?: string; sessionId?: string; date?: string }) {
  const all = state.exercises.flatMap((exercise) => exercise.sessions.map((session) => ({ exercise, session })));
  const requested = params.sessionId ? all.find((item) => item.session.id === params.sessionId) : undefined;
  const pair = requested?.session.superset_id ? all.filter((item) => item.session.superset_id === requested.session.superset_id) : [];
  const primary = pair.find((item) => !item.session.is_superset_secondary) ?? requested;
  const secondary = pair.find((item) => item.session.id !== primary?.session.id);
  const primaryExercise = primary?.exercise ?? state.exercises.find((exercise) => exercise.id === params.exerciseId);
  return {
    primary, secondary, primaryExercise,
    date: primary?.session.date ?? (params.date && isCalendarDate(params.date) ? params.date : todayLocal()),
    sets: draftSets(primary?.session, primaryExercise?.is_bodyweight), secondarySets: draftSets(secondary?.session, secondary?.exercise.is_bodyweight),
  };
}

export type SessionDraft = {
  primary: ExerciseOverview | undefined; secondary: ExerciseOverview | undefined; date: string;
  sets: DraftSet[]; secondarySets: DraftSet[]; superset: boolean; multiplier: string;
  ids: { primary: string; secondary: string; group: string }; sessionId?: string;
  savedIds?: string[];
};

/** Validate both halves before persisting a single operation, including automatic edits. */
export function sessionDraftChange(state: WorkoutState, draft: SessionDraft): Change {
  const { primary, secondary, date, sets, secondarySets, superset, multiplier, ids, sessionId, savedIds = [] } = draft;
  if (!primary) throw new Error('Scegli l’esercizio principale.');
  if (savedIds.some((id) => !state.exercises.some((exercise) => exercise.sessions.some((session) => session.id === id)))) {
    throw new Error('L’allenamento è stato eliminato.');
  }
  const original = primary.sessions.find((session) => session.id === ids.primary);
  if (sessionId && (!original || !state.exercises.some((exercise) => exercise.sessions.some((session) => session.id === sessionId)))) {
    throw new Error('L’allenamento è stato eliminato.');
  }
  if (superset && (!secondary || primary.id === secondary.id)) throw new Error('Scegli due esercizi diversi per il superset.');
  if (sessionId && superset && !secondary?.sessions.some((session) => session.id === ids.secondary)) throw new Error('Il secondo allenamento è stato eliminato.');
  const main = buildSession(state, primary, date, sets, ids.primary, original?.value_multiplier ?? 1,
    superset ? ids.group : sessionId ? original?.superset_id ?? null : null, original?.is_superset_secondary ?? false);
  const sessions = [main];
  if (superset && secondary) sessions.push(buildSession(state, secondary, date, secondarySets, ids.secondary, numberInput(multiplier), ids.group, true));
  // A new editor stays open after registration: it can turn its saved exercise
  // into a superset, or leave both registered exercises as independent entries.
  if (!sessionId && original?.superset_id) {
    for (const exercise of state.exercises) {
      for (const session of exercise.sessions) {
        if (session.superset_id !== original.superset_id || sessions.some((item) => item.id === session.id)) continue;
        sessions.push(buildSession(state, exercise, session.date, draftSets(session), session.id));
      }
    }
  }
  const existing = sessions.filter((session) => state.exercises.some((exercise) => exercise.sessions.some((item) => item.id === session.id))).length;
  return { type: 'save_sessions', sessions, mode: sessionId || existing === sessions.length ? 'update' : existing === 0 ? 'create' : undefined };
}
