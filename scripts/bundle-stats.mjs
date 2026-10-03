import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const manifest = JSON.parse(readFileSync(new URL("../dist/.vite/manifest.json", import.meta.url), "utf8"));
const screens = { boot: ["index.html"], auth: ["index.html", "src/pages/Auth.tsx"], home: ["index.html", "src/pages/Index.tsx"] };
for (const [screen, roots] of Object.entries(screens)) {
  const seen = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
  }
  roots.forEach(visit);
  let bytes = 0, gzip = 0, files = 0;
  for (const key of seen) {
    const file = manifest[key].file;
    if (!file.endsWith(".js")) continue;
    const contents = readFileSync(new URL(`../dist/${file}`, import.meta.url));
    bytes += contents.length; gzip += gzipSync(contents).length; files++;
  }
  console.log(JSON.stringify({ screen, files, bytes, gzip }));
}
