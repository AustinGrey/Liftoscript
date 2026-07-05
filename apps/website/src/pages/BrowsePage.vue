<template>
  <div class="browse">
    <section class="hero">
      <h1>Explore training programs</h1>
      <p class="hero-lede">
        {{ programs.length }} real-world workout programs, written in
        Liftoscript. Open any one to edit its plan, dial in a lifter's settings,
        and simulate how the training progresses session by session.
      </p>
    </section>

    <div class="controls">
      <input
          v-model="search"
          class="search"
          type="search"
          placeholder="Search programs by name, author, or description..."
      />
      <div class="filter-row">
        <label class="filter">
          <span>Goal</span>
          <select v-model="filters.goal">
            <option value="">Any</option>
            <option v-for="g in goals" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <label class="filter">
          <span>Frequency</span>
          <select v-model="filters.frequency">
            <option value="">Any</option>
            <option v-for="f in frequencies" :key="f" :value="f">
              {{ f }}&times;/week
            </option>
          </select>
        </label>
        <label class="filter">
          <span>Experience</span>
          <select v-model="filters.age">
            <option value="">Any</option>
            <option v-for="a in ages" :key="a" :value="a">
              {{ humanize(a) }}
            </option>
          </select>
        </label>
        <label class="filter">
          <span>Duration</span>
          <select v-model="filters.duration">
            <option value="">Any</option>
            <option v-for="d in durations" :key="d" :value="d">
              {{ d }} min
            </option>
          </select>
        </label>
        <button type="button" class="reset" @click="resetFilters">Reset</button>
      </div>
    </div>

    <p class="result-count">
      {{ filtered.length }}
      {{ filtered.length === 1 ? "program" : "programs" }}
    </p>

    <div v-if="filtered.length" class="program-grid">
      <ProgramCard
          v-for="program in filtered"
          :key="program.slug"
          :program="program"
      />
    </div>
    <div v-else class="empty-state">
      <p>No programs match those filters.</p>
      <button type="button" class="reset" @click="resetFilters">
        Clear filters
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import ProgramCard from "../components/ProgramCard.vue";
import { facetValues, programs } from "../programs.ts";

const search = ref("");
const filters = reactive<Record<string, string>>({
  goal: "",
  frequency: "",
  age: "",
  duration: "",
});

const goals = facetValues("goal");
const frequencies = facetValues("frequency");
const ages = facetValues("age");
const durations = facetValues("duration");

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return programs.filter((p) => {
    if (filters.goal && p.goal !== filters.goal) return false;
    if (filters.frequency && String(p.frequency) !== filters.frequency)
      return false;
    if (filters.age && p.age !== filters.age) return false;
    if (filters.duration && p.duration !== filters.duration) return false;
    if (q) {
      const haystack = [p.name, p.author, p.shortDescription]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
});

function resetFilters() {
  search.value = "";
  filters.goal = "";
  filters.frequency = "";
  filters.age = "";
  filters.duration = "";
}
</script>

<style scoped>
.hero {
  margin-bottom: 1.75rem;
}
.hero h1 {
  font-size: 2rem;
  margin: 0 0 0.5rem;
}
.hero-lede {
  color: var(--text-muted);
  max-width: 68ch;
  margin: 0;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}
.search {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  background: var(--panel);
  color: var(--text);
  font-size: 0.95rem;
}
.search:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: end;
}
.filter {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.filter select {
  font-size: 0.9rem;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
}

.reset {
  border: 1px solid var(--border-strong);
  background: var(--panel);
  color: var(--text-muted);
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.reset:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.result-count {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0 0 1rem;
}

.program-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-muted);
}
</style>
