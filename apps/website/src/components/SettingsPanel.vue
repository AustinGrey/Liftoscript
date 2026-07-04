<script setup lang="ts">
import type { IUnit } from "grammars";
import type { PlaygroundState } from "../playground.ts";
import type { ProgramExerciseInfo } from "../simulation.ts";

const props = defineProps<{
  state: PlaygroundState;
  exercises: ProgramExerciseInfo[];
}>();

function setUnits(units: IUnit) {
  if (props.state.units === units) return;
  props.state.units = units;
  // ORM overrides were entered in the previous unit; clear them so the
  // placeholders (library defaults in the new unit) take over.
  props.state.oneRepMaxes = {};
}

function placeholderFor(key: string): string {
  const exercise = props.exercises.find((e) => e.key === key);
  if (!exercise) return "";
  return String(Math.round(exercise.defaultOrm.value));
}

function onOrmInput(key: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  const next = { ...props.state.oneRepMaxes };
  if (raw === "") {
    next[key] = undefined;
  } else {
    next[key] = Number(raw);
  }
  props.state.oneRepMaxes = next;
}
</script>

<template>
  <div class="settings-panel">
    <section class="settings-block">
      <h3>Units</h3>
      <div class="segmented" role="group" aria-label="Units">
        <button
          type="button"
          :class="{ active: state.units === 'lb' }"
          @click="setUnits('lb')"
        >
          lb
        </button>
        <button
          type="button"
          :class="{ active: state.units === 'kg' }"
          @click="setUnits('kg')"
        >
          kg
        </button>
      </div>
    </section>

    <section class="settings-block">
      <h3>Sessions to simulate</h3>
      <div class="sessions-control">
        <input
          type="range"
          min="1"
          max="60"
          v-model.number="state.numberOfSessions"
        />
        <span class="sessions-count">{{ state.numberOfSessions }}</span>
      </div>
    </section>

    <section class="settings-block">
      <h3>Starting 1RM</h3>
      <p class="hint">
        The training max each lift is based on. Leave blank to use the library's
        default starting weight.
      </p>
      <div v-if="exercises.length === 0" class="empty-note">
        No exercises detected yet.
      </div>
      <ul v-else class="orm-list">
        <li v-for="exercise in exercises" :key="exercise.key">
          <label :for="`orm-${exercise.key}`">{{ exercise.name }}</label>
          <div class="orm-input">
            <input
              :id="`orm-${exercise.key}`"
              type="number"
              inputmode="decimal"
              min="0"
              step="5"
              :placeholder="placeholderFor(exercise.key)"
              :value="state.oneRepMaxes[exercise.key] ?? ''"
              @input="onOrmInput(exercise.key, $event)"
            />
            <span class="orm-unit">{{ state.units }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
