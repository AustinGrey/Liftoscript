import { describe, expect, test } from "vite-plus/test";
import { PlannerOldEvaluator_evaluateFull } from "@/evaluators/planner-evaluator.ts";
import { run } from "@/planner/evaluators";

type PlannerTestCase = {
  description?: string;
  fullProgramText: string;
  /**
   * If provided, the old system is expected to produce a failure result and the
   * error message should include this substring.
   */
  expectedOldErrorIncludes?: string;
  /**
   * If provided, the old system is expected to succeed and include these
   * exercise full names in the returned list.
   */
  expectedExerciseFullNames?: string[];
};

const baseSettings = {
  // Most planner parsing/eval paths only need these for tests.
  // We keep it intentionally minimal and cast to the real type.
  units: "kg",
  exercises: {},
} as const;

const cases: PlannerTestCase[] = [
  {
    description: "single notused exercise parses successfully",
    fullProgramText: `
# Week 1
## Day 1
Squat / used none
    `,
    expectedExerciseFullNames: ["Squat"],
  },
  {
    description: "duplicate exercise same day produces error",
    fullProgramText: `
# Week 1
## Day 1
Squat / used none
Squat / used none
    `,
    expectedOldErrorIncludes: "already used in this day",
  },
];

describe.each(cases)("$description", (case_) => {
  test("old system", () => {
    const oldResult = PlannerOldEvaluator_evaluateFull(case_.fullProgramText);

    if (case_.expectedOldErrorIncludes) {
      expect(oldResult.success).toBe(false);
      if (!oldResult.success) {
        expect(String(oldResult.error)).toContain(case_.expectedOldErrorIncludes);
      }
      return;
    }

    expect(oldResult.success).toBe(true);
    for (const name of case_.expectedExerciseFullNames ?? []) {
      expect(oldResult.exerciseFullNames).toContain(name);
    }
  });

  test("new system", () => {
    // New evaluator system scaffolding. It's okay if this fails for now.
    const result = run({
      fullProgramText: case_.fullProgramText,
      settings: baseSettings as unknown as never,
    });

    // When implemented, this should likely match the old system behavior.
    expect(result).toBeTruthy();
  });
});

