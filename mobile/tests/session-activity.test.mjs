import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionActivitySynchronizer } from '../src/data/session-activity.ts';

const run = { id: 'run', date: '2026-11-09', startedAt: 1794222000000, endedAt: null, utcOffset: 3600, rest: null };

test('Expo Go and older builds report the specific limitation without loading unsupported native code', async () => {
  for (const status of ['expo-go', 'missing-build', 'unsupported']) {
    let loads = 0;
    const sync = createSessionActivitySynchronizer(() => status, async () => { loads++; throw new Error('native module missing'); });
    assert.equal(await sync(run, 0), status);
    assert.equal(loads, 0);
  }
});

test('a native session starts with its deep link, updates the rest timer, and ends on close', async () => {
  const calls = []; const instances = [];
  const factory = { getInstances: () => instances, start: (props, url) => {
    calls.push({ type: 'start', props, url });
    instances.push({ update: async (props) => calls.push({ type: 'update', props }), end: async (policy) => { calls.push({ type: 'end', policy }); instances.pop(); } });
  } };
  const sync = createSessionActivitySynchronizer(() => 'available', async () => factory);
  assert.equal(await sync(run, 1), 'active');
  const resting = { ...run, rest: { startedAt: run.startedAt + 10000, endsAt: run.startedAt + 100000, notificationId: 'rest' } };
  assert.equal(await sync(resting, 2), 'active');
  assert.equal(calls[0].url, 'gymtrack://session');
  assert.equal(calls[0].props.restEndsAt, null);
  assert.equal(calls[1].props.restEndsAt, resting.rest.endsAt);
  assert.equal(calls[1].props.exercises, 2);
  assert.equal(await sync({ ...resting, endedAt: run.startedAt + 200000 }, 2), 'idle');
  assert.deepEqual(calls[2], { type: 'end', policy: 'immediate' });
  assert.equal(instances.length, 0);
});

test('native failure is visible and a retry after enabling Live Activities can recover', async () => {
  let enabled = false;
  const sync = createSessionActivitySynchronizer(() => 'available', async () => ({ getInstances: () => [], start: () => {
    if (!enabled) throw new Error('Live Activities disabled');
  } }));
  assert.equal(await sync(run, 0), 'unavailable');
  enabled = true;
  assert.equal(await sync(run, 0), 'active');
});

test('logout cleanup finishes before the next account starts its activity', async () => {
  const calls = []; let instances = [{ update: async () => {}, end: async () => {
    await Promise.resolve(); calls.push('ended previous'); instances = [];
  } }];
  const sync = createSessionActivitySynchronizer(() => 'available', async () => ({ getInstances: () => instances,
    start: () => { assert.equal(instances.length, 0); calls.push('started next'); } }));
  const cleanup = sync(null, 0);
  const next = sync({ ...run, id: 'next-account' }, 0);
  assert.deepEqual(await Promise.all([cleanup, next]), ['idle', 'active']);
  assert.deepEqual(calls, ['ended previous', 'started next']);
});
