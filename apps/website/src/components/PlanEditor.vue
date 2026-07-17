<template>
	<div ref="host" class="plan-editor"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers,
} from "@codemirror/view";
import {
	playgroundEditorTheme,
	playgroundHighlightStyle,
	workoutPlanLanguage,
} from "../languages.ts";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

onMounted(() => {
	if (!host.value) return;
	view = new EditorView({
		parent: host.value,
		state: EditorState.create({
			doc: props.modelValue,
			extensions: [
				workoutPlanLanguage(),
				lineNumbers(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				drawSelection(),
				bracketMatching(),
				indentOnInput(),
				syntaxHighlighting(playgroundHighlightStyle, { fallback: true }),
				playgroundEditorTheme,
				history(),
				keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
				EditorView.lineWrapping,
				EditorView.updateListener.of(update => {
					if (update.docChanged) {
						emit("update:modelValue", update.state.doc.toString());
					}
				}),
			],
		}),
	});
});

watch(
	() => props.modelValue,
	value => {
		if (view && value !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value },
			});
		}
	},
);

onBeforeUnmount(() => {
	view?.destroy();
	view = null;
});
</script>

<style scoped>
.plan-editor :deep(.cm-editor) {
	background: var(--panel);
}
.plan-editor :deep(.cm-scroller) {
	font-family: var(--mono);
}
</style>
