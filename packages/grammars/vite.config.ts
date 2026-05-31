import { defineConfig } from "vite-plus";
import civetVitePlugin from '@danielx/civet/vite';
import { fileURLToPath, URL } from "node:url";

const civet = civetVitePlugin({
  ts: "preserve"
});

export default defineConfig({
  plugins: [civet],
  worker: {
    plugins: () => [civet],
  },
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
  },
  fmt: {},
});
