<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import MarkdownIt from "markdown-it";
import PlanEditor from "../components/PlanEditor.vue";
import ProgressionTable from "../components/ProgressionTable.vue";
import SettingsPanel from "../components/SettingsPanel.vue";
import { getProgram } from "../programs.ts";
import { createDefaultState, toSimulationOptions } from "../playground.ts";
import { getProgramExercises, runSimulation } from "../simulation.ts";

const props = defineProps<{ slug: string }>();

const md = new MarkdownIt({ html: true, linkify: true, breaks: false });

const program = computed(() => getProgram(props.slug));
const plannerText = ref("");
const liveText = ref("");
const state = reactive(createDefaultState());
const showEditor = ref(true);

let debounce: ReturnType<typeof setTimeout> | undefined;
watch(plannerText, (value) => {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    liveText.value = value;
  }, 250);
});
onBeforeUnmount(() => clearTimeout(debounce));

function loadProgram() {
  const p = program.value;
  plannerText.value = p?.liftoscript ?? "";
  liveText.value = plannerText.value;
  state.oneRepMaxes = {};
}

watch(() => props.slug, loadProgram, { immediate: true });

function resetPlan() {
  plannerText.value = program.value?.liftoscript ?? "";
  liveText.value = plannerText.value;
}

const exerciseResult = computed(() =>
  program.value
    ? getProgramExercises(liveText.value, state.units)
    : { exercises: [] },
);

const simulation = computed(() =>
  program.value
    ? runSimulation(liveText.value, toSimulationOptions(state))
    : { sessions: [] },
);

const renderedAbout = computed(() => {
  const p = program.value;
  if (!p) return "";
  const cleaned = p.markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\{([^}]+)\}\]/g, '<span class="ex-ref">$1</span>');
  return md.render(cleaned);
});

function humanize(value?: string): string | undefined {
  return value?.replace(/_/g, " ");
}
</script>

<template>
  <div v-if="program" class="program-page">
    <div class="breadcrumbs">
      <RouterLink to="/">&larr; All programs</RouterLink>
    </div>

    <header class="program-header">
      <div>
        <h1>{{ program.name }}</h1>
        <p v-if="program.author" class="program-author">
          by {{ program.author }}
          <a
            v-if="program.url"
            :href="program.url"
            target="_blank"
            rel="noopener"
            class="source-link"
            >source &nearr;</a
          >
        </p>
      </div>
      <div class="program-chips">
        <span v-if="program.goal" class="chip chip-goal">{{ program.goal }}</span>
        <span v-if="program.frequency" class="chip"
          >{{ program.frequency }}&times;/week</span
        >
        <span v-if="program.duration" class="chip"
          >{{ program.duration }} min</span
        >
        <span v-if="program.age" class="chip">{{ humanize(program.age) }}</span>
      </div>
    </header>

    <div class="program-layout">
      <aside class="sidebar">
        <SettingsPanel :state="state" :exercises="exerciseResult.exercises" />
      </aside>

      <div class="workbench">
        <section class="panel editor-section">
          <div class="panel-head">
            <h2>Liftoscript plan</h2>
            <div class="panel-actions">
              <button type="button" class="ghost" @click="resetPlan">
                Reset
              </button>
              <button
                type="button"
                class="ghost"
                @click="showEditor = !showEditor"
              >
                {{ showEditor ? "Hide" : "Show" }}
              </button>
            </div>
          </div>
          <PlanEditor v-if="showEditor" v-model="plannerText" />
          <p
            v-if="exerciseResult.error || simulation.error"
            class="error-banner"
          >
            {{ exerciseResult.error || simulation.error }}
          </p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Simulated progression</h2>
            <span class="panel-sub"
              >{{ simulation.sessions.length }} sessions, all reps
              completed</span
            >
          </div>
          <ProgressionTable
            v-if="simulation.sessions.length"
            :sessions="simulation.sessions"
          />
          <p v-else class="empty-note">
            No sessions to simulate. Check the plan for errors above.
          </p>
        </section>
      </div>
    </div>

    <section class="about panel">
      <div class="panel-head"><h2>About this program</h2></div>
      <div class="markdown-body" v-html="renderedAbout"></div>
    </section>
  </div>

  <div v-else class="not-found">
    <h1>Program not found</h1>
    <RouterLink to="/">Back to all programs</RouterLink>
  </div>
</template>
