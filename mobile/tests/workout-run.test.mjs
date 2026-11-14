import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorkoutRunStore, elapsedSeconds, formatTimer, localRunDate, publicationTiming } from '../src/data/workout-run.ts';

function memory() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
const start = new Date('2026-11-09T21:30:00+01:00').getTime();

test('session clock survives a restart and uses wall time after backgrounding', () => {
  const storage = memory();
  const first = new WorkoutRunStore(storage, 'alice');
  first.start('run', start);
  const reopened = new WorkoutRunStore(storage, 'alice');
  assert.equal(reopened.snapshot()[0].id, 'run');
  assert.equal(elapsedSeconds(reopened.snapshot()[0], start + 65_789), 65);
  reopened.close('run', start + 65_789);
  assert.equal(elapsedSeconds(reopened.snapshot()[0], start + 999_000), 65);
  assert.equal(new WorkoutRunStore(storage, 'alice').snapshot()[0].endedAt, start + 65_789);
});

test('closing freezes exact seconds and publishes app timing without imported heart rate', () => {
  const store = new WorkoutRunStore(memory(), 'alice');
  store.start('run', start);
  assert.throws(() => publicationTiming(store.snapshot()[0]), /Chiudi/);
  store.close('run', start + 3_665_500);
  const run = store.snapshot()[0];
  assert.deepEqual(publicationTiming(run), { startTime: new Date(start).toISOString(),
    elapsedTime: 3665, utcOffset: -new Date(start).getTimezoneOffset() * 60, useImportedActivity: false });
  store.close('run', start + 99_000_000);
  assert.equal(store.snapshot()[0].endedAt, run.endedAt);
});

test('owner isolation keeps clocks and recovery reminders out of another account', () => {
  const storage = memory(); const alice = new WorkoutRunStore(storage, 'alice');
  alice.start('alice-run', start);
  alice.rest('alice-run', { startedAt: start, endsAt: start + 90_000, notificationId: 'alice-rest' });
  const bob = new WorkoutRunStore(storage, 'bob');
  assert.deepEqual(bob.snapshot(), []);
  bob.start('bob-run', start);
  assert.equal(new WorkoutRunStore(storage, 'alice').snapshot()[0].rest.notificationId, 'alice-rest');
  alice.close('alice-run', start + 100_000);
  assert.equal(alice.snapshot()[0].rest, null);
});

test('duplicate taps resume one run and daily publication cannot create a second clock', () => {
  const store = new WorkoutRunStore(memory(), 'alice');
  store.start('one', start); store.start('two', start + 1_000);
  assert.equal(store.snapshot().length, 1);
  store.close('one', start + 60_000); store.start('three', start + 120_000);
  assert.equal(store.snapshot().length, 1);
  store.start('next-day', start + 86400_000);
  assert.equal(store.snapshot().length, 2);
});

test('midnight keeps exercise date and UTC offset anchored to the start', () => {
  const beforeMidnight = new Date(2026, 10, 9, 23, 59, 40).getTime();
  const store = new WorkoutRunStore(memory(), 'alice');
  store.start('night', beforeMidnight); store.close('night', beforeMidnight + 90_000);
  assert.equal(store.snapshot()[0].date, '2026-11-09');
  assert.equal(publicationTiming(store.snapshot()[0]).elapsedTime, 90);
  assert.equal(localRunDate(beforeMidnight + 90_000), '2026-11-10');
});

test('failed disk writes never start, close or replace a recovery timer in memory', () => {
  const storage = memory(); const store = new WorkoutRunStore(storage, 'alice');
  const write = storage.setItem;
  storage.setItem = () => { throw new Error('disk full'); };
  assert.throws(() => store.start('run', start), /disk full/);
  assert.deepEqual(store.snapshot(), []);
  storage.setItem = write; store.start('run', start);
  storage.setItem = () => { throw new Error('disk full'); };
  assert.throws(() => store.close('run', start + 10_000), /disk full/);
  assert.equal(store.snapshot()[0].endedAt, null);
  assert.throws(() => store.rest('run', { startedAt: start, endsAt: start + 30_000, notificationId: 'rest' }), /disk full/);
  assert.equal(store.snapshot()[0].rest, null);
});

test('corrupt saved timing is reported instead of silently replacing a running workout', () => {
  for (const raw of ['{', '{}', '[{}]']) {
    assert.throws(() => new WorkoutRunStore({ getItem: () => raw, setItem() {} }, 'alice'), /timer salvato/);
  }
});

test('Strava duration bounds and timer formatting cover seconds, hours and clock rollback', () => {
  const store = new WorkoutRunStore(memory(), 'alice'); store.start('run', start);
  store.close('run', start);
  assert.throws(() => publicationTiming(store.snapshot()[0]), /durata/);
  const run = { ...store.snapshot()[0], endedAt: start + 86401_000 };
  assert.throws(() => publicationTiming(run), /durata/);
  assert.equal(elapsedSeconds({ ...run, endedAt: null }, start - 1000), 0);
  assert.equal(formatTimer(-1), '00:00');
  assert.equal(formatTimer(90), '01:30');
  assert.equal(formatTimer(3665), '1:01:05');
});

test('deleting a closed trial persists and allows a new session on the same day', () => {
  const storage = memory(); const store = new WorkoutRunStore(storage, 'alice');
  store.start('trial', start); store.close('trial', start + 56_000);
  store.remove('trial');
  const reopened = new WorkoutRunStore(storage, 'alice');
  assert.deepEqual(reopened.snapshot(), []);
  reopened.start('real-workout', start + 120_000);
  assert.equal(reopened.snapshot()[0].id, 'real-workout');
});

test('deletion protects running sessions and other dates; failed disk writes retain the summary', () => {
  const storage = memory(); const store = new WorkoutRunStore(storage, 'alice');
  store.start('first', start);
  assert.throws(() => store.remove('first'), /Chiudi/);
  store.close('first', start + 10_000);
  store.start('next-day', start + 86400_000);
  const write = storage.setItem;
  storage.setItem = () => { throw new Error('disk full'); };
  assert.throws(() => store.remove('first'), /disk full/);
  assert.equal(store.snapshot().length, 2);
  storage.setItem = write; store.remove('first');
  assert.deepEqual(new WorkoutRunStore(storage, 'alice').snapshot().map((run) => run.id), ['next-day']);
});
