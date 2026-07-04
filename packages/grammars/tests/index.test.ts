import { describe, expect, test } from "vite-plus/test";
import { run } from "@/logic/evaluators";
import type { RequireAtLeastOne } from "type-fest";
import { toMerged } from "es-toolkit";

import {
  dw,
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
  w,
} from "@/quantities/weight.ts";
import {
  IProgramMode,
  type IProgramState,
  type IScriptBindings,
} from "@/logic/evaluators/types.ts";
import type { LogicResult, Quantity } from "@/logic/types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import { is, isNumber } from "@/utils/types.ts";
import { round } from "@/utils/logic-results.ts";
import { MathUtils_round } from "@/utils/math.ts";
import type { IScriptFnContext } from "@/common-types.ts";
import type { ISettings } from "@/user-settings";

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
    bodyweight: w`0kg`,
    setIndex: 1,
    rm1: w`0kg`,
  };
}

const testSettings: ISettings = {
  timers: {
    warmup: 0,
    workout: 0,
    reminder: 0,
    superset: 0,
  },
  gyms: [],
  deletedGyms: [],
  exercises: {},
  units: "kg",
  lengthUnits: "cm",
  volume: 0,
  exerciseData: {},
  planner: {
    synergistMultiplier: 0,
    strengthSetsPct: 0,
    hypertrophySetsPct: 0,
    weeklyRangeSets: {},
    weeklyFrequency: {},
  },
  muscleGroups: {
    data: {},
  },
  appleHealthSyncWorkout: false,
  appleHealthSyncMeasurements: false,
  appleHealthAnchor: "",
  googleHealthSyncWorkout: false,
  googleHealthSyncMeasurements: false,
  googleHealthAnchor: "",
  healthConfirmation: false,
  ignoreDoNotDisturb: false,
  currentGymId: "",
  isPublicProfile: false,
  nickname: "",
  alwaysOnDisplay: false,
  vibration: false,
  startWeekFromMonday: false,
  textSize: 0,
  starredExercises: {},
  affiliateEnabled: false,
};
const publicFunctions = Progress_createScriptFunctions(testSettings);
const testFnContext: IScriptFnContext = {
  prints: [],
  unit: "kg",
};

type LogicTestCase = {
  description?: string;
  // The expected return value of running the script
  result?: LogicResult;
  initialState?: () => IProgramState;
  // The expected final state once the script finished executing
  finalState?: IProgramState;
  /**
   * The old system doesn't support everything this new system does.
   * If you set this, the old system test expects it to throw.
   * The value should be an explanation why it's expected.
   */
  expectOldSystemToThrow?: string;
  adjustEmptyGlobals?: Partial<IScriptBindings>;
  /**
   * If true, the debugger will be called for this test
   */
  debug?: boolean;
};

type LogicTestSpec = { script: string } & LogicTestCase & {
    cases?: LogicTestCase[];
  };

type NormalizedLogicTest = {
  script: string;
  cases: Array<RequireAtLeastOne<LogicTestCase, "result" | "finalState">>;
};

function normalizeLogicTest(test: LogicTestSpec): NormalizedLogicTest {
  const { script, cases, ...defaults } = test;
  const mergedCases = (cases?.length ? cases : [{}]).map((case_) =>
    toMerged(defaults, case_),
  );

  for (const case_ of mergedCases) {
    if (!("result" in case_) && case_.finalState === undefined) {
      throw new Error(
        `Logic test for script must specify 'result' and/or 'finalState'. Script: ${JSON.stringify(script)}`,
      );
    }
  }

  return {
    script,
    cases: mergedCases as NormalizedLogicTest["cases"],
  };
}

const cases: LogicTestSpec[] = [
  // Literal Number
  { script: `1`, result: 1 },
  { script: `0`, result: 0 },
  { script: `-1`, result: -1 },
  // Percentages of one rep max
  { script: "0%", result: dw`0%` },
  { script: "50%", result: dw`50%` },
  { script: "100%", result: dw`100%` },
  { script: "101%", result: dw`101%` },
  // Output from mixed inputs
  { script: `1 + 1`, result: 2 },
  { script: `1 + 1lb`, result: w`2lb` },
  { script: `1 + 1%`, result: dw`2%` },
  { script: `1 + 1kg`, result: w`2kg` },
  { script: `1lb + 1`, result: w`2lb` },
  { script: `1lb + 1lb`, result: w`2lb` },
  { script: `1lb + 1%`, result: w`1lb` },
  { script: `1lb + 1kg`, result: w`3lb` },
  { script: `1% + 1`, result: dw`2%` },
  {
    script: `1% + 1lb`,
    result: w`0.5kg`,
    adjustEmptyGlobals: {
      rm1: w`0kg`,
    },
  },
  { script: `1% + 1%`, result: dw`2%` },
  {
    script: `1% + 1kg`,
    result: w`1kg`,
    adjustEmptyGlobals: {
      rm1: w`0kg`,
    },
  },
  // Comparisons
  { script: `1 > 0`, result: true },
  { script: `1 < 0`, result: false },
  { script: `1 >= 0`, result: true },
  { script: `1 <= 0`, result: false },
  { script: `1 == 0`, result: false },
  { script: `1 != 0`, result: true },
  { script: `1kg > 0`, result: true },
  { script: `1kg < 0`, result: false },
  { script: `1kg >= 0`, result: true },
  { script: `1kg <= 0`, result: false },
  { script: `1kg == 0`, result: false },
  { script: `1kg != 0`, result: true },
  { script: `1lb > 0`, result: true },
  { script: `1lb < 0`, result: false },
  { script: `1lb >= 0`, result: true },
  { script: `1lb <= 0`, result: false },
  { script: `1lb == 0`, result: false },
  { script: `1lb != 0`, result: true },
  { script: `1 > 0kg`, result: true },
  { script: `1 < 0kg`, result: false },
  { script: `1 >= 0kg`, result: true },
  { script: `1 <= 0kg`, result: false },
  { script: `1 == 0kg`, result: false },
  { script: `1 != 0kg`, result: true },
  { script: `1 > 0lb`, result: true },
  { script: `1 < 0lb`, result: false },
  { script: `1 >= 0lb`, result: true },
  { script: `1 <= 0lb`, result: false },
  { script: `1 == 0lb`, result: false },
  { script: `1 != 0lb`, result: true },
  { script: `1kg > 1lb`, result: true },
  { script: `1kg < 1lb`, result: false },
  { script: `1kg >= 1lb`, result: true },
  { script: `1kg <= 1lb`, result: false },
  { script: `1kg == 1lb`, result: false },
  { script: `1kg != 1lb`, result: true },
  { script: `1lb > 1kg`, result: false },
  { script: `1lb < 1kg`, result: true },
  { script: `1lb >= 1kg`, result: false },
  { script: `1lb <= 1kg`, result: true },
  { script: `1lb == 1kg`, result: false },
  { script: `1lb != 1kg`, result: true },
  {
    script: `(1 == 1) == (1 == 1)`,
    result: true,
    expectOldSystemToThrow:
      "Old system never supported comparing booleans. So it threw a syntax error even though that is syntactically correct",
  },
  // Ternary
  {
    script: `4 < 5 ? 1 : 0`,
    result: 1,
  },
  { script: `5 < 4 ? 1 : 0`, result: 0 },
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
    result: 1,
    initialState: () => ({ foo: 2 }),
    adjustEmptyGlobals: { r: [0, 1] },
  },
  // If
  {
    script: `if (completedReps >= reps) {
        state.foo = state.foo + 3
      }`,
    result: 5,
    initialState: () => ({ foo: 2 }),
    adjustEmptyGlobals: { completedReps: [1, 2, 3], reps: [1, 2, 3] },
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
    result: 0,
    adjustEmptyGlobals: { reps: [3, 3, 3], completedReps: [3, 3, 3] },
    cases: [
      {
        initialState: () => ({
          successes: 0,
          failures: 0,
          weight: w`150lb`,
        }),
        finalState: {
          successes: 1,
          failures: 0,
          weight: w`150lb`,
        },
      },
      {
        initialState: () => ({
          successes: 2,
          failures: 0,
          weight: w`150lb`,
        }),
        finalState: {
          successes: 0,
          failures: 0,
          weight: w`155lb`,
        },
      },
      {
        initialState: () => ({
          successes: 1,
          failures: 2,
          weight: w`150lb`,
        }),
        adjustEmptyGlobals: { reps: [3, 3, 3], completedReps: [3, 3, 2] },
        finalState: {
          successes: 0,
          failures: 0,
          weight: w`145lb`,
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
    initialState: () => ({ weight: w`150lb` }),
    adjustEmptyGlobals: {
      reps: [5, 5, 5],
      w: [w`150lb`, w`150lb`, w`150lb`],
    },
    cases: [
      {
        description: "sum of crs == 15",
        adjustEmptyGlobals: {
          cr: [5, 5, 5],
        },
        finalState: { weight: w`152.5lb` },
      },
      {
        description: "sum of crs > 15",
        adjustEmptyGlobals: {
          cr: [5, 5, 11],
        },
        finalState: { weight: w`155lb` },
      },
      {
        description: "sum of crs < 15",
        adjustEmptyGlobals: {
          cr: [5, 5, 3],
        },
        finalState: { weight: w`135lb` },
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
    adjustEmptyGlobals: {
      r: [5, 5, 5, 5, 5],
      w: [w`150lb`, w`150lb`, w`150lb`, w`150lb`, w`150lb`],
    },
    cases: [
      {
        initialState: () => ({ stage: 1, weight: w`150lb` }),
        adjustEmptyGlobals: {
          cr: [5, 5, 5, 5, 5],
        },
        finalState: { stage: 1, weight: w`160lb` },
      },
      {
        initialState: () => ({ stage: 1, weight: w`150lb` }),
        adjustEmptyGlobals: {
          cr: [5, 5, 5, 5, 4],
        },
        finalState: { stage: 2, weight: w`150lb` },
      },
      {
        initialState: () => ({ stage: 3, weight: w`150lb` }),
        adjustEmptyGlobals: {
          cr: [5, 5, 5, 5, 4],
        },
        finalState: { stage: 1, weight: w`127.5lb` },
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
    initialState: () => ({ weight: w`150lb` }),
    cases: [
      {
        adjustEmptyGlobals: {
          cr: [5, 5, 30],
        },
        finalState: { weight: w`155lb` },
      },
      {
        adjustEmptyGlobals: {
          cr: [5, 5, 5, 5, 5],
        },
        finalState: { weight: w`150lb` },
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
    initialState: () => ({
      tm: w`1000lb`,
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
      weights: [w`150lb`, w`150lb`, w`150lb`, w`150lb`],
    },
    finalState: expect.objectContaining({
      week: 2,
      intensity: 72.5,
      reps: 9,
      lastrep: 11,
    }),
  },
  // oneliner
  {
    script: `if (completedReps >= reps && state.lastsetrir>1) {state.reps=state.reps+1}`,
    initialState: () => ({ lastsetrir: 3, reps: 5 }),
    adjustEmptyGlobals: {
      reps: [5, 5],
      completedReps: [5, 5],
    },
    finalState: { lastsetrir: 3, reps: 6 },
  },
  //nested conditions
  {
    script: `
      if ((r[1] == 3 || r[1] == 6) && (((r[2] == 3 ? 1 == 1 : 1 == 2)))) {
        state.reps = 1 == 1 ? state.reps + 1 : state.reps + 2
      }
    `,
    initialState: () => ({ reps: 5 }),
    adjustEmptyGlobals: {
      r: [6, 3],
    },
    finalState: { reps: 6 },
  },
  // fn in if
  {
    script: `
      if (2 > 1) {
        state.weight = roundWeight(state.weight * 0.323)
      }
    `,
    initialState: () => ({ weight: w`1000lb` }),
    adjustEmptyGlobals: {},
    finalState: { weight: w`323lb` },
    result: w`323lb`,
  },
  // fn in assignment
  {
    script: `
      state.weight = roundWeight(state.weight * 0.323123)
    `,
    initialState: () => ({ weight: w`1000lb` }),
    adjustEmptyGlobals: {},
    finalState: { weight: w`323.1lb` },
  },
  // nested conditions 2
  {
    script: `
    if (!(completedReps[1] >= reps[1] - 2)) {
      state.failures = state.failures + 1
    }
    `,
    initialState: () => ({ failures: 0 }),
    adjustEmptyGlobals: {
      reps: [8],
      completedReps: [5],
    },
    finalState: { failures: 1 },
  },
];

describe.each<NormalizedLogicTest>(cases.map(normalizeLogicTest))(
  "$script",
  ({ script, cases }) => {
    describe.each(cases)(
      "Result is $result for case %#: $description",
      (case_) => {
        const { initialState, adjustEmptyGlobals, finalState } = case_;
        test("new system", () => {
          if (case_.debug) {
            console.error(
              "This case has debug_ set true. The debugger will be called. If your debugger doesn't automatically break here, set a breakpoint.",
            );
            debugger;
          }
          const { result: output, finalState: state } = run(
            script,
            initialState?.() ?? {},
            {
              ...emptyGlobalData(),
              ...adjustEmptyGlobals,
            },
            publicFunctions,
            testFnContext,
            {},
            IProgramMode.UPDATE,
          );

          // The old system would round on every operation, propagating errors.
          // The new system preserves all precision until the final result.
          // So to have any hope of comparison, we need to round the results to the same degree that the old system would. Which is roughly 0.5 units
          // But if the old system really did have significant error, there's nothing we can do, the old system is just wrong.
          function rounder<TQ extends Quantity>(q: TQ): TQ {
            const precision = 0.5;
            if (isNumber(q)) {
              return MathUtils_round(q, precision) as TQ;
            }
            if (is(TWeight, q) || is(TDynamicWeight, q)) {
              const p: IWeight | IDynamicWeight = q;
              return { ...p, value: MathUtils_round(p.value, precision) } as TQ;
            }
            throw new Error(`Could not round value: ${q}`);
          }

          if ("result" in case_) {
            if (!output.success) {
              expect.fail("Script should evaluate successfully");
            }
            expect
              .soft(
                round(output.data, rounder),
                "Script should evaluate to the expected result",
              )
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
  },
);
