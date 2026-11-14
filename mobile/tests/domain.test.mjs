import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSession, newExercise, parseSets } from '../src/data/actions.ts';
import { emptyState, projectState } from '../src/data/model.ts';
import { workoutDays, weeklyFrequency } from '../src/data/statistics.ts';
import { nativeStravaHandoff, nativeStravaReturn } from '../../src/lib/nativeOAuth.ts';
import { offlineSession } from '../src/data/offline-session.ts';

test('an expired cached session permits offline local access but cannot become an online login', () => {
  const cached = JSON.stringify({ user: { id: 'alice' }, access_token: 'expired', refresh_token: 'cached', expires_at: 1 });
  assert.equal(offlineSession(cached, false).user.id, 'alice');
  assert.equal(offlineSession(cached, true), null);
  assert.equal(offlineSession(null, false), null);
  assert.equal(offlineSession('{broken', false), null);
  assert.equal(offlineSession(JSON.stringify({ user: { id: 'alice' } }), false), null);
});

test('bodyweight snapshots survive profile changes; changing the workout day selects its historical weight', () => {
  let exercise = { ...newExercise('alice', 'plank'), name: 'Plank', is_bodyweight: true, unit: 'time' };
  let state = { ...emptyState('alice'), exercises: [exercise], measurements: [{ effective_date: '2026-10-01', weight_kg: 75 }, { effective_date: '2026-11-01', weight_kg: 80 }] };
  const saved = buildSession(state, exercise, '2026-10-15', [{ reps: '45', weight: '5' }], 'session');
  assert.equal(saved.value, 45 * 80);
  assert.equal(saved.sets[0].duration_seconds, 45);
  exercise = { ...exercise, sessions: [saved] };
  state = { ...state, exercises: [exercise], measurements: [{ effective_date: '2026-10-01', weight_kg: 90 }, { effective_date: '2026-11-01', weight_kg: 80 }] };
  const sameDate = buildSession(state, exercise, saved.date, [{ reps: '60', weight: '5' }], saved.id);
  assert.equal(sameDate.sets[0].body_weight, 75);
  const otherDate = buildSession(state, exercise, '2026-11-02', [{ reps: '60', weight: '5' }], saved.id);
  assert.equal(otherDate.sets[0].body_weight, 80);
});

test('a changed exercise setting never converts an old regular session to bodyweight', () => {
  const exercise = { ...newExercise('alice', 'curl'), is_bodyweight: true, sessions: [{ id: 'old', date: '2026-11-01', sets: [{ reps: 10, weight: 20 }], value_multiplier: 1 }] };
  const state = { ...emptyState('alice'), exercises: [exercise] };
  const edited = buildSession(state, exercise, '2026-11-01', [{ reps: '12', weight: '20' }], 'old');
  assert.equal(edited.value, 240);
  assert.equal(edited.sets[0].body_weight, undefined);
});

test('invalid drafts and missing historical weight are rejected before entering the queue', () => {
  for (const draft of [[], [{ reps: '1.5', weight: '2' }], [{ reps: '', weight: '0' }], [{ reps: '10', weight: '-1' }], [{ reps: '10', weight: 'NaN' }]]) assert.throws(() => parseSets(draft));
  const exercise = { ...newExercise('alice', 'plank'), is_bodyweight: true };
  assert.throws(() => buildSession(emptyState('alice'), exercise, '2026-11-01', [{ reps: '10', weight: '0' }], 'new'), /peso/);
});

test('local edits retain original superset identity, and new measurements replace the same calendar day', () => {
  const exercise = { ...newExercise('alice', 'squat'), sessions: [{ id: 'session', exercise_id: 'squat', date: '2026-11-01', value: 200, series: 1, reps: 10, weight: 20, value_multiplier: 1.2, superset_id: 'group', is_superset_secondary: true }] };
  const base = { ...emptyState('alice'), exercises: [exercise], measurements: [{ id: 'old', user_id: 'alice', effective_date: '2026-11-01', weight_kg: 75 }] };
  const session = buildSession(base, exercise, '2026-11-01', [{ reps: '10', weight: '25' }], 'session', 1.2, 'group', true);
  const data = projectState(base, [
    { owner: 'alice', change: { type: 'save_sessions', sessions: [session] } },
    { owner: 'alice', change: { type: 'save_weight', measurement: { id: 'new', user_id: 'alice', effective_date: '2026-11-01', weight_kg: 80 } } },
  ], 'alice');
  assert.equal(data.exercises[0].sessions[0].superset_id, 'group');
  assert.equal(data.exercises[0].sessions[0].is_superset_secondary, true);
  assert.equal(data.exercises[0].sessions[0].value, 300);
  assert.equal(data.measurements.length, 1);
  assert.equal(data.measurements[0].weight_kg, 80);
});

test('statistics count timed bodyweight as seconds and use Monday-based weeks across DST', () => {
  const exercise = { ...newExercise('alice', 'plank'), is_bodyweight: true, unit: 'time' };
  const state = { ...emptyState('alice'), measurements: [{ effective_date: '2026-01-01', weight_kg: 75 }] };
  exercise.sessions = [buildSession(state, exercise, '2026-10-25', [{ reps: '60', weight: '0' }], 'a'), buildSession(state, exercise, '2026-10-26', [{ reps: '45', weight: '0' }], 'b')];
  assert.equal(workoutDays([exercise])[0].reps, 0);
  assert.equal(workoutDays([exercise])[0].seconds, 45);
  const weeks = weeklyFrequency([exercise], '2026-10-28');
  assert.equal(weeks.at(-2).value, 1);
  assert.equal(weeks.at(-1).value, 1);
});

test('OAuth handoff rejects web redirects, credentials, unrelated paths and token forwarding', () => {
  for (const url of ['https://evil.test/strava-callback', 'javascript:alert(1)', 'exp://user:pass@host/--/strava-callback', 'gymtrack://app/other', 'exp://host/--/other', 'gymtrack://strava-callback?access_token=secret']) assert.equal(nativeStravaReturn(url), null);
  const params = new URLSearchParams({ native_return: 'exp://192.168.1.2:8081/--/strava-callback', state: 'a'.repeat(64), code: 'single-use-code', scope: 'activity:write', access_token: 'never-forward', refresh_token: 'never-forward' });
  const result = new URL(nativeStravaHandoff(params));
  assert.equal(result.protocol, 'exp:');
  assert.equal(result.searchParams.get('code'), 'single-use-code');
  assert.equal(result.searchParams.has('access_token'), false);
  assert.equal(result.searchParams.has('refresh_token'), false);
  params.set('state', 'wrong'); assert.equal(nativeStravaHandoff(params), null);
});
