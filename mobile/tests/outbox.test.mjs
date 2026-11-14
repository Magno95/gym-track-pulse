import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Outbox } from '../src/data/outbox.ts';
import { emptyState } from '../src/data/model.ts';
import { newExercise, buildSession } from '../src/data/actions.ts';
import { synchronize } from '../src/data/synchronize.ts';

function fixture() {
  const db = new DatabaseSync(':memory:');
  let owner = 'alice';
  const sql = { execSync: (sql) => db.exec(sql), runSync: (sql, ...params) => db.prepare(sql).run(...params), getAllSync: (sql, ...params) => db.prepare(sql).all(...params) };
  const store = new Outbox(sql, () => owner);
  const state = { ...emptyState('alice'), updatedAt: 1, exercises: [{ ...newExercise('alice', 'squat'), name: 'Squat' }, { ...newExercise('alice', 'curl'), name: 'Curl' }] };
  store.snapshot(state, store.version());
  return { db, sql, store, state, changeOwner: (value) => { owner = value; } };
}
const draft = [{ reps: '10', weight: '20' }, { reps: '8', weight: '22,5' }];

test('SQLite persists pending work across store instances and keeps owners isolated', () => {
  const f = fixture();
  f.store.enqueue('alice', { type: 'save_height', height: 175 }, 'height');
  const reopened = new Outbox(f.sql, () => 'alice');
  assert.equal(reopened.pending('alice').length, 1);
  assert.equal(reopened.state('alice').profile.height_cm, 175);
  assert.deepEqual(reopened.pending('bob'), []);
  assert.deepEqual(reopened.state('bob').exercises, []);
  f.changeOwner('bob');
  assert.throws(() => f.store.enqueue('alice', { type: 'save_height', height: 180 }, 'stale-form'), /account/);
  assert.equal(f.store.pending('alice').length, 1);
  f.db.close();
});

test('failed SQLite writes never appear saved locally', () => {
  const f = fixture();
  const broken = { ...f.sql, runSync: () => { throw new Error('disk full'); } };
  const store = new Outbox(broken, () => 'alice');
  assert.throws(() => store.enqueue('alice', { type: 'save_height', height: 180 }, 'failed'), /disk full/);
  assert.equal(f.store.pending('alice').length, 0);
  assert.equal(f.store.state('alice').profile, null);
  f.db.close();
});

test('atomic superset projection and acknowledgment preserve both rows and do not flicker away', async () => {
  const f = fixture();
  const primary = buildSession(f.state, f.state.exercises[0], '2026-11-01', draft, 'primary', 1, 'group', false);
  const secondary = buildSession(f.state, f.state.exercises[1], '2026-11-01', draft, 'secondary', 1.2, 'group', true);
  f.store.enqueue('alice', { type: 'save_sessions', sessions: [primary, secondary] }, 'superset');
  assert.equal(f.store.state('alice').exercises[0].sessions[0].value, 380);
  assert.equal(f.store.state('alice').exercises[1].sessions[0].value, 456);
  const calls = [];
  await synchronize(f.store, 'alice', async (operation) => { calls.push(operation.change.sessions.map((session) => session.id)); });
  assert.deepEqual(calls, [['primary', 'secondary']]);
  assert.equal(f.store.pending('alice').length, 0);
  assert.equal(f.store.state('alice').exercises[0].sessions[0].id, 'primary');
  assert.equal(f.store.state('alice').exercises[1].sessions[0].id, 'secondary');
  f.db.close();
});

test('retry reuses stable IDs, serializes parallel flushes and blocks dependent writes after failure', async () => {
  const f = fixture();
  f.store.enqueue('alice', { type: 'save_height', height: 175 }, 'first');
  f.store.enqueue('alice', { type: 'save_height', height: 180 }, 'second');
  let calls = 0;
  const fail = async () => { calls++; await Promise.resolve(); throw new Error('network'); };
  await Promise.all([synchronize(f.store, 'alice', fail), synchronize(f.store, 'alice', fail)]);
  assert.equal(calls, 1);
  assert.equal(f.store.pending('alice')[0].attempts, 1);
  assert.equal(f.store.pending('alice')[1].attempts, 0);
  const seen = [];
  await synchronize(f.store, 'alice', async (operation) => { seen.push(operation.id); }, true);
  assert.deepEqual(seen, ['first', 'second']);
  assert.equal(f.store.state('alice').profile.height_cm, 180);
  f.db.close();
});

test('account switch during a request cannot acknowledge the previous owner’s operation', async () => {
  const f = fixture();
  f.store.enqueue('alice', { type: 'save_height', height: 175 }, 'height');
  await assert.rejects(synchronize(f.store, 'alice', async () => { f.changeOwner('bob'); }), /account/);
  assert.equal(f.store.pending('alice').length, 1);
  assert.equal(f.store.base('alice').profile, null);
  f.db.close();
});

test('a server read started before a local write cannot overwrite the newer snapshot', () => {
  const f = fixture(); const startedAt = f.store.version();
  f.store.enqueue('alice', { type: 'save_height', height: 180 }, 'height');
  assert.equal(f.store.snapshot({ ...f.state, exercises: [] }, startedAt), false);
  assert.equal(f.store.state('alice').exercises.length, 2);
  assert.equal(f.store.state('alice').profile.height_cm, 180);
  f.db.close();
});

test('acknowledgment rolls back its snapshot update when removal of the outbox row fails', () => {
  const f = fixture();
  const operation = f.store.enqueue('alice', { type: 'save_height', height: 175 }, 'height');
  const broken = new Outbox({ ...f.sql, runSync: (sql, ...params) => {
    if (sql.startsWith('DELETE FROM outbox')) throw new Error('write interrupted');
    return f.sql.runSync(sql, ...params);
  } }, () => 'alice');
  assert.throws(() => broken.acknowledge(operation), /interrupted/);
  assert.equal(f.store.base('alice').profile, null);
  assert.equal(f.store.pending('alice').length, 1);
  f.db.close();
});

test('deleting an exercise projects removal of its sessions and schedules image cleanup durably', async () => {
  const f = fixture();
  const imageUrl = 'https://example.test/owned.webp';
  f.store.enqueue('alice', { type: 'delete_exercise', exerciseId: 'squat', imageUrl }, 'delete');
  assert.equal(f.store.state('alice').exercises.length, 1);
  await synchronize(f.store, 'alice', async () => {});
  assert.equal(f.store.base('alice').exercises.length, 1);
  assert.deepEqual(f.store.pending('alice').map((operation) => operation.change), [{ type: 'delete_image', imageUrl }]);
  f.db.close();
});

test('workout deletion persists all superset halves together, preserves other dates and retries without resurrection', async () => {
  const f = fixture();
  const primary = buildSession(f.state, f.state.exercises[0], '2026-11-09', draft, 'primary', 1, 'group', false);
  const secondary = buildSession(f.state, f.state.exercises[1], '2026-11-09', draft, 'secondary', 1.2, 'group', true);
  const previous = buildSession(f.state, f.state.exercises[0], '2026-11-08', draft, 'previous');
  f.store.enqueue('alice', { type: 'save_sessions', sessions: [primary, secondary, previous] }, 'save');
  await synchronize(f.store, 'alice', async () => {});
  f.store.enqueue('alice', { type: 'delete_sessions', sessionIds: ['primary', 'secondary'] }, 'delete-workout');
  const reopened = new Outbox(f.sql, () => 'alice');
  assert.deepEqual(reopened.state('alice').exercises.flatMap((exercise) => exercise.sessions.map((session) => session.id)), ['previous']);
  assert.equal(reopened.state('alice').exercises.length, 2);
  assert.deepEqual(reopened.pending('bob'), []);
  await synchronize(reopened, 'alice', async () => { throw new Error('offline'); });
  assert.deepEqual(reopened.pending('alice')[0].change.sessionIds, ['primary', 'secondary']);
  await synchronize(reopened, 'alice', async () => {}, true);
  assert.deepEqual(reopened.base('alice').exercises.flatMap((exercise) => exercise.sessions.map((session) => session.id)), ['previous']);
  assert.deepEqual(reopened.pending('alice'), []);
  f.db.close();
});

test('failed deletion enqueue leaves every exercise log available', () => {
  const f = fixture();
  const session = buildSession(f.state, f.state.exercises[0], '2026-11-09', draft, 'saved');
  f.store.enqueue('alice', { type: 'save_sessions', sessions: [session] }, 'save');
  const broken = new Outbox({ ...f.sql, runSync: () => { throw new Error('disk full'); } }, () => 'alice');
  assert.throws(() => broken.enqueue('alice', { type: 'delete_sessions', sessionIds: ['saved'] }, 'delete'), /disk full/);
  assert.equal(f.store.state('alice').exercises[0].sessions[0].id, 'saved');
  f.db.close();
});
