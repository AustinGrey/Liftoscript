<script setup lang="ts">
import { computed } from "vue";
import type { SimEntry, SimSession, SimSet } from "../simulation.ts";

const props = defineProps<{ sessions: SimSession[] }>();

interface SetGroup {
  count: number;
  reps: string;
  weight?: string;
  rpe?: number;
  label?: string;
}

function repLabel(set: SimSet): string {
  const reps = set.reps ?? "";
  if (set.isAmrap) return `${reps}+`;
  if (set.minReps != null && set.minReps !== set.reps) {
    return `${set.minReps}-${reps}`;
  }
  return `${reps}`;
}

function groupSets(sets: SimSet[]): SetGroup[] {
  const groups: SetGroup[] = [];
  for (const set of sets) {
    const reps = repLabel(set);
    const last = groups.at(-1);
    if (
      last &&
      last.reps === reps &&
      last.weight === set.weight &&
      last.rpe === set.rpe &&
      last.label === set.label
    ) {
      last.count += 1;
    } else {
      groups.push({
        count: 1,
        reps,
        weight: set.weight,
        rpe: set.rpe,
        label: set.label,
      });
    }
  }
  return groups;
}

function formatGroup(group: SetGroup): string {
  const scheme = group.count > 1 ? `${group.count}\u00d7${group.reps}` : group.reps;
  let out = scheme;
  if (group.weight) out += ` @ ${group.weight}`;
  if (group.rpe != null) out += ` @${group.rpe}`;
  return out;
}

function entrySchemes(entry: SimEntry): { text: string; label?: string }[] {
  return groupSets(entry.sets).map((g) => ({
    text: formatGroup(g),
    label: g.label,
  }));
}

const grouped = computed(() => {
  const byWeek = new Map<number, SimSession[]>();
  for (const session of props.sessions) {
    const week = session.week ?? 1;
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(session);
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, sessions]) => ({ week, sessions }));
});

const multiweek = computed(() => grouped.value.length > 1);
</script>

<template>
  <div class="progression">
    <div v-for="block in grouped" :key="block.week" class="week-block">
      <h4 v-if="multiweek" class="week-title">Week {{ block.week }}</h4>
      <div class="session-grid">
        <article
          v-for="session in block.sessions"
          :key="session.ordinal"
          class="session-card"
        >
          <header class="session-head">
            <span class="session-ordinal">#{{ session.ordinal }}</span>
            <span class="session-name">{{ session.dayName }}</span>
          </header>
          <ul class="exercise-list">
            <li
              v-for="(entry, i) in session.entries"
              :key="`${entry.exerciseKey}-${i}`"
              class="exercise-row"
            >
              <span class="exercise-name">{{ entry.exerciseName }}</span>
              <span class="exercise-sets">
                <span
                  v-for="(scheme, j) in entrySchemes(entry)"
                  :key="j"
                  class="set-scheme"
                  :title="scheme.label"
                >
                  {{ scheme.text }}
                </span>
              </span>
            </li>
            <li v-if="session.entries.length === 0" class="exercise-row muted">
              Rest / no exercises
            </li>
          </ul>
        </article>
      </div>
    </div>
  </div>
</template>
