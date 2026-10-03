import test from "node:test";
import assert from "node:assert/strict";
import React, { useState } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import { cacheHarness } from "./harness.mjs";
const { QueryClient, QueryClientProvider } = createRequire(import.meta.url)("@tanstack/react-query");

async function mountAuth() {
  let notify, resolveInitial, setDraft, snapshot;
  const initial = new Promise((resolve) => { resolveInitial = resolve; });
  const supabase = { auth: {
    onAuthStateChange: (listener) => { notify = listener; return { data: { subscription: { unsubscribe() {} } } }; },
    getSession: () => initial,
  } };
  const harness = await cacheHarness({}, { supabase });
  const { AuthProvider } = harness.load("components/AuthProvider");
  const { useAuth } = harness.load("hooks/useAuth");
  const client = new QueryClient();
  function Form() {
    const [draft, update] = useState(""); setDraft = update;
    snapshot = { ...useAuth(), draft }; return null;
  }
  let renderer;
  await act(async () => { renderer = TestRenderer.create(React.createElement(QueryClientProvider, { client },
    React.createElement(AuthProvider, null, React.createElement(Form)))); });
  return {
    harness, client, get current() { return snapshot; },
    async initial(userId) { await act(async () => { resolveInitial({ data: { session: { user: { id: userId } } }, error: null }); }); },
    async login(userId) { await act(async () => { notify("SIGNED_IN", { user: { id: userId } }); }); },
    async draft(value) { await act(async () => { setDraft(value); }); },
    async close() { await act(async () => { renderer.unmount(); }); client.clear(); },
  };
}

test("changing accounts clears pending form state and the previous account's query data", async () => {
  const view = await mountAuth();
  try {
    await view.initial(view.harness.owner);
    await view.draft("Private form for A");
    view.client.setQueryData(["exercises", view.harness.owner], [{ name: "Private data for A" }]);
    const other = webcrypto.randomUUID(); await view.login(other);
    assert.equal(view.current.userId, other);
    assert.equal(view.harness.load("lib/authSession").getCurrentUserId(), other);
    assert.equal(view.current.draft, "");
    assert.equal(view.client.getQueryData(["exercises", view.harness.owner]), undefined);
  } finally { await view.close(); }
});

test("a stale initial session result cannot overwrite a newer authentication event", async () => {
  const view = await mountAuth();
  try {
    const other = webcrypto.randomUUID(); await view.login(other);
    await view.initial(view.harness.owner);
    assert.equal(view.current.userId, other);
    assert.equal(view.harness.load("lib/authSession").getCurrentUserId(), other);
  } finally { await view.close(); }
});
