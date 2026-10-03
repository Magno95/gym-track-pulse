import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { posix } from "node:path";
import ts from "typescript";
import "fake-indexeddb/auto";

const require = createRequire(import.meta.url);
export const plain = (value) => JSON.parse(JSON.stringify(value));

export async function cacheHarness(store = {}, boundaries = {}) {
  const storage = new Map();
  const calls = [];
  const modules = new Map();
  const implementation = {
    addExercise: async (data, options) => ({ ...data, id: options.id }),
    addSession: async (...args) => { calls.push(args); return { id: args[2].id }; },
    updateSession: async (...args) => { calls.push(args); return { id: args[0] }; },
    addSupersetSession: async (...args) => {
      calls.push(args);
      return { primary: { id: args[6].primaryId }, secondary: { id: args[6].secondaryId } };
    },
    deleteSession: async () => {}, deleteExercise: async () => {}, deleteImage: async () => {}, ...store,
  };
  const browserStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const exports = {}; modules.set(path, exports);
    let source;
    try { source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; source = readFileSync(new URL(`../src/${path}.tsx`, import.meta.url), "utf8"); }
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, {
      exports, require: (name) => {
        if (name === "@/integrations/supabase/client" && boundaries.supabase) return { supabase: boundaries.supabase };
        if (name.endsWith("supabaseStore")) return { supabaseStore: implementation };
        if (name.startsWith("@/")) return load(name.slice(2));
        if (name.startsWith("./") || name.startsWith("../")) return load(posix.normalize(posix.join(posix.dirname(path), name)));
        return require(name);
      },
      localStorage: browserStorage, crypto: webcrypto, Date, console, navigator: { onLine: true },
      indexedDB, setTimeout, clearTimeout, setInterval, clearInterval,
    });
    return exports;
  }
  const auth = load("lib/authSession");
  const owner = webcrypto.randomUUID(); auth.setCurrentUserId(owner);
  const implementationCache = load("lib/localCache");
  const cache = { ...implementationCache,
    addToSyncQueue: (input, expectedUserId = auth.getCurrentUserId()) => implementationCache.addToSyncQueue(input, expectedUserId) };
  await cache.initSyncQueue?.(owner);
  return { cache, calls, storage, owner, load, setUser: async (userId) => { auth.setCurrentUserId(userId); await cache.initSyncQueue?.(userId); } };
}
