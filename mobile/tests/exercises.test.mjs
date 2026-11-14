import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeOverview, exerciseSections, formatDate, latestSession, readAllPages, sessionSummary } from '../src/data/exercises.ts';

const exercise = (id, name, category = 'legs') => ({ id, user_id: 'alice', name, category, sessions: [] });

test('pagination reads past a server cap smaller than the requested page', async () => {
  const source = ['a', 'b', 'c', 'd', 'e'];
  const ranges = [];
  const rows = await readAllPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: source.slice(from, Math.min(to + 1, from + 2)), error: null };
  }, 100);
  assert.deepEqual(rows, source);
  assert.deepEqual(ranges.map(([from]) => from), [0, 2, 4, 5]);
});

test('pagination rejects a failed later page instead of showing a partial success', async () => {
  const error = new Error('connection lost');
  await assert.rejects(readAllPages(async (from) => from === 0
    ? { data: ['first'], error: null } : { data: null, error }), error);
});

test('overview rejects another account and sessions belonging to another exercise', () => {
  const row = { exercise: exercise('squat', 'Squat'), sessions: [{ id: 'set', exercise_id: 'squat' }] };
  assert.equal(decodeOverview([row], 'alice')[0].sessions.length, 1);
  assert.throws(() => decodeOverview([row], 'bob'), /Account/);
  assert.throws(() => decodeOverview([{ ...row, sessions: [{ exercise_id: 'other' }] }], 'alice'), /Allenamenti/);
  assert.throws(() => decodeOverview([{ ...row, sessions: null }], 'alice'), /Allenamenti/);
});

test('search handles accents, categories and exercises in unfamiliar categories', () => {
  const exercises = [exercise('2', 'Squat'), exercise('1', 'Affòndi'), exercise('3', 'Curl', 'arms'), exercise('4', 'Mobilità', 'mobility')];
  assert.equal(exerciseSections(exercises, 'affondi', null)[0].data[0].id, '1');
  assert.equal(exerciseSections(exercises, 'braccia', null)[0].data[0].id, '3');
  assert.deepEqual(exerciseSections(exercises, '', 'legs')[0].data.map(({ id }) => id), ['1', '2']);
  assert.equal(exerciseSections(exercises, '', null).at(-1).data[0].id, '4');
  assert.deepEqual(exerciseSections(exercises, 'missing', null), []);
});

test('latest session uses workout date and deterministic ID without changing the source', () => {
  const sessions = [{ id: 'b', date: '2026-11-08' }, { id: 'z', date: '2026-11-07' }, { id: 'c', date: '2026-11-08' }];
  assert.equal(latestSession(sessions).id, 'c');
  assert.equal(sessions[0].id, 'b');
  assert.equal(latestSession([]), null);
});

test('workout dates remain on the same calendar day in different time zones', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['America/Los_Angeles', 'Pacific/Auckland', 'Europe/Rome']) {
      process.env.TZ = zone;
      assert.equal(formatDate('2026-11-08'), '8 nov 2026');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('timed bodyweight reports seconds and total kilograms rather than kilograms as seconds', () => {
  const session = { series: 3, reps: 45, weight: 80, sets: [{ reps: 45, weight: 80, body_weight: 75, additional_weight: 5, duration_seconds: 45 }] };
  assert.equal(sessionSummary(session, { unit: 'time' }), '3 × 45 s · 80 kg totali');
  assert.equal(sessionSummary({ ...session, sets: null }, { unit: 'time' }), '3 × 45 · 80 s');
  assert.equal(sessionSummary({ ...session, weight: 12.5, sets: null }, { unit: 'weight' }), '3 × 45 · 12,5 kg');
});
