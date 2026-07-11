import { defineConfig } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	pack: {
		dts: {
			tsgo: true,
			sourcemap: true,
		},
		unbundle: true,
		exports: true,
	},
});
