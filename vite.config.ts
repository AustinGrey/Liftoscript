import { defineConfig, lazyPlugins } from "vite-plus";

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
  fmt: {},
  lint: {
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["**/*.civet"],
  },
  run: {
    cache: true,
  },
});
