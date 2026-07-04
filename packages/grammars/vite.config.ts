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
  check: {
    // This project is formatted with Prettier for now, until I can figure out how to integrate my IDE with Vite Plus fmt on save
    fmt: false,
  },
});
