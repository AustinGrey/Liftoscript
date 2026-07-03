# Civet IDE setup (LSP4IJ)

This repo compiles `.civet` files via the `@danielx/civet` Vite plugin and typechecks them with `pnpm check:civet`. For editor support in WebStorm or other JetBrains IDEs, use [LSP4IJ](https://github.com/redhat-developer/lsp4ij) instead of a custom plugin.

## 1. Install LSP4IJ

In your JetBrains IDE:

1. Open **Settings → Plugins**.
2. Search for **LSP4IJ** and install it.
3. Restart the IDE.

## 2. Add the Civet language server

After `pnpm install` at the repo root:

1. Open **Settings → Languages & Frameworks → Language Servers**.
2. Click **+** to add a user-defined language server.
3. Configure:

| Field             | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| **Name**          | Civet                                                                     |
| **Command**       | `node`                                                                    |
| **Arguments**     | `<repo>/node_modules/@danielx/civet-language-server/dist/node.js --stdio` |
| **File patterns** | `*.civet`                                                                 |

Replace `<repo>` with the absolute path to this repository (for example `C:\Users\corey\Documents\GitHub\Liftoscript`).

Alternative using the package binary:

| Field         | Value                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| **Command**   | `node`                                                                        |
| **Arguments** | `<repo>/node_modules/@danielx/civet-language-server/bin/civet-lsp.js --stdio` |

Or, if `node_modules/.bin` is on your PATH from a shell with the repo as cwd:

| Field                 | Value                    |
| --------------------- | ------------------------ |
| **Command**           | `pnpm`                   |
| **Arguments**         | `exec civet-lsp --stdio` |
| **Working directory** | `<repo>`                 |

## 3. Verify

1. Open `packages/grammars/src/civet/hello.civet`.
2. Confirm syntax highlighting, completion, and diagnostics from the Civet LSP.
3. Use **Go to Definition** on `add` from `packages/grammars/tests/civet.test.civet`.

## Tooling commands

| Command                            | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `pnpm check:civet`                 | Typecheck all `.civet` files in `packages/grammars`    |
| `vp test` (in `packages/grammars`) | Run Vitest including `.civet` tests                    |
| `vp pack` (in `packages/grammars`) | Build; Civet sources are transpiled by the Vite plugin |
