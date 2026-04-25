import { expect, test, describe } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator";
import { run } from "@/logic/evaluators";
import * as Weight from "@/models/weight.ts";

import { percentORM } from "@/models/weight.ts";
import type {
  IProgramState,
  IScriptBindings,
  LogicResult,
} from "@/logic/evaluators/types.ts";

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
    r: [],
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

describe.each<
  | [string, LogicResult]
  | [
      string,
      LogicResult,
      Partial<{
        initialState: IProgramState;
        globalData: IScriptBindings;
      }>,
    ]
>([
  // Literal Number
  [`1`, 1],
  [`0`, 0],
  [`-1`, -1],
  // Percentages of one rep max
  ["0%", percentORM(0)],
  ["50%", percentORM(50)],
  ["100%", percentORM(100)],
  ["101%", percentORM(101)],
  /* Bad Cases
    ["NaN%", percentORM(0)],
    ["-50%", percentORM(-50)],
    ["-101%", percentORM(-101)],
     */
  // Comparisons
  [`1 > 0`, true],
  [`1 < 0`, false],
  [`1 >= 0`, true],
  [`1 <= 0`, false],
  [`1 == 0`, false],
  [`1 != 0`, true],
  [`1kg > 0`, true],
  [`1kg < 0`, false],
  [`1kg >= 0`, true],
  [`1kg <= 0`, false],
  [`1kg == 0`, false],
  [`1kg != 0`, true],
  [`1lb > 0`, true],
  [`1lb < 0`, false],
  [`1lb >= 0`, true],
  [`1lb <= 0`, false],
  [`1lb == 0`, false],
  [`1lb != 0`, true],
  [`1 > 0kg`, true],
  [`1 < 0kg`, false],
  [`1 >= 0kg`, true],
  [`1 <= 0kg`, false],
  [`1 == 0kg`, false],
  [`1 != 0kg`, true],
  [`1 > 0lb`, true],
  [`1 < 0lb`, false],
  [`1 >= 0lb`, true],
  [`1 <= 0lb`, false],
  [`1 == 0lb`, false],
  [`1 != 0lb`, true],
  [`1kg > 1lb`, true],
  [`1kg < 1lb`, false],
  [`1kg >= 1lb`, true],
  [`1kg <= 1lb`, false],
  [`1kg == 1lb`, false],
  [`1kg != 1lb`, true],
  [`1lb > 1kg`, false],
  [`1lb < 1kg`, true],
  [`1lb >= 1kg`, false],
  [`1lb <= 1kg`, true],
  [`1lb == 1kg`, false],
  [`1lb != 1kg`, true],
  // Ternary
  [`4 < 5 ? 1 : 0`, 1],
  [`5 < 4 ? 1 : 0`, 0],
  [
    `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    5,
    { initialState: { foo: 8 } },
  ],
  [
    `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    4,
    { initialState: { foo: 4 } },
  ],
  [
    `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`,
    6,
    { initialState: { foo: 2 } },
  ],
  // Index access
  [`r[state.foo]`, 2, { initialState: { foo: 2 } }],
])("$0 resolves to $2 when state is $1", (logic, expected, initialState) => {
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
    expect(evaluator(logic, initialState, emptyGlobalData())).toEqual(expected);
  });
});
