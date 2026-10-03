import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { twMerge } from "tailwind-merge";
import { componentTagger } from "lovable-tagger";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Tailwind 4 preserves the app theme, focus indicators, card shadow and dialog animation", async () => {
  const source = await readFile(path.join(root, "src/index.css"), "utf8");
  const compiler = await compile(source, { base: path.join(root, "src"), onDependency() {} });
  const css = compiler.build(["bg-background", "rounded-lg", "shadow-xs", "outline-hidden", "dark:bg-background", "container", "animate-in", "fade-in-0"]);
  assert.match(css, /background-color: hsl\(var\(--background\)\)/);
  assert.match(css, /border-radius: var\(--radius\)/);
  assert.match(css, /--tw-shadow: 0 1px 2px 0 /);
  assert.match(css, /outline: 2px solid transparent/);
  assert.match(css, /\.dark\\:bg-background:is\(\.dark \*\)/);
  assert.match(css, /padding-inline: 2rem/);
  assert.match(css, /animation-name: enter/);
  assert.match(css, /--tw-enter-opacity: 0/);
  assert.equal(twMerge("shadow-xs shadow-md"), "shadow-md");
  assert.equal(twMerge("w-(--sidebar-width) w-20"), "w-20");
});

test("Lovable visual editing retains theme extraction and JSX source tracking with Tailwind 4", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "gym-track-styling-"));
  const previousWindow = globalThis.window;
  try {
    await mkdir(path.join(fixture, "src"));
    await symlink(path.join(root, "node_modules"), path.join(fixture, "node_modules"), "dir");
    await copyFile(path.join(root, "src/index.css"), path.join(fixture, "src/index.css"));
    await copyFile(path.join(root, "tailwind.config.ts"), path.join(fixture, "tailwind.config.ts"));
    const plugin = componentTagger({ jsxSource: true, tailwindConfig: true });
    await plugin.configResolved({ root: fixture });
    await plugin.buildStart();
    const { theme } = JSON.parse(await readFile(path.join(fixture, "src/tailwind.config.lov.json"), "utf8"));
    assert.equal(theme.colors.background, "hsl(210 40% 98%)");
    assert.equal(theme.colors.primary, "hsl(210 100% 45%)");
    assert.equal(theme.borderRadius.lg, "0.75rem");

    const runtimeId = plugin.resolveId("react/jsx-dev-runtime", path.join(fixture, "src/Example.tsx"));
    await writeFile(path.join(fixture, "jsx-runtime.mjs"), plugin.load(runtimeId));
    globalThis.window = {};
    const { jsxDEV } = await import(pathToFileURL(path.join(fixture, "jsx-runtime.mjs")));
    const source = { fileName: "/dev-server/src/Example.tsx", lineNumber: 10, columnNumber: 3 };
    const node = {};
    let assignedRef;
    const element = jsxDEV("button", { ref: (value) => { assignedRef = value; }, children: "Log session" }, undefined, false, source);
    element.ref(node);
    assert.equal(assignedRef, node);
    assert.deepEqual(node[Symbol.for("__jsxSource__")], { fileName: "src/Example.tsx", lineNumber: 10, columnNumber: 3, displayName: "button" });
    assert.equal(window.sourceElementMap.get("src/Example.tsx:10:3").size, 1);
    const moved = jsxDEV("button", {}, undefined, false, { ...source, lineNumber: 12 });
    moved.ref(node);
    assert.equal(window.sourceElementMap.has("src/Example.tsx:10:3"), false);
    assert.equal(window.sourceElementMap.get("src/Example.tsx:12:3").size, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    await rm(fixture, { recursive: true, force: true });
  }
});
