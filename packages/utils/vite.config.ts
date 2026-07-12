import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		dts: {
			tsgo: true,
		},
		unbundle: true,
		exports: true,
	},
	lint: {
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	fmt: {},
});
