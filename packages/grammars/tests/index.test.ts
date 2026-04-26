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

function makeDefaultGlobalData(): IScriptBindings {
  return {
    day: 1,
    week: 1,
    dayInWeek: 1,
    originalWeights: [
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
    ],
    weights: [
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
    ],
    completedWeights: [
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
    ],
    isCompleted: [1, 1, 1],
    reps: [1, 2, 3],
    minReps: [1, 2, 3],
    RPE: [0, 0, 0],
    amraps: [0, 0, 0],
    logrpes: [0, 0, 0],
    askweights: [0, 0, 0],
    timers: [0, 0, 0],
    completedReps: [1, 2, 3],
    completedRepsLeft: [0, 0, 0],
    completedRPE: [0, 0, 0],
    w: [
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
    ],
    cw: [
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
      { value: 40, unit: "lb" },
    ],
    r: [1, 2, 3],
    cr: [1, 2, 3],
    mr: [1, 2, 3],
    ns: 3,
    programNumberOfSets: 3,
    numberOfSets: 3,
    completedNumberOfSets: 3,
    setIndex: 1,
    setVariationIndex: 1,
    bodyweight: Weight.build(0, "lb"),
    descriptionIndex: 1,
    rm1: Weight.build(100, "lb"),
  };
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
  script: string;
  cases: Array<{
    result: LogicResult;
    initialState?: () => IProgramState;
    finalState?: IProgramState;
    adjustEmptyGlobals?: Partial<IScriptBindings>;
  }>;
}>([
  // Literal Number
  { script: `1`, cases: [{ result: 1 }] },
  { script: `0`, cases: [{ result: 0 }] },
  { script: `-1`, cases: [{ result: -1 }] },
  // Percentages of one rep max
  { script: "0%", cases: [{ result: percentORM(0) }] },
  { script: "50%", cases: [{ result: percentORM(50) }] },
  { script: "100%", cases: [{ result: percentORM(100) }] },
  { script: "101%", cases: [{ result: percentORM(101) }] },
  /* Bad Cases
    ["NaN%", percentORM(0)],
    ["-50%", percentORM(-50)],
    ["-101%", percentORM(-101)],
     */
  // Comparisons
  { script: `1 > 0`, cases: [{ result: true }] },
  { script: `1 < 0`, cases: [{ result: false }] },
  { script: `1 >= 0`, cases: [{ result: true }] },
  { script: `1 <= 0`, cases: [{ result: false }] },
  { script: `1 == 0`, cases: [{ result: false }] },
  { script: `1 != 0`, cases: [{ result: true }] },
  { script: `1kg > 0`, cases: [{ result: true }] },
  { script: `1kg < 0`, cases: [{ result: false }] },
  { script: `1kg >= 0`, cases: [{ result: true }] },
  { script: `1kg <= 0`, cases: [{ result: false }] },
  { script: `1kg == 0`, cases: [{ result: false }] },
  { script: `1kg != 0`, cases: [{ result: true }] },
  { script: `1lb > 0`, cases: [{ result: true }] },
  { script: `1lb < 0`, cases: [{ result: false }] },
  { script: `1lb >= 0`, cases: [{ result: true }] },
  { script: `1lb <= 0`, cases: [{ result: false }] },
  { script: `1lb == 0`, cases: [{ result: false }] },
  { script: `1lb != 0`, cases: [{ result: true }] },
  { script: `1 > 0kg`, cases: [{ result: true }] },
  { script: `1 < 0kg`, cases: [{ result: false }] },
  { script: `1 >= 0kg`, cases: [{ result: true }] },
  { script: `1 <= 0kg`, cases: [{ result: false }] },
  { script: `1 == 0kg`, cases: [{ result: false }] },
  { script: `1 != 0kg`, cases: [{ result: true }] },
  { script: `1 > 0lb`, cases: [{ result: true }] },
  { script: `1 < 0lb`, cases: [{ result: false }] },
  { script: `1 >= 0lb`, cases: [{ result: true }] },
  { script: `1 <= 0lb`, cases: [{ result: false }] },
  { script: `1 == 0lb`, cases: [{ result: false }] },
  { script: `1 != 0lb`, cases: [{ result: true }] },
  { script: `1kg > 1lb`, cases: [{ result: true }] },
  { script: `1kg < 1lb`, cases: [{ result: false }] },
  { script: `1kg >= 1lb`, cases: [{ result: true }] },
  { script: `1kg <= 1lb`, cases: [{ result: false }] },
  { script: `1kg == 1lb`, cases: [{ result: false }] },
  { script: `1kg != 1lb`, cases: [{ result: true }] },
  { script: `1lb > 1kg`, cases: [{ result: false }] },
  { script: `1lb < 1kg`, cases: [{ result: true }] },
  { script: `1lb >= 1kg`, cases: [{ result: false }] },
  { script: `1lb <= 1kg`, cases: [{ result: true }] },
  { script: `1lb == 1kg`, cases: [{ result: false }] },
  { script: `1lb != 1kg`, cases: [{ result: true }] },
  // Ternary
  {
    script: `4 < 5 ? 1 : 0`,
    cases: [{ result: 1 }],
  },
  { script: `5 < 4 ? 1 : 0`, cases: [{ result: 0 }] },
  {
    script: `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    cases: [
      { result: 5, initialState: () => ({ foo: 8 }) },
      { result: 4, initialState: () => ({ foo: 4 }) },
      { result: 6, initialState: () => ({ foo: 2 }) },
    ],
  },
  // Index access
  {
    script: `r[state.foo]`,
    cases: [
      {
        result: 1,
        initialState: () => ({ foo: 2 }),
        adjustEmptyGlobals: { r: [0, 1] },
      },
    ],
  },
  // If
  {
    script: `if (completedReps >= reps) {
        state.foo = state.foo + 3
      }`,
    cases: [
      {
        result: 5,
        initialState: () => ({ foo: 2 }),
        adjustEmptyGlobals: { completedReps: [1, 2, 3], reps: [1, 2, 3] },
      },
    ],
  },
  // Standard progression and deload
  {
    script: `
// Simple Exercise Progression script '5lb,2'
if (completedReps >= reps) {
  state.successes = state.successes + 1
  if (state.successes >= 2) {
    state.weight = state.weight + 5lb
    state.successes = 0
    state.failures = 0
  }
}
// End Simple Exercise Progression script
// Simple Exercise Deload script '5lb,1'
if (!(completedReps >= reps)) {
  state.failures = state.failures + 1
  if (state.failures >= 1) {
    state.weight = state.weight - 5lb
    state.successes = 0
    state.failures = 0
  }
}
// End Simple Exercise Deload script`,
    cases: [
      {
        result: NaN,
        initialState: () => ({
          successes: 0,
          failures: 0,
          weight: Weight.build(150, "lb"),
        }),
      },
    ],
  },
  // // Basic beginner
  // {
  //   s: `
  //   if (cr[1] + cr[2] + cr[3] >= 15) {
  //     state.weight = w[3] +
  //       (cr[3] > 10 ? 5lb : 2.5lb)
  //   } else {
  //     state.weight = state.weight * 0.9
  //   }
  //   `,
  //   e: NaN,
  // },
  // // GZCLP
  // {
  //   s: `
  //   if (cr >= r) {
  //     state.weight = w[5] + 10lb
  //   } else if (state.stage < 3) {
  //     state.stage = state.stage + 1
  //   } else {
  //     state.stage = 1
  //     state.weight = state.weight * 0.85
  //   }
  //   `,
  //   e: NaN,
  // },
  // // condition with numbers
  // {
  //   s: `
  //   if (cr[3] >= 25) {
  //     state.weight = state.weight + 5lb
  //   }
  //   `,
  //   e: NaN,
  // },
])("$s", ({ script, cases }) => {
  describe.each(cases)(
    "Result is $e when initial state like $initialState",
    ({ result, initialState, adjustEmptyGlobals, finalState }) => {
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
          evaluator(script, initialState?.() ?? {}, {
            ...emptyGlobalData(),
            ...adjustEmptyGlobals,
          }),
          "Script should evaluate to the expected result",
        ).toEqual(result);
        if(finalState){
          expect(,"State after evaluation completes should match").toEqual(finalState)
        }
      });
    },
  );
});
