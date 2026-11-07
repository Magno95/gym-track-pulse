import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const require = createRequire(import.meta.url);
const { Controller } = require("react-hook-form");
const compile = (path, overrides = {}) => {
  const exports = {};
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, console, Date, setTimeout, clearTimeout,
    require: (name) => overrides[name] ?? require(name) });
  return exports;
};
const bodyweight = compile("lib/bodyweight.ts");
const sessionForm = compile("lib/sessionForm.ts");
const simple = (tag) => React.forwardRef(function Element({ children, ...props }, ref) {
  return React.createElement(tag, { ...props, ref }, children);
});

async function view({ fail = false, hold = false, ...props } = {}) {
  const calls = [], closed = [], errors = [];
  let release;
  const pending = hold ? new Promise((resolve) => { release = resolve; }) : null;
  const mutation = (type, exerciseId) => ({ mutateAsync: async (data) => {
    calls.push({ type, exerciseId, data });
    if (fail) { fail = false; throw new Error("Save failed"); }
    if (pending) await pending;
    return type === "superset" ? { primary: { id: "primary" }, secondary: { id: "secondary" }, supersetId: "pair" } : { id: "primary" };
  } });
  const { AddSessionDialog } = compile("components/AddSessionDialog.tsx", {
    "@/hooks/useProfile": { useProfile: () => ({ history: { data: [{ effective_date: "2020-01-01", weight_kg: 80 }] } }) },
    "@/lib/bodyweight": bodyweight,
    "@/lib/sessionForm": sessionForm,
    "@/components/BodyweightSummary": { BodyweightSummary: () => null },
    sonner: { toast: { error: (message) => errors.push(message) } },
    "@/hooks/useSessionMutations": { useAddSession: (id) => mutation("add", id),
      useAddSupersetSession: () => mutation("superset"), useUpdateSession: (id) => mutation("update", id) },
    "@/lib/supabaseStore": { supabaseStore: {} },
    "@/lib/localCache": { getCachedExercises: () => [{ id: "other", name: "Plank", unit: "time", is_bodyweight: true }] },
    "@/lib/categoryIcons": { getCategoryIcon: () => simple("svg") },
    "@/components/ui/dialog": { Dialog: ({ open, children, onOpenChange }) => open ? React.createElement("dialog", { onOpenChange }, children) : null,
      DialogContent: simple("section"), DialogDescription: simple("p"), DialogHeader: simple("header"), DialogTitle: simple("h2"), DialogTrigger: simple("div") },
    "@/components/ui/form": { Form: ({ children }) => children, FormField: Controller,
      FormControl: simple("div"), FormItem: simple("div"), FormLabel: simple("label"), FormMessage: () => null },
    "@/components/ui/input": { Input: simple("input") },
    "@/components/ui/button": { Button: simple("button") },
    "@/components/ui/badge": { Badge: simple("span") },
    "@/components/ui/switch": { Switch: simple("switch") },
  });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(AddSessionDialog, {
    exerciseId: "exercise", exerciseName: "Squat", open: true, hideTrigger: true,
    onSessionAdded() {}, onOpenChange: (open) => closed.push(open), ...props,
  })); });
  const root = renderer.root;
  const addButtons = () => root.findAllByType("button").filter((b) => b.children.some((child) => typeof child === "string" && child.includes("Add Set")));
  return { calls, closed, errors, root, release,
    async add(index = 0) { await act(async () => { addButtons()[index].props.onClick({ currentTarget: { blur() {} } }); }); },
    async change(label, value) { await act(async () => root.findByProps({ "aria-label": label }).props.onChange({ target: { value } })); },
    async dismiss() { await act(async () => root.findByType("dialog").props.onOpenChange(false)); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test("Add Set saves the first set, then updates the same session and saves final edits on close", async () => {
  const v = await view();
  try {
    assert.equal(v.calls.length, 0);
    assert.equal(v.root.findAllByType("button").some((b) => b.children.includes("Log Session")), false);
    await v.change("Set 1 repetitions", "8");
    await v.change("Set 1 load", "25");
    await v.add();
    assert.equal(v.calls[0].type, "add");
    assert.equal(v.calls[0].data.sets.length, 1);
    assert.equal(v.calls[0].data.sets[0].reps, 8);
    assert.deepEqual(v.closed, []);
    await v.add();
    assert.equal(v.calls[1].type, "update");
    assert.equal(v.calls[1].data.sessionId, "primary");
    assert.equal(v.calls[1].data.sets.length, 2);
    await v.change("Set 2 load", "30");
    await v.dismiss();
    assert.equal(v.calls[2].data.sets[1].weight, 30);
    assert.deepEqual(v.closed, [false]);
  } finally { await v.close(); }
});

test("invalid inputs cannot create a session and failed saves can be retried", async () => {
  const v = await view({ fail: true });
  try {
    await v.change("Set 1 repetitions", "0");
    await v.add();
    assert.equal(v.calls.length, 0);
    await v.change("Set 1 repetitions", "10");
    await v.add();
    assert.equal(v.errors.length, 1);
    await v.add();
    assert.equal(v.calls[1].type, "add");
    assert.equal(v.calls[1].data.sets.length, 1);
    await v.add();
    assert.equal(v.calls[2].type, "update");
  } finally { await v.close(); }
});

test("supersets retain their IDs, multiplier and timed bodyweight snapshots", async () => {
  const v = await view();
  try {
    await act(async () => v.root.findByType("switch").props.onCheckedChange(true));
    await act(async () => v.root.findAllByType("button").find((b) => b.findAllByType("span").some((span) => span.children.includes("Plank"))).props.onClick());
    await v.add();
    assert.equal(v.calls[0].type, "superset");
    assert.equal(v.calls[0].data.secondarySets[0].duration_seconds, 30);
    assert.equal(v.calls[0].data.secondarySets[0].body_weight, 80);
    await v.add(1);
    const secondary = v.calls.at(-1);
    assert.equal(secondary.exerciseId, "other");
    assert.equal(secondary.data.sessionId, "secondary");
    assert.equal(secondary.data.supersetId, "pair");
    assert.equal(secondary.data.valueMultiplier, 1.2);
    assert.equal(secondary.data.sets.length, 2);
  } finally { await v.close(); }
});

test("repeated clicks and closing during a save cannot duplicate or discard the session", async () => {
  const v = await view({ hold: true });
  try {
    await v.add();
    await v.add();
    await v.dismiss();
    assert.equal(v.calls.length, 1);
    assert.deepEqual(v.closed, []);
    await act(async () => v.release());
    await v.dismiss();
    assert.deepEqual(v.closed, [false]);
  } finally { v.release(); await v.close(); }
});
