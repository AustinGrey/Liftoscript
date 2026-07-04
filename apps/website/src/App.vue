<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <span class="brand-mark">Lifto</span><span class="brand-rest">script</span>
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
