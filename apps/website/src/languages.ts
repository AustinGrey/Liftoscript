import { LRLanguage, LanguageSupport } from "@codemirror/language";
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
