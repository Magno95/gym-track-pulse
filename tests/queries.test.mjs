import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createRequire } from "node:module";
const { QueryClient, QueryClientProvider } = createRequire(import.meta.url)("@tanstack/react-query");
import { cacheHarness } from "./harness.mjs";

async function mountHook(harness, hook) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { AuthContext } = harness.load("lib/authContext");
  let snapshot;
  function Probe() { snapshot = hook(); return null; }
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: { userId: harness.owner, loading: false, error: null } }, React.createElement(Probe))));
  });
  return {
    get current() { return snapshot; },
    async until(predicate) {
      for (let n = 0; n < 100; n++) {
        if (predicate(snapshot)) return;
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
      }
      assert.fail("query did not reach the expected state");
    },
    async close() { await act(async () => { renderer.unmount(); }); client.clear(); },
  };
}
const exercise = (owner, sessions = []) => ({ id: "exercise", user_id: owner, name: "Squat", category: "legs", sessions });

test("refreshes an old persistent overview immediately using its actual update time", async () => {
  let requests = 0; let owner;
  const harness = await cacheHarness({ getAll: async () => { requests++; return [{ ...exercise(owner), name: "Updated" }]; } });
  owner = harness.owner;
  harness.cache.setCachedExercises([exercise(owner)]);
  const key = [...harness.storage.keys()][0];
  const cached = JSON.parse(harness.storage.get(key)); cached.updatedAt = Date.now() - 86400_000;
  harness.storage.set(key, JSON.stringify(cached));
  const hooks = harness.load("hooks/useExercises");
  const view = await mountHook(harness, hooks.useExercises);
  try { await view.until((query) => query.data[0]?.name === "Updated"); assert.equal(requests, 1); }
  finally { await view.close(); }
});

test("a two-session overview is a placeholder and does not suppress the full exercise-history read", async () => {
  let resolve; let requests = 0;
  const response = new Promise((finish) => { resolve = finish; });
  const harness = await cacheHarness({ getById: async () => { requests++; return response; } });
  harness.cache.setCachedExercises([exercise(harness.owner, [{ id: "recent-1", date: "2026-10-01" }, { id: "recent-2", date: "2026-10-02" }])]);
  const hooks = harness.load("hooks/useExercises");
  const view = await mountHook(harness, () => hooks.useExercise("exercise"));
  try {
    assert.equal(view.current.hasCompleteHistory, false);
    assert.equal(requests, 1);
    await act(async () => { resolve(exercise(harness.owner, Array.from({ length: 1201 }, (_, id) => ({ id: String(id), date: "2026-10-02" })))); });
    await view.until((query) => query.hasCompleteHistory);
    assert.equal(view.current.data.sessions.length, 1201);
  } finally { await view.close(); }
});

test("a day opened offline still shows this account's newly queued sessions and reports incomplete server data", async () => {
  const harness = await cacheHarness({ getForDate: async () => { throw new Error("offline"); } });
  harness.cache.setCachedExercises([exercise(harness.owner)]);
  await harness.cache.addToSyncQueue({ type: "add_session", payload: { exerciseId: "exercise", tempId: webcrypto.randomUUID(), date: "2026-10-02", sets: [{ reps: 10, weight: 25 }] } });
  const hooks = harness.load("hooks/useExercises");
  const view = await mountHook(harness, () => hooks.useDaySession("2026-10-02"));
  try {
    await view.until((query) => query.isError);
    assert.equal(view.current.data[0].sessions[0].value, 250);
    assert.equal(view.current.hasCompleteHistory, false);
  } finally { await view.close(); }
});

test("moving a saved session to another day remains visible there before synchronization", async () => {
  let owner;
  const harness = await cacheHarness({ getForDate: async () => [exercise(owner)] });
  owner = harness.owner;
  await harness.cache.addToSyncQueue({ type: "update_session", payload: {
    exerciseId: "exercise", sessionId: "existing-session", date: "2026-10-03", sets: [{ reps: 10, weight: 25 }],
    valueMultiplier: 1.5, supersetId: "pair", isSupersetSecondary: true,
  } });
  const hooks = harness.load("hooks/useExercises");
  const view = await mountHook(harness, () => hooks.useDaySession("2026-10-03"));
  try {
    await view.until((query) => query.hasCompleteHistory);
    const session = view.current.data[0].sessions[0];
    assert.equal(session?.id, "existing-session");
    assert.equal(session.date, "2026-10-03");
    assert.equal(session.value, 375);
    assert.equal(session.value_multiplier, 1.5);
    assert.equal(session.superset_id, "pair");
    assert.equal(session.is_superset_secondary, true);
  } finally { await view.close(); }
});
