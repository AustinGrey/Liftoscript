import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {},
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
  check: {
    // This project is formatted with Prettier for now, until I can figure out how to integrate my IDE with Vite Plus fmt on save
    fmt: false,
  },
});
