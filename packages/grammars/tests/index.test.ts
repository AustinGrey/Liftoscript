import { expect, test, describe } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator";
import { run } from "@/logic/evaluators";
import * as Weight from "@/models/weight.ts";

import { percentORM } from "@/models/weight.ts";
import type {
  IProgramState,
  IScriptBindings,
} from "@/logic/evaluators/types.ts";
import type { LogicResult } from "@/logic/types.ts";

function evalLogic(
  logic: string,
  initialState: IProgramState,
  globalData: IScriptBindings,
) {
  return new LiftoscriptEvaluator(
    logic,
    initialState,
    {},
    globalData,
    {},
    {},
    "kg",
    "planner",
  ).evaluate(parser.parse(logic).topNode);
}

function emptyGlobalData(): IScriptBindings {
  return {
    day: 0,
    week: 0,
    dayInWeek: 0,
    completedWeights: [],
    originalWeights: [],
    weights: [],
    reps: [],
    minReps: [],
    RPE: [],
    amraps: [],
    logrpes: [],
    askweights: [],
    completedReps: [],
    completedRepsLeft: [],
    completedRPE: [],
    isCompleted: [],
    timers: [],
    w: [],
    r: [0, 1, 2, 3, 4, 5],
    cr: [],
    cw: [],
    mr: [],
    programNumberOfSets: 0,
    numberOfSets: 0,
    completedNumberOfSets: 0,
    ns: 0,
    setVariationIndex: 1,
    descriptionIndex: 1,
    bodyweight: Weight.build(0, "kg"),
    setIndex: 1,
    rm1: Weight.build(0, "kg"),
  };
}

describe.each<{
  s: string;
  e: LogicResult;
  options?: Partial<{
    initialState: IProgramState;
    adjustEmptyGlobals: Partial<IScriptBindings>;
  }>;
}>([
  // Literal Number
  { s: `1`, e: 1 },
  { s: `0`, e: 0 },
  { s: `-1`, e: -1 },
  // Percentages of one rep max
  { s: "0%", e: percentORM(0) },
  { s: "50%", e: percentORM(50) },
  { s: "100%", e: percentORM(100) },
  { s: "101%", e: percentORM(101) },
  /* Bad Cases
    ["NaN%", percentORM(0)],
    ["-50%", percentORM(-50)],
    ["-101%", percentORM(-101)],
     */
  // Comparisons
  { s: `1 > 0`, e: true },
  { s: `1 < 0`, e: false },
  { s: `1 >= 0`, e: true },
  { s: `1 <= 0`, e: false },
  { s: `1 == 0`, e: false },
  { s: `1 != 0`, e: true },
  { s: `1kg > 0`, e: true },
  { s: `1kg < 0`, e: false },
  { s: `1kg >= 0`, e: true },
  { s: `1kg <= 0`, e: false },
  { s: `1kg == 0`, e: false },
  { s: `1kg != 0`, e: true },
  { s: `1lb > 0`, e: true },
  { s: `1lb < 0`, e: false },
  { s: `1lb >= 0`, e: true },
  { s: `1lb <= 0`, e: false },
  { s: `1lb == 0`, e: false },
  { s: `1lb != 0`, e: true },
  { s: `1 > 0kg`, e: true },
  { s: `1 < 0kg`, e: false },
  { s: `1 >= 0kg`, e: true },
  { s: `1 <= 0kg`, e: false },
  { s: `1 == 0kg`, e: false },
  { s: `1 != 0kg`, e: true },
  { s: `1 > 0lb`, e: true },
  { s: `1 < 0lb`, e: false },
  { s: `1 >= 0lb`, e: true },
  { s: `1 <= 0lb`, e: false },
  { s: `1 == 0lb`, e: false },
  { s: `1 != 0lb`, e: true },
  { s: `1kg > 1lb`, e: true },
  { s: `1kg < 1lb`, e: false },
  { s: `1kg >= 1lb`, e: true },
  { s: `1kg <= 1lb`, e: false },
  { s: `1kg == 1lb`, e: false },
  { s: `1kg != 1lb`, e: true },
  { s: `1lb > 1kg`, e: false },
  { s: `1lb < 1kg`, e: true },
  { s: `1lb >= 1kg`, e: false },
  { s: `1lb <= 1kg`, e: true },
  { s: `1lb == 1kg`, e: false },
  { s: `1lb != 1kg`, e: true },
  // Ternary
  { s: `4 < 5 ? 1 : 0`, e: 1 },
  { s: `5 < 4 ? 1 : 0`, e: 0 },
  {
    s: `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    e: 5,
    options: { initialState: { foo: 8 } },
  },
  {
    s: `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    e: 4,
    options: { initialState: { foo: 4 } },
  },
  {
    s: `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    e: 6,
    options: { initialState: { foo: 2 } },
  },
  // Index access
  {
    s: `r[state.foo]`,
    e: 1,
    options: { initialState: { foo: 2 }, adjustEmptyGlobals: { r: [0, 1] } },
  },
  // If
  {
    s: `if (completedReps >= reps) {
        state.foo = state.foo + 3
      }`,
    e: 5,
    options: {
      initialState: { foo: 2 },
      adjustEmptyGlobals: { completedReps: [1, 2, 3], reps: [1, 2, 3] },
    },
  },
])("$s resolves to $e with options $options", ({ s, e, options }) => {
  const initialState = options?.initialState ?? ({} as IProgramState);
  test.each<
    [
      string,
      (
        logic: string,
        initialState: IProgramState,
        globalData: IScriptBindings,
      ) => LogicResult,
    ]
  >([
    ["old system", evalLogic],
    ["new system", run],
  ])("$0", (_, evaluator) => {
    expect(
      evaluator(s, initialState, {
        ...emptyGlobalData(),
        ...options?.adjustEmptyGlobals,
      }),
    ).toEqual(e);
  });
});
