import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/bodyweight.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { findBodyWeight, materializeSets, getEditableSets, bodyWeightForEdit, isBodyweightSession, todayLocal } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const history = [{ effective_date: "2026-10-15", weight_kg: 78 }, { effective_date: "2026-10-01", weight_kg: 80 }];
const workout = { date: "2026-10-10", series: 2, reps: 10, weight: 80, sets: materializeSets([{ reps: 10, weight: 0 }, { reps: 8, weight: 10 }], true, 80) };

test("uses the weight valid on the workout date, regardless of history order or entry time", () => {
  assert.equal(findBodyWeight(history, "2026-09-30"), null);
  assert.equal(findBodyWeight(history, "2026-10-01"), 80);
  assert.equal(findBodyWeight(history, "2026-10-10"), 80);
  assert.equal(findBodyWeight(history, "2026-10-15"), 78);
  assert.equal(findBodyWeight(history, "2026-11-20"), 78);
  assert.equal(findBodyWeight([], "2026-11-20"), null);
});

test("materializes separate added loads and preserves the exact bodyweight snapshot", () => {
  assert.deepEqual(workout.sets, [
    { reps: 10, weight: 80, body_weight: 80, additional_weight: 0 },
    { reps: 8, weight: 90, body_weight: 80, additional_weight: 10 },
  ]);
  assert.equal(workout.sets.reduce((sum, set) => sum + set.reps * set.weight, 0), 1520);
  assert.deepEqual(getEditableSets(workout), [{ reps: 10, weight: 0 }, { reps: 8, weight: 10 }]);
  assert.equal(materializeSets([{ reps: 5, weight: 0.2 }], true, 78.1)[0].weight, 78.3);
});

test("rejects missing historical weight, invalid body weight and negative added load", () => {
  for (const weight of [null, 0, -1, NaN, Infinity]) assert.throws(() => materializeSets([{ reps: 10, weight: 0 }], true, weight));
  assert.throws(() => materializeSets([{ reps: 10, weight: -5 }], true, 80));
  assert.throws(() => materializeSets([{ reps: 0, weight: 0 }], true, 80));
});

test("manual and legacy sessions remain manual after an exercise is converted", () => {
  const legacy = { date: "2026-10-10", sets: null, series: 2, reps: 10, weight: 25 };
  assert.equal(isBodyweightSession(legacy), false);
  assert.equal(bodyWeightForEdit(legacy, "2026-10-15", history), null);
  assert.deepEqual(getEditableSets(legacy), [{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }]);
  assert.deepEqual(materializeSets(getEditableSets(legacy), false, 78), getEditableSets(legacy));
  assert.equal(isBodyweightSession({ sets: [{ reps: 10, weight: 25 }] }), false);
});

test("editing reps or added weight preserves the snapshot despite profile corrections", () => {
  const corrected = [{ effective_date: "2026-10-01", weight_kg: 75 }];
  const savedWeight = bodyWeightForEdit(workout, workout.date, corrected);
  assert.equal(savedWeight, 80);
  assert.deepEqual(materializeSets([{ reps: 12, weight: 5 }], true, savedWeight), [{ reps: 12, weight: 85, body_weight: 80, additional_weight: 5 }]);
});

test("changing a bodyweight session date resolves the new historical weight", () => {
  assert.equal(bodyWeightForEdit(workout, "2026-10-15", history), 78);
  assert.equal(bodyWeightForEdit(workout, "2026-09-20", history), null);
  const sets = materializeSets(getEditableSets(workout), true, bodyWeightForEdit(workout, "2026-10-15", history));
  assert.deepEqual(sets.map((set) => set.weight), [78, 88]);
});

test("defaults to the local calendar date near UTC midnight", () => {
  const original = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati";
  const local = new Date();
  assert.equal(todayLocal(), `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`);
  if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
});

const { cacheHarness, plain } = await import("./harness.mjs");

test("offline replay and later server sync retain bodyweight and added-load metadata", async () => {
  const { cache, calls } = await cacheHarness();
  await cache.addToSyncQueue({ type: "add_session", payload: { exerciseId: "exercise", tempId: "temp-session", date: workout.date, sets: workout.sets } });
  const replayed = cache.applyPendingOperations([{ id: "exercise", sessions: [] }])[0].sessions[0];
  assert.deepEqual(plain(replayed.sets), workout.sets);
  assert.equal(replayed.value, 1520);
  await cache.processQueue();
  assert.deepEqual(plain(calls[0][1].sets), workout.sets);
  assert.equal(cache.getSyncQueue().length, 0);
});

test("superset replay and sync retain both snapshots and the secondary multiplier", async () => {
  const { cache, calls } = await cacheHarness();
  const secondarySets = materializeSets([{ reps: 5, weight: 20 }], true, 78);
  await cache.addToSyncQueue({ type: "add_superset_session", payload: {
    primaryExerciseId: "primary", secondaryExerciseId: "secondary", primaryTempId: "temp-primary", secondaryTempId: "temp-secondary",
    date: workout.date, primarySets: workout.sets, secondarySets, multiplier: 1.2,
  } });
  const replayed = cache.applyPendingOperations([{ id: "primary", sessions: [] }, { id: "secondary", sessions: [] }]);
  assert.deepEqual(plain(replayed[0].sessions[0].sets), workout.sets);
  assert.deepEqual(plain(replayed[1].sessions[0].sets), secondarySets);
  assert.equal(replayed[1].sessions[0].value, 588);
  await cache.processQueue();
  assert.deepEqual(plain(calls[0][3]), workout.sets);
  assert.deepEqual(plain(calls[0][4]), secondarySets);
  assert.equal(calls[0][5], 1.2);
});

test("editing a queued session preserves updated bodyweight metadata and multiplier", async () => {
  const { cache, calls } = await cacheHarness();
  const sets = materializeSets([{ reps: 8, weight: 12 }], true, 78);
  await cache.addToSyncQueue({ type: "update_session", payload: { sessionId: "session", date: "2026-10-15", sets, valueMultiplier: 1.2 } });
  const replayed = cache.applyPendingOperations([{ id: "exercise", sessions: [{ ...workout, id: "session" }] }])[0].sessions[0];
  assert.deepEqual(plain(replayed.sets), sets);
  assert.equal(replayed.value, 864);
  await cache.processQueue();
  assert.deepEqual(plain(calls[0][1].sets), sets);
  assert.equal(calls[0][2].valueMultiplier, 1.2);
});
