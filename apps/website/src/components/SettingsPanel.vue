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

<style scoped>
.settings-panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 1.35rem;
}
.settings-block h3 {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0 0 0.6rem;
}
.hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin: -0.3rem 0 0.7rem;
}

.segmented {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  overflow: hidden;
}
.segmented button {
  border: none;
  background: var(--panel);
  color: var(--text-muted);
  padding: 0.4rem 1.1rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.segmented button.active {
  background: var(--accent);
  color: #fff;
}

.sessions-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.sessions-control input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
}
.sessions-count {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 2ch;
  text-align: right;
}

.orm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.orm-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.orm-list label {
  font-size: 0.85rem;
  color: var(--text);
}
.orm-input {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.orm-input input {
  width: 5.5rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--panel-2);
  color: var(--text);
  font-size: 0.88rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.orm-input input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.orm-unit {
  font-size: 0.78rem;
  color: var(--text-faint);
  width: 1.5rem;
}

.empty-note {
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 1rem 1.1rem;
  margin: 0;
}
</style>
