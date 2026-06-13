import { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import { asBase10Int } from "@/utils/math.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";

/**
 * @yields any problems found with use of the double progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (
  [argWeight, argMinReps, argMaxReps, ...argsRest],
  valueNode,
): Generator<PlannerSyntaxError> {
  if (
    argWeight == null ||
    argMinReps == null ||
    argMaxReps == null ||
    argsRest.length > 0
  ) {
    yield PlannerSyntaxError.fromNode(
      `Double Progression 'dp' should have 3 arguments`,
      valueNode,
    );
    return;
  }
  if (
    !argWeight.endsWith("lb") &&
    !argWeight.endsWith("kg") &&
    !argWeight.endsWith("%")
  ) {
    yield PlannerSyntaxError.fromNode(
      `1st argument of 'dp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
      valueNode,
    );
  }
  if (asBase10Int(argMinReps)) {
    yield PlannerSyntaxError.fromNode(
      `2nd argument of 'dp' should be min reps in the range - i.e. a number, like 8`,
      valueNode,
    );
  }
  if (asBase10Int(argMaxReps)) {
    yield PlannerSyntaxError.fromNode(
      `3rd argument of 'dp' should be max reps in the range - i.e. a number, like 12`,
      valueNode,
    );
  }
};
