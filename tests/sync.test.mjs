import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { cacheHarness, plain } from "./harness.mjs";

const newSession = () => ({ type: "add_session", payload: { exerciseId: "exercise", tempId: webcrypto.randomUUID(), date: "2026-10-02", sets: [{ reps: 10, weight: 20 }] } });

test("keeps failed changes after repeated flushes and exposes the error", async () => {
  const { cache } = await cacheHarness({ addSession: async () => { throw new Error("offline"); } });
  await cache.addToSyncQueue(newSession());
  for (let n = 0; n < 5; n++) await cache.processQueue({ force: true });
  assert.equal(cache.getSyncQueue().length, 1);
  assert.equal(cache.getSyncQueue()[0].lastError, "offline");
});

test("concurrent flushes submit a queued operation only once", async () => {
  let submissions = 0;
  const { cache } = await cacheHarness({ addSession: async (_exercise, _data, options) => {
    submissions++; await new Promise((resolve) => setTimeout(resolve, 10)); return { id: options.id };
  } });
  await cache.addToSyncQueue(newSession());
  await Promise.all([cache.processQueue(), cache.processQueue(), cache.processQueue()]);
  assert.equal(submissions, 1);
  assert.equal(cache.getSyncQueue().length, 0);
});

test("retrying a lost response uses the same persistent record ID", async () => {
  const records = new Set(); let first = true;
  const { cache } = await cacheHarness({ addSession: async (_exercise, _data, options) => {
    records.add(options.id);
    if (first) { first = false; throw new Error("response lost after commit"); }
    return { id: options.id };
  } });
  await cache.addToSyncQueue(newSession());
  await cache.processQueue(); await cache.processQueue({ force: true });
  assert.equal(records.size, 1);
  assert.equal(cache.getSyncQueue().length, 0);
});

test("isolates cache and pending changes between accounts and recovers them on return", async () => {
  let writes = 0;
  const { cache, owner, setUser } = await cacheHarness({ addSession: async () => { writes++; throw new Error("offline"); } });
  cache.setCachedExercises([{ id: "exercise", user_id: owner, sessions: [] }]);
  await cache.addToSyncQueue(newSession());
  const oldQueue = cache.getSyncQueue();
  const otherOwner = webcrypto.randomUUID();
  await setUser(otherOwner);
  assert.equal(cache.getCachedExercises(), null);
  assert.equal(cache.getSyncQueue().length, 0);
  assert.equal(cache.applyPendingOperations([{ id: "exercise", user_id: otherOwner, sessions: [] }], oldQueue)[0].sessions.length, 0);
  await cache.processQueue(); assert.equal(writes, 0);
  await setUser(null); await assert.rejects(() => cache.addToSyncQueue(newSession()));
  await setUser(owner);
  assert.equal(cache.getSyncQueue().length, 1);
  assert.equal(cache.getCachedExercises()[0].id, "exercise");
});

test("a submit handler from the previous account cannot enqueue an exercise for the new account", async () => {
  const { cache, owner, setUser, load } = await cacheHarness();
  await assert.rejects(() => load("lib/syncQueue").addToSyncQueue(newSession()), /account changed/);
  await setUser(webcrypto.randomUUID());
  await assert.rejects(() => cache.addToSyncQueue({ type: "add_exercise", payload: { name: "Old form", category: "legs" } }, owner), /account changed/);
  assert.equal(cache.getSyncQueue().length, 0);
  await setUser(owner);
  assert.equal(cache.getSyncQueue().length, 0);
});

test("does not erase an edit enqueued while an earlier version is being synchronized", async () => {
  let cache; let release;
  const started = new Promise((resolve) => { release = resolve; });
  const harness = await cacheHarness({ updateSession: async () => { release(); await new Promise((resolve) => setTimeout(resolve, 30)); return { id: "session" }; } });
  cache = harness.cache;
  await cache.addToSyncQueue({ type: "update_session", payload: { sessionId: "session", date: "2026-10-02", sets: [{ reps: 10, weight: 20 }] } });
  const flushing = cache.processQueue(); await started;
  await cache.addToSyncQueue({ type: "update_session", payload: { sessionId: "session", date: "2026-10-02", sets: [{ reps: 12, weight: 25 }] } });
  await flushing;
  assert.equal(cache.getSyncQueue().length, 1);
  assert.deepEqual(plain(cache.getSyncQueue()[0].payload.sets), [{ reps: 12, weight: 25 }]);
});

test("sorts pending sessions by date and preserves stable exercise IDs", async () => {
  const { cache, owner } = await cacheHarness();
  const id = webcrypto.randomUUID();
  await cache.addToSyncQueue({ type: "add_exercise", payload: { tempId: id, name: "Squat", category: "legs" } });
  await cache.addToSyncQueue({ ...newSession(), payload: { ...newSession().payload, exerciseId: id, date: "2026-09-01" } });
  const rows = cache.applyPendingOperations([{ id, user_id: owner, sessions: [{ id: "existing", date: "2026-10-01" }] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessions[0].date, "2026-09-01");
  assert.equal(rows[0].sessions[1].id, "existing");
});

test("does not assign legacy unowned changes to a newly authenticated account", async () => {
  const { cache, storage, setUser, load } = await cacheHarness();
  const old = JSON.stringify([{ ...newSession(), id: "old-op", timestamp: 1, retries: 0 }]);
  storage.set("gym-tracker-sync-queue", old);
  await setUser(webcrypto.randomUUID());
  assert.equal(cache.getSyncQueue().length, 0);
  assert.equal(storage.get("gym-tracker-sync-queue"), old);
  assert.equal(load("lib/legacyChanges").hasLegacyPendingChanges(), true);
});

test("independent browser contexts coordinate through the durable lease", async () => {
  let requests = 0;
  const store = { addSession: async (_exercise, _data, options) => {
    requests++; await new Promise((resolve) => setTimeout(resolve, 40)); return { id: options.id };
  } };
  const first = await cacheHarness(store), second = await cacheHarness(store);
  await second.setUser(first.owner);
  await first.cache.addToSyncQueue(newSession());
  await Promise.all([first.cache.processQueue(), second.cache.processQueue()]);
  assert.equal(requests, 1);
  await second.cache.initSyncQueue(); assert.equal(second.cache.getSyncQueue().length, 0);
});

test("an account change during an in-flight request retains the previous account's operation", async () => {
  let started; let finish;
  const start = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { finish = resolve; });
  const { cache, owner, setUser } = await cacheHarness({ addSession: async (_exercise, _data, options) => {
    assert.equal(options.userId, owner); started(); await response; return { id: options.id };
  } });
  await cache.addToSyncQueue(newSession());
  const flush = cache.processQueue(); await start; await setUser(webcrypto.randomUUID());
  finish(); await flush;
  assert.equal(cache.getSyncQueue().length, 0);
  await setUser(owner); assert.equal(cache.getSyncQueue().length, 1);
});

test("forced sync cannot clean an image while it is being uploaded, and deferred cleanup does not block sessions", async () => {
  let removed = 0;
  const { cache, calls } = await cacheHarness({ deleteImage: async () => { removed++; } });
  await cache.addToSyncQueue({ type: "delete_image", payload: { imageUrl: "https://example.test/image.webp" } });
  await cache.addToSyncQueue(newSession());
  await cache.processQueue({ force: true });
  assert.equal(removed, 0); assert.equal(calls.length, 1);
  assert.equal(cache.getSyncQueue().length, 1);
  assert.equal(cache.getSyncQueue()[0].type, "delete_image");
});

test("a confirmed exercise keeps its pending child visible when the child request fails", async () => {
  const id = webcrypto.randomUUID();
  const { cache, owner } = await cacheHarness({ addSession: async () => { throw new Error("offline"); } });
  await cache.addToSyncQueue({ type: "add_exercise", payload: { tempId: id, name: "Squat", category: "legs" } });
  const child = newSession(); child.payload.exerciseId = id;
  await cache.addToSyncQueue(child);
  await cache.processQueue();
  assert.equal(cache.getSyncQueue().length, 1);
  const projected = cache.applyPendingOperations([{ id, user_id: owner, sessions: [] }]);
  assert.equal(projected[0].sessions[0].id, child.payload.tempId);
});

test("validation failures stay recoverable and do not retry automatically", async () => {
  let attempts = 0;
  const { cache } = await cacheHarness({ addSession: async () => { attempts++; throw { code: "23514", message: "invalid session" }; } });
  await cache.addToSyncQueue(newSession());
  await cache.processQueue(); await cache.processQueue();
  assert.equal(attempts, 1); assert.equal(cache.getSyncQueue()[0].failureKind, "validation");
  await cache.processQueue({ force: true }); assert.equal(attempts, 2);
  assert.equal(cache.getSyncQueue().length, 1);
});
