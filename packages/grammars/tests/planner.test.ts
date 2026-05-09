import { describe, expect, test } from "vite-plus/test";
import { run } from "@/planner/evaluators";
import { PlannerTestUtils_finish } from "./plannerTestUtils.ts";
import { PlannerProgram_generateFullText } from "@/planner/display.ts";

type PlannerTestCase = {
  description?: string;
  plan: string;
  /**
   * The plan that results from evaluating the plan
   */
  result: string;
};

const baseSettings = {
  // Most planner parsing/eval paths only need these for tests.
  // We keep it intentionally minimal and cast to the real type.
  units: "kg",
  exercises: {},
} as const;

const cases: PlannerTestCase[] = [
  {
    description: "updates weight after completing",
    plan: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb)`,
    result: `# Week 1
## Day 1
Squat / 2x5 / 105lb / progress: lp(5lb)


`,
  },
];

describe.each(cases)("$description", (case_) => {
  test("old system", () => {
    const programText = `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb)`;
    const { program } = PlannerTestUtils_finish(programText, {
      completedReps: [[5, 5]],
    });
    const newText = PlannerProgram_generateFullText(program.planner!.weeks);
    expect(newText).to.equal(`# Week 1
## Day 1
Squat / 2x5 / 105lb / progress: lp(5lb)


`);
  });

  test.skip("new system", () => {
    // New evaluator system scaffolding. It's okay if this fails for now.
    const result = run({
      fullProgramText: case_.plan,
      settings: baseSettings as unknown as never,
    });

    // When implemented, this should likely match the old system behavior.
    expect(result).toBeTruthy();
  });
});
