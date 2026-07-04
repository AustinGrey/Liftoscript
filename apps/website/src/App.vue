<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <span><span class="brand-mark">Lifto</span><span class="brand-rest">script</span></span>
        <span class="brand-tag">Playground</span>
      </RouterLink>
      <nav class="topnav">
        <a
          href="https://www.liftosaur.com/docs/"
          target="_blank"
          rel="noopener"
          >Docs</a
        >
        <a
          href="https://github.com/liftosaur/liftosaur"
          target="_blank"
          rel="noopener"
          >GitHub</a
        >
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
    <footer class="app-footer">
      <p>
        A playground for the <code>grammars</code> package &mdash; browse real
        training programs, tweak lifter settings, and watch how each plan
        progresses week over week.
      </p>
    </footer>
  </div>
</template>

<style>
:root {
  --text: #1b1b1f;
  --text-muted: #5c5c66;
  --text-faint: #9a9aa5;
  --bg: #f5f4f1;
  --bg-elevated: #ffffff;
  --panel: #ffffff;
  --panel-2: #faf9f7;
  --border: #e2ded6;
  --border-strong: #d2cdc3;
  --accent: #c2410c;
  --accent-soft: #fbe9df;
  --shadow: 0 1px 2px rgba(20, 20, 30, 0.04), 0 6px 20px rgba(20, 20, 30, 0.05);

  --cm-comment: #8a8a95;
  --cm-heading: #b45309;
  --cm-exercise: #1b1b1f;
  --cm-keyword: #7c3aed;
  --cm-number: #0369a1;
  --cm-weight: #c2410c;
  --cm-unit: #0f766e;
  --cm-prop: #9333ea;
  --cm-func: #2563eb;
  --cm-var: #be185d;
  --cm-label: #b45309;
  --cm-string: #15803d;
  --cm-type: #0f766e;
  --cm-op: #6b7280;

  --mono: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas,
    monospace;
  --sans: system-ui, "Segoe UI", Roboto, sans-serif;

  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  color: var(--text);
  background: var(--bg);
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text: #e9e7e3;
    --text-muted: #a6a39d;
    --text-faint: #6f6c66;
    --bg: #121316;
    --bg-elevated: #1a1c20;
    --panel: #1a1c20;
    --panel-2: #202329;
    --border: #2c2f36;
    --border-strong: #3a3e46;
    --accent: #fb923c;
    --accent-soft: #35251a;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.28);

    --cm-comment: #6f6c66;
    --cm-heading: #fbbf24;
    --cm-exercise: #f3f1ed;
    --cm-keyword: #c4b5fd;
    --cm-number: #7dd3fc;
    --cm-weight: #fdba74;
    --cm-unit: #5eead4;
    --cm-prop: #d8b4fe;
    --cm-func: #93c5fd;
    --cm-var: #f9a8d4;
    --cm-label: #fbbf24;
    --cm-string: #86efac;
    --cm-type: #5eead4;
    --cm-op: #9ca3af;
    color-scheme: dark;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

a {
  color: var(--accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}

code {
  font-family: var(--mono);
  font-size: 0.88em;
  padding: 0.1em 0.35em;
  border-radius: 5px;
  background: color-mix(in srgb, var(--border) 45%, transparent);
}

h1,
h2,
h3,
h4 {
  letter-spacing: -0.01em;
}
</style>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}

.brand {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text);
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
}
.brand:hover {
  text-decoration: none;
}
.brand-mark {
  color: var(--accent);
}
.brand-tag {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.topnav {
  display: flex;
  gap: 1.25rem;
  font-size: 0.9rem;
}
.topnav a {
  color: var(--text-muted);
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

.app-footer {
  border-top: 1px solid var(--border);
  padding: 1.5rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
}
.app-footer p {
  max-width: 60ch;
  margin: 0 auto;
}
</style>
