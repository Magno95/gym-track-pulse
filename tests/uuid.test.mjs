import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { cacheHarness } from "./harness.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const legacyCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };

async function sessionHarness() {
  let harness;
  harness = await cacheHarness({}, { crypto: legacyCrypto, modules: {
    "@tanstack/react-query": { useMutation: (options) => options },
    "./useAuth": { useAuth: () => ({ userId: harness.owner }) },
    "@/lib/supabaseStore": { buildSessionPayload: (params) => params },
  } });
  return harness;
}

test("logging a set without crypto.randomUUID persists and synchronizes the same ID", async () => {
  const h = await sessionHarness();
  const mutation = h.load("hooks/useSessionMutations").useAddSession("exercise");
  const result = await mutation.mutationFn({ date: "2026-11-07", sets: [{ reps: 10, weight: 25 }] });
  assert.match(result.id, uuidPattern);
  const [operation] = h.cache.getSyncQueue();
  assert.match(operation.id, uuidPattern);
  assert.match(operation.version, uuidPattern);
  assert.equal(operation.payload.tempId, result.id);
  await h.cache.processQueue();
  assert.equal(h.calls[0][2].id, result.id);
  assert.equal(h.cache.getSyncQueue().length, 0);
});

test("logging a superset without crypto.randomUUID preserves both IDs and the pair", async () => {
  const h = await sessionHarness();
  const mutation = h.load("hooks/useSessionMutations").useAddSupersetSession();
  const result = await mutation.mutationFn({ primaryExerciseId: "exercise", secondaryExerciseId: "other",
    date: "2026-11-07", primarySets: [{ reps: 10, weight: 25 }], secondarySets: [{ reps: 8, weight: 20 }], multiplier: 1.2 });
  const ids = [result.primary.id, result.secondary.id, result.supersetId];
  ids.forEach((id) => assert.match(id, uuidPattern));
  assert.equal(new Set(ids).size, 3);
  await h.cache.processQueue();
  const options = h.calls[0][6];
  assert.equal(options.primaryId, result.primary.id);
  assert.equal(options.secondaryId, result.secondary.id);
  assert.equal(options.supersetId, result.supersetId);
  assert.equal(h.cache.getSyncQueue().length, 0);
});

test("queue-generated exercise and session IDs also work without crypto.randomUUID", async () => {
  const h = await cacheHarness({}, { crypto: legacyCrypto });
  await h.cache.addToSyncQueue({ type: "add_exercise", payload: { name: "Squat", category: "legs" } });
  await h.cache.addToSyncQueue({ type: "add_session", payload: { exerciseId: "exercise", date: "2026-11-07", sets: [{ reps: 10, weight: 25 }] } });
  for (const operation of h.cache.getSyncQueue()) assert.match(operation.payload.tempId, uuidPattern);
  await h.cache.processQueue();
  assert.equal(h.cache.getSyncQueue().length, 0);
});
