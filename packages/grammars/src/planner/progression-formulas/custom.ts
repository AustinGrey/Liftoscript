import {
  PlannerNodeName,
  PlannerSyntaxError,
} from "@/planner/parsing/guards.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";

/**
 * @yields any problems found with use of the custom progression formula in code
 * @param _ The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (_, valueNode) {
  const script = valueNode.getChild(PlannerNodeName.Liftoscript)?.source;
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
};
