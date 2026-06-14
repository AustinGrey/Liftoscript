import {
  PlannerNodeName,
  PlannerSyntaxError,
} from "@/planner/parsing/guards.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";

/**
 * @yields any problems found with use of the custom progression formula in code
 * @param _ The args passed to the function
 * @param valueNode The node where the formula use was defined
 * @param validateLiftoscript The method used to validate embedded liftoscript
 */
export const validate: ProgressionFormulaValidator = function* (
  _,
  valueNode,
  validateLiftoscript,
) {
  const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
  const script = liftoscriptNode?.source;
  const body = valueNode
    .getChild(PlannerNodeName.ReuseLiftoscript)
    ?.getChild(PlannerNodeName.ReuseSection)
    ?.getChild(PlannerNodeName.ExerciseName)?.source;
  if (!script && !body) {
    yield PlannerSyntaxError.fromNode(
      `'custom' progression requires either to specify Liftoscript block or specify which one to reuse`,
      valueNode,
    );
  }
  if (script) {
    const { line, from } = liftoscriptNode.getPointer();
    yield* validateLiftoscript(script).map(
      (err) =>
        new PlannerSyntaxError(
          err.message,
          line + err.line,
          err.offset,
          from + err.from,
          from + err.to,
        ),
    );
  }
};
