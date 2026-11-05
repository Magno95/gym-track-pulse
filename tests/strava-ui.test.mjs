import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
const require = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");

async function view({ connected = true, publication = null, pending = false, complete = true,
  canReadActivities = false, importedActivity = null, activities = [], errors = {} } = {}) {
  const requests = [];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const queue = pending ? [{ type: "update_session" }] : [];
  const simple = (tag) => ({ children, ...props }) => React.createElement(tag, props, children);
  const source = readFileSync(new URL("../src/components/StravaPublish.tsx", import.meta.url), "utf8");
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Date, Error, URLSearchParams, window: { location: { assign: () => {} } }, document: { getElementById: () => null },
    require: (name) => {
      if (name === "@/hooks/useAuth") return { useAuth: () => ({ userId: "alice" }) };
      if (name === "react-router-dom") return { useSearchParams: () => [new URLSearchParams(), () => {}] };
      if (name === "@/lib/localCache") return { getSyncQueue: () => queue, subscribeToSync: () => () => {} };
      if (name === "@/lib/strava") return { mapStravaExercise: () => ({ fallback: false }), stravaRequest: async (_owner, body) => {
        requests.push(body);
        if (errors[body.action]) throw new Error(errors[body.action]);
        if (body.action === "status") return { connected, configured: true, publication, canReadActivities, importedActivity };
        if (body.action === "activities") return { activities };
        if (body.action === "import-activity") return { importedActivity: { ...activities.find((activity) => activity.id === body.activityId), sampleCount: 5, importedAt: "2026-10-04T00:00:00Z" } };
        return {};
      } };
      if (name === "@/components/ui/dialog") return { Dialog: ({ open, children }) => open ? React.createElement("dialog", null, children) : null,
        DialogContent: simple("section"), DialogDescription: simple("p"), DialogHeader: simple("header"), DialogTitle: simple("h2") };
      if (name === "@/components/ui/button") return { Button: simple("button") };
      if (name === "@/components/ui/input") return { Input: simple("input") };
      if (name === "@/components/ui/label") return { Label: simple("label") };
      if (name === "lucide-react") return { Upload: simple("svg"), Loader2: simple("svg"), ExternalLink: simple("svg") };
      return require(name);
    },
  });
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client }, React.createElement(exports.StravaPublish, {
      date: "2026-10-03", complete, exercises: [{ name: "Panca Inclinata Manubri", category: "chest", sessions: [{ date: "2026-10-03" }] }],
    })));
  });
  const until = async (predicate) => {
    for (let i = 0; i < 40; i++) {
      if (predicate()) return;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    assert.fail("UI did not reach expected state");
  };
  await act(async () => renderer.root.findByType("button").props.onClick());
  await until(() => renderer.root.findAllByProps({ id: "strava-title" }).length > 0 || renderer.root.findAllByType("button").length > 1);
  return { renderer, requests, until, async close() { await act(async () => renderer.unmount()); client.clear(); } };
}

test("session publish dialog requires actual time and duration, then sends only publication options", async () => {
  const v = await view();
  try {
    await v.until(() => v.renderer.root.findAllByProps({ id: "strava-title" }).length > 0);
    const root = v.renderer.root;
    assert.equal(root.findByProps({ id: "strava-time" }).props.value, "");
    assert.equal(root.findByProps({ id: "strava-duration" }).props.value, "");
    await act(async () => {
      root.findByProps({ id: "strava-time" }).props.onChange({ target: { value: "18:00" } });
      root.findByProps({ id: "strava-duration" }).props.onChange({ target: { value: "45" } });
    });
    await act(async () => root.findByType("form").props.onSubmit({ preventDefault() {} }));
    const sent = v.requests.find((request) => request.action === "publish");
    assert.equal(sent.date, "2026-10-03");
    assert.equal(sent.elapsedTime, 2700);
    assert.equal(sent.name, "GymTrack · 2026-10-03");
    assert.equal(sent.exercises, undefined);
    assert.equal(sent.userId, undefined);
  } finally { await v.close(); }
});

const activity = { id: "987", name: "Forza Garmin", startTime: "2026-10-03T16:00:07Z", utcOffset: 7200,
  elapsedTime: 3607, averageHeartRate: 112.4, maxHeartRate: 155, hasHeartRate: true };

test("selects a Strava activity explicitly, imports metrics and publishes the server snapshot", async () => {
  const v = await view({ canReadActivities: true, activities: [activity] });
  try {
    await v.until(() => v.renderer.root.findAllByType("option").length === 2);
    const root = v.renderer.root;
    assert.equal(v.requests.some((request) => request.action === "import-activity"), false);
    const importButton = () => root.findAllByType("button").find((button) => button.children.includes("Importa durata e battito"));
    assert.equal(importButton().props.disabled, true);
    await act(async () => root.findByProps({ id: "strava-source" }).props.onChange({ target: { value: "987" } }));
    assert.equal(importButton().props.disabled, false);
    await act(async () => importButton().props.onClick());
    await v.until(() => root.findAllByProps({ id: "strava-use-imported" }).length > 0);
    assert.equal(root.findAllByProps({ id: "strava-time" }).length, 0);
    assert.match(JSON.stringify(v.renderer.toJSON()), /60 min 7 s/);
    assert.match(JSON.stringify(v.renderer.toJSON()), /112 bpm/);
    assert.match(JSON.stringify(v.renderer.toJSON()), /155 bpm/);
    await act(async () => root.findByType("form").props.onSubmit({ preventDefault() {} }));
    assert.deepEqual(JSON.parse(JSON.stringify(v.requests.find((request) => request.action === "publish"))), {
      action: "publish", date: "2026-10-03", name: "GymTrack · 2026-10-03", useImportedActivity: true,
    });
  } finally { await v.close(); }
});

test("restores saved import after reopening and permits manual publishing without the HR stream", async () => {
  const v = await view({ importedActivity: { ...activity, sampleCount: 5, importedAt: "2026-10-04T00:00:00Z" } });
  try {
    await v.until(() => v.renderer.root.findAllByProps({ id: "strava-use-imported" }).length > 0);
    const root = v.renderer.root;
    assert.equal(root.findByProps({ id: "strava-use-imported" }).props.checked, true);
    await act(async () => root.findByProps({ id: "strava-use-imported" }).props.onChange({ target: { checked: false } }));
    await act(async () => {
      root.findByProps({ id: "strava-time" }).props.onChange({ target: { value: "18:00" } });
      root.findByProps({ id: "strava-duration" }).props.onChange({ target: { value: "45" } });
    });
    await act(async () => root.findByType("form").props.onSubmit({ preventDefault() {} }));
    const sent = v.requests.find((request) => request.action === "publish");
    assert.equal(sent.useImportedActivity, undefined);
    assert.equal(sent.elapsedTime, 2700);
  } finally { await v.close(); }
});

test("old grants offer read authorization; empty and failed imports remain recoverable", async () => {
  const legacy = await view();
  try {
    await legacy.until(() => legacy.renderer.root.findAllByType("form").length > 0);
    assert.match(JSON.stringify(legacy.renderer.toJSON()), /Autorizza la lettura delle attività/);
    assert.equal(legacy.requests.some((request) => request.action === "activities"), false);
  } finally { await legacy.close(); }
  const empty = await view({ canReadActivities: true });
  try {
    await empty.until(() => JSON.stringify(empty.renderer.toJSON()).includes("Nessuna attività disponibile"));
    assert.match(JSON.stringify(empty.renderer.toJSON()), /Aggiorna elenco/);
  } finally { await empty.close(); }
  const failed = await view({ canReadActivities: true, activities: [activity], errors: { "import-activity": "Limite Strava raggiunto" } });
  try {
    await failed.until(() => failed.renderer.root.findAllByType("option").length === 2);
    const root = failed.renderer.root;
    await act(async () => root.findByProps({ id: "strava-source" }).props.onChange({ target: { value: "987" } }));
    await act(async () => root.findAllByType("button").find((button) => button.children.includes("Importa durata e battito")).props.onClick());
    await failed.until(() => JSON.stringify(failed.renderer.toJSON()).includes("Limite Strava raggiunto"));
    assert.equal(failed.requests.some((request) => request.action === "publish"), false);
    assert.equal(root.findByProps({ id: "strava-time" }).props.value, "");
  } finally { await failed.close(); }
});

test("unsynchronized changes and incomplete day history block publication", async () => {
  for (const state of [{ pending: true }, { complete: false }]) {
    const v = await view(state);
    try {
      await v.until(() => v.renderer.root.findAllByType("form").length > 0);
      assert.equal(v.renderer.root.findAllByType("button").find((button) => button.props.type === "submit").props.disabled, true);
      await act(async () => v.renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
      assert.equal(v.requests.some((request) => request.action === "publish"), false);
    } finally { await v.close(); }
  }
});

test("published sessions show the Strava link and uncertain sessions cannot be submitted again", async () => {
  const published = await view({ publication: { status: "published", activityId: "456", error: null } });
  try {
    await published.until(() => published.renderer.root.findAllByType("a").length > 0);
    assert.equal(published.renderer.root.findByType("a").props.href, "https://www.strava.com/activities/456");
    assert.equal(published.renderer.root.findAllByType("form").length, 0);
  } finally { await published.close(); }
  const uncertain = await view({ publication: { status: "uncertain", activityId: null, error: null } });
  try { assert.equal(uncertain.renderer.root.findAllByType("form").length, 0); }
  finally { await uncertain.close(); }
});
