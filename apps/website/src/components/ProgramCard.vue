<template>
  <RouterLink :to="`/program/${program.slug}`" class="program-card">
    <div class="card-body">
      <h3 class="card-title">{{ program.name }}</h3>
      <p v-if="program.author" class="card-author">by {{ program.author }}</p>
      <p v-if="program.shortDescription" class="card-desc">
        {{ program.shortDescription }}
      </p>
    </div>
    <div class="card-meta">
      <Chip v-if="program.goal" variant="goal">{{ program.goal }}</Chip>
      <Chip v-if="program.frequency"
      >{{ program.frequency }}&times;/week</Chip
      >
      <Chip v-if="program.duration">{{ program.duration }} min</Chip>
      <Chip v-if="program.age">{{ humanize(program.age) }}</Chip>
    </div>
  </RouterLink>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { ProgramDoc } from "../programs.ts";
import Chip from "./Chip.vue";

defineProps<{ program: ProgramDoc }>();

function humanize(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/_/g, " ");
}
</script>

<style scoped>
.program-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text);
  box-shadow: var(--shadow);
  transition:
    transform 0.12s ease,
    border-color 0.12s ease;
}
.program-card:hover {
  text-decoration: none;
  transform: translateY(-2px);
  border-color: var(--accent);
}
.card-title {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}
.card-author {
  margin: 0 0 0.6rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}
.card-desc {
  margin: 0;
  font-size: 0.88rem;
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
</style>
