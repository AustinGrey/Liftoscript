<script setup lang="ts">
withDefaults(defineProps<{ variant?: "default" | "goal" }>(), {
  variant: "default",
});
</script>

<template>
  <span class="chip" :class="`chip--${variant}`"><slot /></span>
</template>

<style scoped>
.chip {
  font-size: 0.72rem;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
}
.chip--goal {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
  font-weight: 600;
  text-transform: capitalize;
}
</style>
