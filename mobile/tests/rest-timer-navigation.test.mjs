import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRestTimerDismissal, restTimerToPresent } from '../src/data/rest-timer-navigation.ts';
import { WorkoutRunStore } from '../src/data/workout-run.ts';

const startedAt = new Date('2026-11-10T21:30:00+01:00').getTime();
const rest = { startedAt, endsAt: startedAt + 90_000, notificationId: 'recovery' };
const sessionRoute = { name: '(tabs)' };
const timerRoute = { name: 'rest-timer', params: { notificationId: rest.notificationId } };

function fixture() {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const store = new WorkoutRunStore(storage, 'alice');
  store.start('run', startedAt);
  store.rest('run', rest);
  return { storage, store };
}

test('a cold relaunch restores the saved recovery sheet with its original deadline', () => {
  const { storage } = fixture();
  const restored = new WorkoutRunStore(storage, 'alice').snapshot()[0];
  const target = restTimerToPresent(restored, sessionRoute, startedAt + 40_000);
  assert.deepEqual(target, rest);
  assert.equal(target.endsAt - (startedAt + 40_000), 50_000);
  assert.equal(restTimerToPresent(restored, timerRoute, startedAt + 40_000), null);
});

test('returning through the Dynamic Island preserves recovery and restores the modal', () => {
  const { store } = fixture();
  for (const type of ['NAVIGATE', 'REPLACE', 'RESET']) {
    if (isRestTimerDismissal({ type })) store.rest('run', null);
    assert.deepEqual(restTimerToPresent(store.snapshot()[0], sessionRoute, startedAt + 20_000), rest);
  }
});

test('swiping the sheet closed or pressing back cancels recovery without reopening it', () => {
  for (const type of ['POP', 'GO_BACK', 'POP_TO_TOP']) {
    const { store } = fixture();
    if (isRestTimerDismissal({ type })) store.rest('run', null);
    assert.equal(store.snapshot()[0].rest, null);
    assert.equal(restTimerToPresent(store.snapshot()[0], sessionRoute, startedAt + 20_000), null);
  }
});

test('expired, closed and absent recoveries never reopen; another timer can be replaced', () => {
  const { store } = fixture();
  const run = store.snapshot()[0];
  assert.equal(restTimerToPresent(run, sessionRoute, rest.endsAt), null);
  assert.equal(restTimerToPresent(run, sessionRoute, rest.endsAt + 1000), null);
  assert.equal(restTimerToPresent(undefined, sessionRoute, startedAt), null);
  assert.equal(restTimerToPresent({ ...run, endedAt: startedAt + 1000 }, sessionRoute, startedAt), null);
  assert.equal(restTimerToPresent(run, { name: 'rest-timer', params: { notificationId: 'old' } }, startedAt), rest);
});
