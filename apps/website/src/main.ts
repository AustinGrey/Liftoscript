import "./style.css";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
  type LanguageSupport,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { logicLanguage, workoutPlanLanguage } from "./languages.ts";

const SAMPLE_LOGIC = `// Progression logic preview
state.workingWeight = 100kg
if (day > 0) {
  w + 2.5kg
} else {
  w * 1.05
}`;

const SAMPLE_WORKOUT = `/// Bench-focused day
# Week 2 — strength block
## Day 1

Bench Press / reps: 3x5 80kg @8 180s
  // backoff sets
  Bench Press / 2x8 60kg

Squat / warmup: none
Squat / 3x5 100kg
`;

function mount(parent: HTMLElement, doc: string, support: LanguageSupport) {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        support,
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      ],
    }),
  });
}

mount(document.querySelector<HTMLElement>("#editor-logic")!, SAMPLE_LOGIC, logicLanguage());

mount(
  document.querySelector<HTMLElement>("#editor-workout-plan")!,
  SAMPLE_WORKOUT,
  workoutPlanLanguage(),
);
