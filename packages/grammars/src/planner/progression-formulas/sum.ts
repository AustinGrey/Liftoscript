import { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import { asBase10Int } from "@/utils/math.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";
import { nodeError } from "@/utils/lezer.ts";

/**
 * @yields any problems found with use of the sum progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (
  [argReps, argWeight, ...argsRest],
  valueNode,
): Generator<PlannerSyntaxError> {
  if (argReps == null || asBase10Int(argReps)) {
    yield nodeError(
      valueNode,
      `1st argument of 'sum' should be a number of reps - i.e. a number`,
    );
  }
  if (
    argWeight == null ||
    (!argWeight.endsWith("lb") &&
      !argWeight.endsWith("kg") &&
      !argWeight.endsWith("%"))
  ) {
    yield nodeError(
      valueNode,
      `2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
    );
  }
  if (argsRest.length > 0) {
    yield nodeError(
      valueNode,
      `Reps Sum Progression 'sum' only has 2 arguments max`,
    );
  }
};
