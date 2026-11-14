import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
	server: {
		host: "0.0.0.0",
		port: 5174,
		strictPort: true,
	},
	plugins: [react(), tailwindcss(), mode === "development" && componentTagger()].filter(Boolean),
	build: { manifest: true },
	define: {
		__APP_VERSION__: JSON.stringify(packageJson.version),
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
}));
