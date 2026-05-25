import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Handlebars from "handlebars";
import { defineConfig, type Plugin } from "vite";
const appRoot = dirname(fileURLToPath(import.meta.url));
const viewsRoot = resolve(appRoot, "src/views");
const packageJson = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf8")) as { version: string };

const getViewFiles = (dir: string): string[] => {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      return getViewFiles(entryPath);
    }

    return /\.(html|hbs)$/.test(entry.name) ? [entryPath] : [];
  });
};

const registerViewPartials = () => {
  const viewFiles = getViewFiles(viewsRoot);

  for (const filePath of viewFiles) {
    const source = readFileSync(filePath, "utf8");
    const partialName = basename(filePath).replace(/\.(html|hbs)$/, "");
    const relativeName = relative(viewsRoot, filePath).replace(/\.(html|hbs)$/, "").replace(/\\/g, "/");

    Handlebars.registerPartial(partialName, source);
    Handlebars.registerPartial(relativeName, source);
  }

  return viewFiles;
};

const compileHandlebars = (source: string) => {
  registerViewPartials();
  return Handlebars.compile(source)({});
};

const handlebarsViewsPlugin = (): Plugin => ({
  name: "handlebars-view-fragments",
  enforce: "pre" as const,
  buildStart() {
    for (const viewFile of registerViewPartials()) {
      this.addWatchFile(viewFile);
    }
  },
  transformIndexHtml: {
    order: "pre",
    handler(html) {
      return compileHandlebars(html);
    },
  },
  load(id: string) {
    if (!id.endsWith(".html?raw")) {
      return null;
    }

    const filePath = id.replace(/\?raw$/, "");

    if (!filePath.startsWith(viewsRoot)) {
      return null;
    }

    const viewFiles = registerViewPartials();

    for (const viewFile of viewFiles) {
      this.addWatchFile(viewFile);
    }

    const html = compileHandlebars(readFileSync(filePath, "utf8"));

    return `export default ${JSON.stringify(html)};`;
  },
  handleHotUpdate(context) {
    if (!context.file.startsWith(viewsRoot) || !/\.(html|hbs)$/.test(context.file)) {
      return;
    }

    registerViewPartials();
    context.server.ws.send({
      type: "full-reload",
      path: "*",
    });

    return [];
  },
});

export default defineConfig(() => {
  return {
    plugins: [handlebarsViewsPlugin()],
    envDir: "..",
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __PROJECT_NAME__: JSON.stringify("crizalKiosk"),
    },
    build: {
      emptyOutDir: true,
      outDir: "dist",
      sourcemap: false,
    },
    preview: {
      host: true,
      port: 1347,
    },
    server: {
      host: true,
      port: 1347,
    },
  };
});
