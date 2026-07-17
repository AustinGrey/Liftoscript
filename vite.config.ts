import { defineConfig } from "vite-plus";

export default defineConfig({
	fmt: {
		useTabs: true,
		arrowParens: "avoid",
	},
	lint: {
		options: { typeAware: true, typeCheck: true },
		rules: {
			// We often do stuff like "a" | "b" | string to allow any string, but still suggest common things
			"typescript/no-redundant-type-constituents": "off",
		},
	},
	run: {
		cache: true,
	},
});
