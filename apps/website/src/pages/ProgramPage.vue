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
				<Chip v-if="program.goal" variant="goal">{{ program.goal }}</Chip>
				<Chip v-if="program.frequency">{{ program.frequency }}&times;/week</Chip>
				<Chip v-if="program.duration">{{ program.duration }} min</Chip>
				<Chip v-if="program.age">{{ humanize(program.age) }}</Chip>
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
							<button type="button" class="ghost" @click="resetPlan">Reset</button>
							<button type="button" class="ghost" @click="showEditor = !showEditor">
								{{ showEditor ? "Hide" : "Show" }}
							</button>
						</div>
					</div>
					<PlanEditor v-if="showEditor" v-model="plannerText" />
					<p v-if="exerciseResult.error || simulation.error" class="error-banner">
						{{ exerciseResult.error || simulation.error }}
					</p>
				</section>

				<section class="panel">
					<div class="panel-head">
						<h2>Simulated progression</h2>
						<span class="panel-sub"
							>{{ simulation.sessions.length }} sessions, all reps completed</span
						>
					</div>
					<ProgressionTable v-if="simulation.sessions.length" :sessions="simulation.sessions" />
					<p v-else class="empty-note">No sessions to simulate. Check the plan for errors above.</p>
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

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import MarkdownIt from "markdown-it";
import Chip from "../components/Chip.vue";
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
	program.value ? getProgramExercises(liveText.value, state.units) : { exercises: [] },
);

const simulation = computed(() =>
	program.value ? runSimulation(liveText.value, toSimulationOptions(state)) : { sessions: [] },
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

<style scoped>
.breadcrumbs {
	margin-bottom: 1rem;
	font-size: 0.9rem;
}

.program-header {
	display: flex;
	flex-wrap: wrap;
	gap: 1rem;
	justify-content: space-between;
	align-items: flex-start;
	margin-bottom: 1.5rem;
}
.program-header h1 {
	font-size: 1.7rem;
	margin: 0 0 0.35rem;
}
.program-author {
	margin: 0;
	color: var(--text-muted);
	font-size: 0.92rem;
}
.source-link {
	margin-left: 0.5rem;
	font-size: 0.82rem;
}
.program-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.program-layout {
	display: grid;
	gap: 1.25rem;
	grid-template-columns: 1fr;
	align-items: start;
}
@media (min-width: 900px) {
	.program-layout {
		grid-template-columns: 280px minmax(0, 1fr);
	}
	.sidebar {
		position: sticky;
		top: 4.5rem;
	}
}

.panel {
	background: var(--panel);
	border: 1px solid var(--border);
	border-radius: 14px;
	box-shadow: var(--shadow);
	overflow: hidden;
}
.panel-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	padding: 0.85rem 1.1rem;
	border-bottom: 1px solid var(--border);
	background: var(--panel-2);
}
.panel-head h2 {
	font-size: 0.95rem;
	margin: 0;
}
.panel-sub {
	font-size: 0.78rem;
	color: var(--text-muted);
}
.panel-actions {
	display: flex;
	gap: 0.4rem;
}
.ghost {
	border: 1px solid var(--border-strong);
	background: transparent;
	color: var(--text-muted);
	border-radius: 7px;
	padding: 0.3rem 0.7rem;
	font-size: 0.8rem;
	cursor: pointer;
}
.ghost:hover {
	border-color: var(--accent);
	color: var(--accent);
}

.workbench {
	display: flex;
	flex-direction: column;
	gap: 1.25rem;
	min-width: 0;
}

.editor-section :deep(.plan-editor) {
	max-height: 460px;
	overflow: auto;
}

.error-banner {
	margin: 0;
	padding: 0.7rem 1.1rem;
	background: color-mix(in srgb, #dc2626 15%, transparent);
	color: #b91c1c;
	font-size: 0.85rem;
	font-family: var(--mono);
	border-top: 1px solid color-mix(in srgb, #dc2626 30%, transparent);
}
@media (prefers-color-scheme: dark) {
	.error-banner {
		color: #fca5a5;
	}
}

.empty-note {
	color: var(--text-muted);
	font-size: 0.85rem;
	padding: 1rem 1.1rem;
	margin: 0;
}

.about {
	margin-top: 1.5rem;
}
.markdown-body {
	padding: 1.25rem 1.4rem;
	max-width: 78ch;
}
.markdown-body :deep(h2) {
	font-size: 1.25rem;
	margin: 1.75rem 0 0.6rem;
}
.markdown-body :deep(h3) {
	font-size: 1.05rem;
	margin: 1.4rem 0 0.5rem;
}
.markdown-body :deep(p) {
	margin: 0 0 0.9rem;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
	margin: 0 0 0.9rem;
	padding-left: 1.4rem;
}
.markdown-body :deep(li) {
	margin-bottom: 0.3rem;
}
.markdown-body :deep(table) {
	border-collapse: collapse;
	margin: 0 0 1rem;
	font-size: 0.9rem;
	width: 100%;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
	border: 1px solid var(--border);
	padding: 0.4rem 0.6rem;
	text-align: left;
}
.markdown-body :deep(th) {
	background: var(--panel-2);
}
.markdown-body :deep(.ex-ref) {
	font-weight: 600;
	color: var(--accent);
}

.not-found {
	text-align: center;
	padding: 4rem 1rem;
}
</style>
