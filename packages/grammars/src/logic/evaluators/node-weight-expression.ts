import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import { type TypedLogicNode } from "@/parsers/guards.ts";
import * as Weight from "@/models/weight.ts";
import { type IWeight, TUnit } from "@/models/weight.ts";
import { getChild } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { is, isNumber } from "@/utils/types.ts";

export const handler: LogicHandler<"WeightExpression"> = (n, t) => {
  return getWeight(n, t) ?? Weight.build(0, "kg");
};

function getWeight(
  expr: TypedLogicNode<"WeightExpression">,
  tools: EvaluateTools,
): IWeight | undefined {
  const numberNode = getChild(expr, { ofType: NodeName.NumberExpression });
  const unitNode = getChild(expr, { ofType: NodeName.Unit });
  const num = tools.recurse(numberNode);
  if (!isNumber(num)) {
    tools.error("WeightExpression must contain a number", numberNode);
  }
  const unit = tools.getText(unitNode);
  if (!is(TUnit, unit)) {
    tools.error(
      "WeightExpression must contain a unit of either kg or lb",
      unitNode,
    );
  }
  return Weight.build(num, unit);
}
