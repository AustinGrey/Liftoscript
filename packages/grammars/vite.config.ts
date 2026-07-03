import { defineConfig, lazyPlugins } from "vite-plus";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: lazyPlugins(async () => {
    const { default: civetPlugin } = await import("@danielx/civet/vite");
    return [
      civetPlugin({
        implicitExtension: true,
        ts: "preserve",
      }),
    ];
  }),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    ignorePatterns: ["**/*.civet"],
  },
  fmt: {},
  test: {
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)", "**/*.{test,spec}.civet"],
  },
});
