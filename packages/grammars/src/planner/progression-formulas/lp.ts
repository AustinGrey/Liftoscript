import { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import type { SourcedSyntaxNode } from "@/utils/lezer.ts";
import { asBase10Int } from "@/utils/math.ts";

/**
 * @yields any problems found with use of the linear progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export function* validate(
  [
    argWeight,
    argAttempts,
    argSuccessfulAttempts,
    argNextWeight,
    argFailedAttempts,
    argFailedAttemptsUpToDate,
    ...argsRest
  ]: (string | undefined)[],
  valueNode: SourcedSyntaxNode,
): Generator<PlannerSyntaxError> {
  if (
    argWeight &&
    !argWeight.endsWith("lb") &&
    !argWeight.endsWith("kg") &&
    !argWeight.endsWith("%")
  ) {
    yield PlannerSyntaxError.fromNode(
      `1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
      valueNode,
    );
  }
  if (argAttempts != null && asBase10Int(argAttempts)) {
    yield PlannerSyntaxError.fromNode(
      `2nd argument of 'lp' should be a number of attempts - i.e. a number`,
      valueNode,
    );
  }
  if (argSuccessfulAttempts != null && asBase10Int(argSuccessfulAttempts)) {
    yield PlannerSyntaxError.fromNode(
      `3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
      valueNode,
    );
  }
  if (
    argNextWeight != null &&
    !argNextWeight.endsWith("lb") &&
    !argNextWeight.endsWith("kg") &&
    !argNextWeight.endsWith("%")
  ) {
    yield PlannerSyntaxError.fromNode(
      `4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
      valueNode,
    );
  }
  if (argFailedAttempts != null && asBase10Int(argFailedAttempts)) {
    yield PlannerSyntaxError.fromNode(
      `5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
      valueNode,
    );
  }
  if (
    argFailedAttemptsUpToDate != null &&
    asBase10Int(argFailedAttemptsUpToDate)
  ) {
    yield PlannerSyntaxError.fromNode(
      `6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
      valueNode,
    );
  }
  if (argsRest.length > 0) {
    yield PlannerSyntaxError.fromNode(
      `Linear Progression 'lp' only has 6 arguments max`,
      valueNode,
    );
  }
}
