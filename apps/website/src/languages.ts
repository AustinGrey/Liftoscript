import { HighlightStyle, LRLanguage, LanguageSupport } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { styleTags, tags as t } from "@lezer/highlight";
import { logicParser, workoutPlanParser } from "grammars";

const logicHighlight = styleTags({
	LineComment: t.lineComment,
	Keyword: t.keyword,
	IfExpression: t.keyword,
	ForExpression: t.keyword,
	StateKeyword: t.keyword,
	Number: t.number,
	NumberExpression: t.number,
	Plus: t.arithmeticOperator,
	Times: t.arithmeticOperator,
	Cmp: t.compareOperator,
	AndOr: t.logicOperator,
	Not: t.logicOperator,
	UnaryExpression: t.operator,
	Variable: t.variableName,
	VariableExpression: t.variableName,
	StateVariable: t.variableName,
	VariableIndex: t.variableName,
	StateVariableIndex: t.variableName,
	Unit: t.unit,
	Percentage: t.unit,
	WeightExpression: t.literal,
	BuiltinFunctionExpression: t.function(t.variableName),
	Wildcard: t.operator,
	IncAssignment: t.operator,
	Ternary: t.controlOperator,
	ParenthesisExpression: t.paren,
	BlockExpression: t.brace,
	AssignmentExpression: t.definition(t.variableName),
	IncAssignmentExpression: t.definition(t.variableName),
	ForInExpression: t.keyword,
});

const workoutPlanHighlight = styleTags({
	LineComment: t.lineComment,
	TripleLineComment: t.docComment,
	Week: t.heading,
	Day: t.heading1,
	ExerciseName: t.name,
	Keyword: t.keyword,
	FunctionName: t.function(t.variableName),
	FunctionExpression: t.function(t.variableName),
	FunctionArgument: t.variableName,
	Number: t.number,
	Int: t.integer,
	Float: t.float,
	PosNumber: t.number,
	Rep: t.number,
	RepRange: t.number,
	Repeat: t.labelName,
	Plus: t.arithmeticOperator,
	Weight: t.literal,
	Percentage: t.unit,
	Rpe: t.float,
	Timer: t.number,
	SetPart: t.operator,
	KeyValue: t.propertyName,
	SetLabel: t.string,
	Liftoscript: t.string,
	ReuseLiftoscript: t.string,
	ReuseSection: t.meta,
	SupersetKeyword: t.keyword,
	None: t.keyword,
	WeekDay: t.labelName,
	Current: t.operator,
	AskWeight: t.operator,
	SectionSeparator: t.operator,
	ExercisePropertyName: t.propertyName,
	ExerciseProperty: t.typeName,
	ExerciseSection: t.typeName,
	Superset: t.className,
	EmptyExpression: t.lineComment,
});

export function logicLanguage(): LanguageSupport {
	return new LanguageSupport(
		LRLanguage.define({
			parser: logicParser.configure({ props: [logicHighlight] }),
			languageData: { commentTokens: { line: "//" } },
		}),
	);
}

export function workoutPlanLanguage(): LanguageSupport {
	return new LanguageSupport(
		LRLanguage.define({
			parser: workoutPlanParser.configure({ props: [workoutPlanHighlight] }),
			languageData: { commentTokens: { line: "//" } },
		}),
	);
}

/**
 * A syntax highlight style driven by CSS variables (the --cm-* tokens defined
 * globally in App.vue) so it adapts to light and dark themes.
 */
export const playgroundHighlightStyle = HighlightStyle.define([
	{ tag: t.lineComment, color: "var(--cm-comment)", fontStyle: "italic" },
	{ tag: t.docComment, color: "var(--cm-comment)", fontStyle: "italic" },
	{ tag: t.meta, color: "var(--cm-comment)" },
	{ tag: t.heading, color: "var(--cm-heading)", fontWeight: "700" },
	{ tag: t.heading1, color: "var(--cm-heading)", fontWeight: "700" },
	{ tag: t.name, color: "var(--cm-exercise)", fontWeight: "600" },
	{ tag: t.keyword, color: "var(--cm-keyword)" },
	{ tag: t.number, color: "var(--cm-number)" },
	{ tag: t.integer, color: "var(--cm-number)" },
	{ tag: t.float, color: "var(--cm-number)" },
	{ tag: t.literal, color: "var(--cm-weight)", fontWeight: "600" },
	{ tag: t.unit, color: "var(--cm-unit)" },
	{ tag: t.propertyName, color: "var(--cm-prop)" },
	{ tag: t.function(t.variableName), color: "var(--cm-func)" },
	{ tag: t.variableName, color: "var(--cm-var)" },
	{ tag: t.labelName, color: "var(--cm-label)", fontWeight: "600" },
	{ tag: t.string, color: "var(--cm-string)" },
	{ tag: t.typeName, color: "var(--cm-type)" },
	{ tag: t.arithmeticOperator, color: "var(--cm-op)" },
	{ tag: t.compareOperator, color: "var(--cm-op)" },
	{ tag: t.logicOperator, color: "var(--cm-op)" },
]);

/** A minimal, transparent editor theme that inherits page colors. */
export const playgroundEditorTheme = EditorView.theme({
	"&": {
		backgroundColor: "transparent",
		color: "var(--text)",
		fontSize: "13px",
	},
	".cm-content": {
		fontFamily: "var(--mono)",
		caretColor: "var(--text)",
	},
	".cm-gutters": {
		backgroundColor: "transparent",
		color: "var(--text-faint)",
		border: "none",
	},
	".cm-activeLine": {
		backgroundColor: "color-mix(in srgb, var(--border) 22%, transparent)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "transparent",
		color: "var(--text-muted)",
	},
	"&.cm-focused": { outline: "none" },
	".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
		backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
	},
});
