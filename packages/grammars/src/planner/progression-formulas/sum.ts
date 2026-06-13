import type { SourcedSyntaxNode } from "@/utils/lezer.ts";
import { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import { errorPlannerSyntax } from "@/evaluators/plan-evaluator-minimal.ts";
import { asBase10Int } from "@/utils/math.ts";

/**
 * @yields any problems found with use of the sum progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export function* validate(
  [argReps, argWeight, ...argsRest]: (string | undefined)[],
  valueNode: SourcedSyntaxNode,
): Generator<PlannerSyntaxError> {
  if (argReps == null || asBase10Int(argReps)) {
    yield errorPlannerSyntax(
      `1st argument of 'sum' should be a number of reps - i.e. a number`,
      valueNode,
    );
  }
  if (
    argWeight == null ||
    (!argWeight.endsWith("lb") &&
      !argWeight.endsWith("kg") &&
      !argWeight.endsWith("%"))
  ) {
    yield errorPlannerSyntax(
      `2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
      valueNode,
    );
  }
  if (argsRest.length > 0) {
    yield errorPlannerSyntax(
      `Reps Sum Progression 'sum' only has 2 arguments max`,
      valueNode,
    );
  }
}
