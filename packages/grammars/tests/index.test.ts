import { expect, test, describe } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator";
import { run } from "@/logic/evaluators";
import * as Weight from "@/models/weight.ts";
import type { RequireAtLeastOne } from "type-fest";

import { percentORM } from "@/models/weight.ts";
import type {
  IProgramState,
  IScriptBindings,
} from "@/logic/evaluators/types.ts";
import type { LogicResult } from "@/logic/types.ts";

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
  cases: Array<
    RequireAtLeastOne<
      {
        description?: string;
        // The expected return value of running the script
        result?: LogicResult;
        initialState?: () => IProgramState;
        // The expected final state once the script finished executing
        finalState?: IProgramState;
        adjustEmptyGlobals?: Partial<IScriptBindings>;
      },
      "result" | "finalState"
    >
  >;
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
        initialState: () => ({
          successes: 0,
          failures: 0,
          weight: Weight.build(150, "lb"),
        }),
        result: 0,
        adjustEmptyGlobals: { reps: [3, 3, 3], completedReps: [3, 3, 3] },
        finalState: {
          successes: 1,
          failures: 0,
          weight: Weight.build(150, "lb"),
        },
      },
      {
        initialState: () => ({
          successes: 2,
          failures: 0,
          weight: Weight.build(150, "lb"),
        }),
        result: 0,
        adjustEmptyGlobals: { reps: [3, 3, 3], completedReps: [3, 3, 3] },
        finalState: {
          successes: 0,
          failures: 0,
          weight: Weight.build(155, "lb"),
        },
      },
      {
        initialState: () => ({
          successes: 1,
          failures: 2,
          weight: Weight.build(150, "lb"),
        }),
        result: 0,
        adjustEmptyGlobals: { reps: [3, 3, 3], completedReps: [3, 3, 2] },
        finalState: {
          successes: 0,
          failures: 0,
          weight: Weight.build(145, "lb"),
        },
      },
    ],
  },
  // Basic beginner
  {
    script: `
    if (cr[1] + cr[2] + cr[3] >= 15) {
      state.weight = w[3] +
        (cr[3] > 10 ? 5lb : 2.5lb)
    } else {
      state.weight = state.weight * 0.9
    }
    `,
    cases: [
      {
        description: "sum of crs == 15",
        initialState: () => ({ weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          reps: [5, 5, 5],
          cr: [5, 5, 5],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { weight: Weight.build(152.5, "lb") },
      },
      {
        description: "sum of crs > 15",
        initialState: () => ({ weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          reps: [5, 5, 5],
          cr: [5, 5, 11],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { weight: Weight.build(155, "lb") },
      },
      {
        description: "sum of crs < 15",
        initialState: () => ({ weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          reps: [5, 5, 5],
          cr: [5, 5, 3],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { weight: Weight.build(135, "lb") },
      },
    ],
  },
  // GZCLP
  {
    script: `
    if (cr >= r) {
      state.weight = w[5] + 10lb
    } else if (state.stage < 3) {
      state.stage = state.stage + 1
    } else {
      state.stage = 1
      state.weight = state.weight * 0.85
    }
    `,
    cases: [
      {
        initialState: () => ({ stage: 1, weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          r: [5, 5, 5, 5, 5],
          cr: [5, 5, 5, 5, 5],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { stage: 1, weight: Weight.build(160, "lb") },
      },
      {
        initialState: () => ({ stage: 1, weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          r: [5, 5, 5, 5, 5],
          cr: [5, 5, 5, 5, 4],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { stage: 2, weight: Weight.build(150, "lb") },
      },
      {
        initialState: () => ({ stage: 3, weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          r: [5, 5, 5, 5, 5],
          cr: [5, 5, 5, 5, 4],
          w: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: { stage: 1, weight: Weight.build(127.5, "lb") },
      },
    ],
  },
  // condition with numbers
  {
    script: `
    if (cr[3] >= 25) {
      state.weight = state.weight + 5lb
    }
    `,
    cases: [
      {
        initialState: () => ({ weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          cr: [5, 5, 30],
        },
        finalState: { weight: Weight.build(155, "lb") },
      },
      {
        initialState: () => ({ weight: Weight.build(150, "lb") }),
        adjustEmptyGlobals: {
          cr: [5, 5, 5, 5, 5],
        },
        finalState: { weight: Weight.build(150, "lb") },
      },
    ],
  },
  // SBS
  {
    script: `
    if (state.week != 7 && state.week != 14 && state.week != 21) {
      if (completedReps[4] > reps[4] + 4) {
        state.tm = state.tm * 1.03
      } else if (completedReps[4] < reps[4] - 1) {
        state.tm = state.tm * 0.95
      } else if (completedReps[4] < reps[4]) {
        state.tm = state.tm * 0.98
      } else if (completedReps[4] > reps[4]) {
        state.tm = state.tm * (1.0 + ((completedReps[4] - reps[4]) * 0.005))
      }
    }
    
    state.week = state.week + 1
    if (state.week > 21) {
      state.week = 1
    }
    
    if (state.week == 2) { state.intensity = 72.5 }
    if (state.week == 3) { state.intensity = 75 }
    if (state.week == 4) { state.intensity = 72.5 }
    if (state.week == 5) { state.intensity = 75 }
    if (state.week == 6) { state.intensity = 77.5 }
    if (state.week == 7) { state.intensity = 60 }
    if (state.week == 8) { state.intensity = 72.5 }
    if (state.week == 9) { state.intensity = 75 }
    if (state.week == 10) { state.intensity = 77.5 }
    if (state.week == 11) { state.intensity = 75 }
    if (state.week == 12) { state.intensity = 77.5 }
    if (state.week == 13) { state.intensity = 80 }
    if (state.week == 14) { state.intensity = 60 }
    if (state.week == 15) { state.intensity = 75 }
    if (state.week == 16) { state.intensity = 77.5 }
    if (state.week == 17) { state.intensity = 80 }
    if (state.week == 18) { state.intensity = 77.5 }
    if (state.week == 19) { state.intensity = 80 }
    if (state.week == 20) { state.intensity = 82.5 }
    if (state.week == 21) { state.intensity = 60 }
    
    if (state.intensity > 95) { state.lastrep = 1 }
    else if (state.intensity > 90) { state.lastrep = 2 }
    else if (state.intensity > 87.5) { state.lastrep = 3 }
    else if (state.intensity > 85) { state.lastrep = 4 }
    else if (state.intensity > 82.5) { state.lastrep = 5 }
    else if (state.intensity > 80) { state.lastrep = 6 }
    else if (state.intensity > 77.5) { state.lastrep = 8 }
    else if (state.intensity > 75) { state.lastrep = 9 }
    else if (state.intensity > 72.5) { state.lastrep = 10 }
    else if (state.intensity > 70) { state.lastrep = 11 }
    else if (state.intensity > 67.5) { state.lastrep = 12 }
    else if (state.intensity > 65) { state.lastrep = 13 }
    else if (state.intensity > 62.5) { state.lastrep = 15 }
    else if (state.intensity > 60) { state.lastrep = 16 }
    else if (state.intensity > 57.5) { state.lastrep = 18 }
    else if (state.intensity > 55) { state.lastrep = 19 }
    else if (state.intensity > 52.5) { state.lastrep = 21 }
    else if (state.intensity > 50) { state.lastrep = 23 }
    else { state.lastrep = 25 }
    
    if (state.intensity > 95) { state.reps = 1 }
    else if (state.intensity > 87.5) { state.reps = 2 }
    else if (state.intensity > 85) { state.reps = 3 }
    else if (state.intensity > 82.5) { state.reps = 4 }
    else if (state.intensity > 80) { state.reps = 5 }
    else if (state.intensity > 77.5) { state.reps = 6 }
    else if (state.intensity > 75) { state.reps = 7 }
    else if (state.intensity > 72.5) { state.reps = 8 }
    else if (state.intensity > 70) { state.reps = 9 }
    else if (state.intensity > 67.5) { state.reps = 10 }
    else if (state.intensity > 65) { state.reps = 11 }
    else if (state.intensity > 62.5) { state.reps = 12 }
    else if (state.intensity > 60) { state.reps = 13 }
    else if (state.intensity > 57.5) { state.reps = 14 }
    else if (state.intensity > 55) { state.reps = 15 }
    else if (state.intensity > 52.5) { state.reps = 17 }
    else if (state.intensity > 50) { state.reps = 18 }
    else { state.reps = 20 }
    `,
    cases: [
      {
        initialState: () => ({
          tm: Weight.build(1000, "lb"),
          week: 1,
          intensity: 70,
          reps: 8,
          lastrep: 9,
        }),
        adjustEmptyGlobals: {
          r: [5, 5, 5, 5],
          reps: [5, 5, 5, 5],
          cr: [5, 5, 5, 6],
          completedReps: [5, 5, 5, 6],
          weights: [
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
            Weight.build(150, "lb"),
          ],
        },
        finalState: expect.objectContaining({
          week: 2,
          intensity: 72.5,
          reps: 9,
          lastrep: 11,
        }),
      },
    ],
  },
  // oneliner
  {
    script: `if (completedReps >= reps && state.lastsetrir>1) {state.reps=state.reps+1}`,
    cases: [
      {
        initialState: () => ({ lastsetrir: 3, reps: 5 }),
        adjustEmptyGlobals: {
          reps: [5, 5],
        },
        finalState: { lastsetrir: 3, reps: 6 },
      },
    ],
  },
  //nested conditions
  {
    script: `
      if ((r[1] == 3 || r[1] == 6) && (((r[2] == 3 ? 1 == 1 : 1 == 2)))) {
        state.reps = 1 == 1 ? state.reps + 1 : state.reps + 2
      }
    `,
    cases: [
      {
        initialState: () => ({ reps: 5 }),
        adjustEmptyGlobals: {
          r: [6, 2],
        },
        finalState: { reps: 6 },
      },
    ],
  },
  // fn in if
  {
    script: `
      if (2 > 1) {
        state.weight = roundWeight(state.weight * 0.323)
      }
    `,
    cases: [
      {
        initialState: () => ({ weight: Weight.build(1000, "lb") }),
        adjustEmptyGlobals: {},
        finalState: { weight: Weight.build(323, "lb") },
        result: Weight.build(323, "lb"),
      },
    ],
  },
  // fn in assignment
  {
    script: `
      state.weight = roundWeight(state.weight * 0.323123)
    `,
    cases: [
      {
        initialState: () => ({ weight: Weight.build(1000, "lb") }),
        adjustEmptyGlobals: {},
        finalState: { weight: Weight.build(323.1, "lb") },
      },
    ],
  },
  // nested conditions 2
  {
    script: `
    if (!(completedReps[1] >= reps[1] - 2)) {
      state.failures = state.failures + 1
    }
    `,
    cases: [
      {
        initialState: () => ({ failures: 0 }),
        adjustEmptyGlobals: {
          reps: [8],
          completedReps: [5],
        },
        finalState: { failures: 1 },
      },
    ],
  },
])("$script", ({ script, cases }) => {
  describe.each(cases)(
    "Result is $result for case %#: $description",
    (case_) => {
      const { initialState, adjustEmptyGlobals, finalState } = case_;
      test("old system", () => {
        // if (case_.description === "sum of crs < 15") {
        //   console.log(
        //     "This statement is here to you can easily break on this test",
        //   );
        // }

        const state = initialState?.() ?? {};
        const output = new LiftoscriptEvaluator(
          script,
          state,
          {},
          {
            ...emptyGlobalData(),
            ...adjustEmptyGlobals,
          },
          {},
          {},
          "kg",
          "planner",
        ).evaluate(parser.parse(script).topNode);
        if ("result" in case_) {
          expect
            .soft(output, "Script should evaluate to the expected result")
            .toEqual(case_.result);
        }
        if (finalState) {
          // State in the old system is mutable, the object itself is modified
          expect
            .soft(state, "State after evaluation completes should match")
            .toEqual(finalState);
        }
      });
      test("new system", () => {
        // if (case_.description === "sum of crs < 15") {
        //   console.log(
        //     "This statement is here to you can easily break on this test",
        //   );
        // }
        const { result: output, finalState: state } = run(
          script,
          initialState?.() ?? {},
          {
            ...emptyGlobalData(),
            ...adjustEmptyGlobals,
          },
        );
        if ("result" in case_) {
          expect
            .soft(output, "Script should evaluate to the expected result")
            .toEqual(case_.result);
        }
        if (finalState) {
          expect
            .soft(state, "State after evaluation completes should match")
            .toEqual(finalState);
        }
      });
    },
  );
});
