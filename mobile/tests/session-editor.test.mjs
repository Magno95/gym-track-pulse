import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSession, newExercise } from '../src/data/actions.ts';
import { emptyState, projectState } from '../src/data/model.ts';
import { completedDraftSets, draftSets, draftSetSummary, isEmptyDraft, previousExerciseSession, sessionDraftChange, sessionEditorInitial } from '../src/data/session-editor.ts';

function fixture() {
  const main = { ...newExercise('alice', 'curl'), name: 'Curl' };
  const second = { ...newExercise('alice', 'squat'), name: 'Squat' };
  const state = { ...emptyState('alice'), exercises: [main, second] };
  main.sessions = [buildSession(state, main, '2026-11-01', [{ reps: '12', weight: '20' }], 'main', 1, 'pair')];
  second.sessions = [buildSession(state, second, '2026-11-01', [{ reps: '8', weight: '30' }], 'second', 1.2, 'pair', true)];
  return state;
}

function edited(state, sessionId = 'main') {
  const initial = sessionEditorInitial(state, { sessionId });
  return { primary: initial.primaryExercise, secondary: initial.secondary?.exercise, date: initial.date,
    sets: initial.sets, secondarySets: initial.secondarySets, superset: !!initial.secondary,
    multiplier: String(initial.secondary?.session.value_multiplier ?? 1.2), sessionId,
    ids: { primary: initial.primary.session.id, secondary: initial.secondary?.session.id ?? 'unused', group: initial.primary.session.superset_id } };
}

test('comparison selects the latest earlier workout day and excludes same-day autosaves and future sessions', () => {
  const state = fixture();
  const exercise = state.exercises[0];
  const make = (date, id) => buildSession(state, exercise, date, [{ reps: '10', weight: '20' }], id);
  exercise.sessions.push(make('2026-11-10', 'b'), make('2026-11-13', 'current'), make('2026-11-20', 'future'), make('2026-11-10', 'c'));
  const before = JSON.stringify(exercise.sessions);
  assert.equal(previousExerciseSession(exercise, '2026-11-13').id, 'c');
  assert.equal(previousExerciseSession(exercise, '2026-11-10').id, 'main');
  assert.equal(previousExerciseSession(exercise, '2026-11-01'), null);
  assert.equal(previousExerciseSession({ ...exercise, sessions: [] }, '2026-11-13'), null);
  assert.equal(JSON.stringify(exercise.sessions), before);
});

test('a new session starts with one blank set even when the exercise has a previous superset', () => {
  const state = fixture();
  const initial = sessionEditorInitial(state, { exerciseId: 'curl', date: '2026-11-08' });
  assert.equal(initial.primaryExercise.id, 'curl');
  assert.equal(initial.primary, undefined);
  assert.equal(initial.secondary, undefined);
  assert.equal(initial.date, '2026-11-08');
  assert.deepEqual(initial.sets, [{ reps: '', weight: '' }]);
  assert.deepEqual(initial.secondarySets, [{ reps: '', weight: '' }]);
  initial.sets[0].reps = '15';
  assert.deepEqual(draftSets(), [{ reps: '', weight: '' }]);
  assert.equal(state.exercises[0].sessions[0].reps, 12);
});

test('bodyweight sessions can register by entering only reps or seconds with the default zero added load', () => {
  for (const unit of ['weight', 'time']) {
    const exercise = { ...newExercise('alice', 'bodyweight'), is_bodyweight: true, unit };
    const state = { ...emptyState('alice'), exercises: [exercise], measurements: [{ effective_date: '2026-10-01', weight_kg: 75 }] };
    const initial = sessionEditorInitial(state, { exerciseId: exercise.id, date: '2026-11-08' });
    assert.deepEqual(initial.sets, [{ reps: '', weight: '0' }]);
    assert.deepEqual(completedDraftSets(initial.sets.map((set) => ({ ...set, key: 'first' }))), []);
    initial.sets[0].reps = unit === 'time' ? '30' : '12';
    const sets = completedDraftSets(initial.sets.map((set) => ({ ...set, key: 'first' })));
    const change = sessionDraftChange(state, { ...newDraft(state), primary: exercise, date: initial.date, sets });
    assert.equal(change.sessions[0].sets[0].additional_weight, 0);
    assert.equal(change.sessions[0].sets[0].body_weight, 75);
    assert.equal(change.sessions[0].value, Number(initial.sets[0].reps) * 75);
  }
});

test('choosing a bodyweight superset exercise starts at zero and preserves added load when reopening', () => {
  const state = fixture();
  const exercise = { ...state.exercises[1], is_bodyweight: true, sessions: [] };
  state.exercises[1] = exercise;
  state.measurements = [{ effective_date: '2026-10-01', weight_kg: 75 }];
  const secondarySets = draftSets(undefined, exercise.is_bodyweight);
  assert.deepEqual(secondarySets, [{ reps: '', weight: '0' }]);
  secondarySets[0].reps = '10';
  const change = sessionDraftChange(state, { ...newDraft(state), secondary: exercise, superset: true, secondarySets });
  assert.equal(change.sessions[1].sets[0].additional_weight, 0);
  assert.equal(change.sessions[1].value, 900);
  secondarySets[0].weight = '5';
  const saved = sessionDraftChange(state, { ...newDraft(state), secondary: exercise, superset: true, secondarySets });
  const updated = projectState(state, [{ owner: 'alice', change: saved }], 'alice');
  const reopened = sessionEditorInitial(updated, { sessionId: saved.sessions[1].id });
  assert.deepEqual(reopened.secondarySets, [{ reps: '10', weight: '5' }]);
});

test('default zero added load leaves an untouched bodyweight draft empty for dismissal', () => {
  const sets = draftSets(undefined, true);
  assert.equal(isEmptyDraft(sets, true), true);
  assert.equal(isEmptyDraft(sets), false);
  sets[0].reps = '12';
  assert.equal(isEmptyDraft(sets, true), false);
  sets[0].reps = '';
  sets[0].weight = '5';
  assert.equal(isEmptyDraft(sets, true), false);
  assert.equal(isEmptyDraft(draftSets()), true);
});

test('automatic registration saves completed sets, including zero load, and skips unfinished new rows', () => {
  const sets = [
    { key: 'empty', reps: '', weight: '' },
    { key: 'partial', reps: '10', weight: ' ' },
    { key: 'complete', reps: '12', weight: '0' },
  ];
  assert.deepEqual(completedDraftSets(sets), [sets[2]]);
  assert.deepEqual(completedDraftSets(sets.slice(0, 2)), []);
});

test('editing a saved row retains its last completed values until complete; explicit deletion removes it', () => {
  const saved = [{ key: 'first', reps: '12', weight: '20' }, { key: 'second', reps: '8', weight: '25' }];
  const editing = [{ key: 'first', reps: '12', weight: '' }, { key: 'second', reps: '8', weight: '30' }];
  assert.deepEqual(completedDraftSets(editing, saved), [saved[0], editing[1]]);
  assert.deepEqual(completedDraftSets(editing.slice(1), saved), [editing[1]]);
});

function newDraft(state) {
  return { primary: state.exercises[0], secondary: state.exercises[1], date: '2026-11-08',
    sets: [{ reps: '10', weight: '20' }], secondarySets: [{ reps: '8', weight: '30' }],
    superset: false, multiplier: '1.2', ids: { primary: 'new-main', secondary: 'new-second', group: 'new-pair' } };
}

function applyDraft(state, draft) {
  const change = sessionDraftChange(state, { ...draft, primary: state.exercises[0], secondary: state.exercises[1] });
  return { change, state: projectState(state, [{ owner: 'alice', change }], 'alice') };
}

test('automatic registration creates once and updates the same ID on subsequent changes', () => {
  let state = fixture();
  const draft = newDraft(state);
  let result = applyDraft(state, draft);
  assert.equal(result.change.mode, 'create');
  state = result.state;
  const createdAt = state.exercises[0].sessions.find((session) => session.id === draft.ids.primary).created_at;
  for (const reps of ['11', '12', '15']) {
    draft.sets[0].reps = reps;
    result = applyDraft(state, { ...draft, savedIds: [draft.ids.primary] });
    assert.equal(result.change.mode, 'update');
    state = result.state;
  }
  const registered = state.exercises[0].sessions.filter((session) => session.id === draft.ids.primary);
  assert.equal(registered.length, 1);
  assert.equal(registered[0].reps, 15);
  assert.equal(registered[0].created_at, createdAt);
});

test('a new editor can form and dissolve a superset after automatic registration', () => {
  let state = fixture(); const draft = newDraft(state);
  state = applyDraft(state, draft).state;
  draft.superset = true;
  let result = applyDraft(state, { ...draft, savedIds: [draft.ids.primary] });
  assert.equal(result.change.mode, undefined); // Upsert the existing primary and the new secondary together.
  state = result.state;
  assert.deepEqual(result.change.sessions.map((session) => session.superset_id), ['new-pair', 'new-pair']);
  result = applyDraft(state, draft);
  assert.equal(result.change.mode, 'update');
  state = result.state;
  draft.superset = false;
  result = applyDraft(state, draft);
  assert.equal(result.change.sessions.length, 2);
  assert.deepEqual(result.change.sessions.map((session) => session.superset_id), [null, null]);
  assert.equal(result.change.sessions[1].is_superset_secondary, false);
  assert.equal(result.change.sessions[1].value_multiplier, 1);
  assert.equal(result.change.sessions[1].value, 240);
});

test('automatic registration cannot recreate a session deleted while the new editor stays open', () => {
  let state = fixture(); const draft = newDraft(state);
  state = applyDraft(state, draft).state;
  state = projectState(state, [{ owner: 'alice', change: { type: 'delete_session', sessionId: draft.ids.primary } }], 'alice');
  assert.throws(() => applyDraft(state, { ...draft, savedIds: [draft.ids.primary] }), /eliminato/);
});

test('changing the second exercise after registration keeps the old entry separate and saves the new pair', () => {
  let state = fixture();
  state.exercises.push({ ...newExercise('alice', 'press'), name: 'Press' });
  const draft = { ...newDraft(state), superset: true };
  state = applyDraft(state, draft).state;
  const change = sessionDraftChange(state, { ...draft, primary: state.exercises[0], secondary: state.exercises[2],
    ids: { ...draft.ids, secondary: 'replacement' }, savedIds: [draft.ids.primary, draft.ids.secondary] });
  assert.equal(change.mode, undefined);
  state = projectState(state, [{ owner: 'alice', change }], 'alice');
  const oldSecond = state.exercises[1].sessions.find((session) => session.id === draft.ids.secondary);
  assert.equal(oldSecond.superset_id, null);
  assert.equal(oldSecond.value_multiplier, 1);
  const replacement = state.exercises[2].sessions[0];
  assert.equal(replacement.id, 'replacement');
  assert.equal(replacement.superset_id, draft.ids.group);
  assert.equal(replacement.is_superset_secondary, true);
  assert.equal(state.exercises[0].sessions.find((session) => session.id === draft.ids.primary).superset_id, draft.ids.group);
});

test('opening either superset half edits the saved pair and preserves historical date and values', () => {
  const state = fixture();
  const initial = sessionEditorInitial(state, { sessionId: 'second', exerciseId: 'squat', date: '2026-11-08' });
  assert.equal(initial.primary.session.id, 'main');
  assert.equal(initial.secondary.session.id, 'second');
  assert.equal(initial.date, '2026-11-01');
  assert.deepEqual(initial.sets, [{ reps: '12', weight: '20' }]);
  assert.deepEqual(initial.secondarySets, [{ reps: '8', weight: '30' }]);
});

test('successive automatic edits update the same two sessions without creating duplicates', () => {
  let state = fixture();
  const createdAt = state.exercises[0].sessions[0].created_at;
  for (const reps of ['13', '14', '16']) {
    const draft = edited(state);
    draft.sets[0].reps = reps;
    const change = sessionDraftChange(state, draft);
    assert.equal(change.mode, 'update');
    assert.equal(change.sessions.length, 2);
    state = projectState(state, [{ owner: 'alice', change }], 'alice');
  }
  assert.deepEqual(state.exercises.map((exercise) => exercise.sessions.length), [1, 1]);
  assert.equal(state.exercises[0].sessions[0].id, 'main');
  assert.equal(state.exercises[0].sessions[0].reps, 16);
  assert.equal(state.exercises[0].sessions[0].created_at, createdAt);
  assert.equal(state.exercises[1].sessions[0].superset_id, 'pair');
  assert.equal(state.exercises[1].sessions[0].value_multiplier, 1.2);
});

test('an incomplete automatic edit cannot overwrite the saved pair, and completing it can save', () => {
  const state = fixture(); const before = JSON.stringify(state);
  const draft = edited(state); draft.secondarySets[0].weight = '';
  assert.throws(() => sessionDraftChange(state, draft), /carico/);
  assert.equal(JSON.stringify(state), before);
  draft.secondarySets[0].weight = '35';
  const next = projectState(state, [{ owner: 'alice', change: sessionDraftChange(state, draft) }], 'alice');
  assert.equal(next.exercises[1].sessions[0].weight, 35);
});

test('automatic edits never recreate a deleted primary or secondary session', () => {
  for (const deletedId of ['main', 'second']) {
    let state = fixture(); const draft = edited(state);
    state = projectState(state, [{ owner: 'alice', change: { type: 'delete_session', sessionId: deletedId } }], 'alice');
    const current = { ...draft, primary: state.exercises[0], secondary: state.exercises[1] };
    assert.throws(() => sessionDraftChange(state, current), /eliminato/);
  }
});

test('the live recap matches saved scores with mixed loads, decimals and superset multipliers', () => {
  const state = fixture();
  const draft = edited(state);
  draft.sets = [{ reps: '10', weight: '20' }, { reps: '8', weight: '22,5' }];
  const change = sessionDraftChange(state, draft);
  assert.deepEqual(draftSetSummary(state, draft.primary, draft.date, draft.sets, draft.ids.primary), { series: 2, score: 380 });
  assert.equal(draftSetSummary(state, draft.secondary, draft.date, draft.secondarySets, draft.ids.secondary, 1.2).score, change.sessions[1].value);
  draft.sets = draft.sets.slice(1);
  assert.deepEqual(draftSetSummary(state, draft.primary, draft.date, draft.sets, draft.ids.primary), { series: 1, score: 180 });
  assert.equal(sessionDraftChange(state, draft).sessions[0].series, 1);
});

test('the recap shows no score for an incomplete set and recovers when completed', () => {
  const state = fixture();
  const exercise = state.exercises[0];
  const sets = [{ reps: '10', weight: '' }];
  assert.deepEqual(draftSetSummary(state, exercise, '2026-11-01', sets, 'main'), { series: 1, score: null });
  sets[0].weight = '0';
  assert.deepEqual(draftSetSummary(state, exercise, '2026-11-01', sets, 'main'), { series: 1, score: 0 });
});

test('the recap retains the saved body weight when profile measurements change', () => {
  const exercise = { ...newExercise('alice', 'plank'), is_bodyweight: true, unit: 'time' };
  const state = { ...emptyState('alice'), exercises: [exercise], measurements: [{ effective_date: '2026-10-01', weight_kg: 75 }] };
  const saved = buildSession(state, exercise, '2026-11-01', [{ reps: '45', weight: '5' }], 'plank-session');
  exercise.sessions = [saved];
  state.measurements[0].weight_kg = 90;
  assert.deepEqual(draftSetSummary(state, exercise, saved.date, [{ reps: '60', weight: '5' }], saved.id), { series: 1, score: 4800 });
});
