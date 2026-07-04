<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { ProgramDoc } from "../programs.ts";

defineProps<{ program: ProgramDoc }>();

function humanize(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/_/g, " ");
}
</script>

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
      <span v-if="program.goal" class="chip chip-goal">{{ program.goal }}</span>
      <span v-if="program.frequency" class="chip"
        >{{ program.frequency }}&times;/week</span
      >
      <span v-if="program.duration" class="chip">{{ program.duration }} min</span>
      <span v-if="program.age" class="chip">{{ humanize(program.age) }}</span>
    </div>
  </RouterLink>
</template>
