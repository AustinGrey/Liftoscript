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
