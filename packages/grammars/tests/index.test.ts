import { expect, it } from "vite-plus/test";
import type { IProgramState, IWeight } from "@/types.ts";
import {
  type IScriptBindings,
  Progress_createScriptFunctions,
} from "@/models/progress.ts";
import { ScriptRunner } from "@/parser.ts";
import { Settings_build } from "@/models/settings.ts";
import { Weight_build } from "@/models/weight.ts";

const fns = Progress_createScriptFunctions(Settings_build());

export const ParserTestUtils_defaultBindings: IScriptBindings = {
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
  bodyweight: Weight_build(0, "lb"),
  descriptionIndex: 1,
  rm1: Weight_build(100, "lb"),
};

export function ParserTestUtils_run(
  program: string,
  state: IProgramState,
  bindings: IScriptBindings = ParserTestUtils_defaultBindings,
): number | IWeight | boolean {
  const scriptRunner = new ScriptRunner(
    program,
    state,
    {},
    bindings,
    fns,
    "lb",
    { unit: "lb", prints: [] },
    "planner",
  );
  return scriptRunner.execute();
}

it("ternary", () => {
  expect(
    ParserTestUtils_run(`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, {
      foo: 2,
    }),
  ).to.eql(6);
});
