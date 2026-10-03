import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/pagination.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { readAllPages } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("retrieves records beyond the default 1000-row cap, including a smaller API cap", async () => {
  const rows = Array.from({ length: 1234 }, (_, id) => ({ id }));
  const result = await readAllPages(async (from, to) => ({ data: rows.slice(from, Math.min(to + 1, from + 73)), error: null }));
  assert.deepEqual(result, rows);
});

test("never returns partial history when an intermediate page fails", async () => {
  await assert.rejects(readAllPages(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null } : { data: null, error: new Error("network failure") }), /network failure/);
});
