import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import { type TypedLogicNode } from "@/logic/parsing/guards.ts";
import * as Weight from "@/quantities/weight.ts";
import { type IWeight, TUnit } from "@/quantities/weight.ts";
import { getChild } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { is, isNumber } from "@/utils/types.ts";
import { nodeError } from "@/utils/lezer.ts";

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
    throw nodeError(numberNode, "WeightExpression must contain a number");
  }
  const unit = unitNode.source;
  if (!is(TUnit, unit)) {
    throw nodeError(
      unitNode,
      "WeightExpression must contain a unit of either kg or lb",
    );
  }
  return Weight.build(num, unit);
}
