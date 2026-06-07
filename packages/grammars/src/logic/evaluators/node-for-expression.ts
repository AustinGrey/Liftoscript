import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { getChild } from "@/utils/grammars.ts";

export const handler: LogicHandler<"ForExpression"> = (n, t) => {
  const variableNode = getChild(n, { ofType: NodeName.Variable });
  const forInExpression = getChild(n, { ofType: NodeName.ForInExpression });
  const blockNode = getChild(n, { ofType: NodeName.BlockExpression });
  const forIn = t.recurse(forInExpression);
  if (!Array.isArray(forIn)) {
    return t.error(`for in expression should return an array`, forInExpression);
  }
  const varKey = variableNode.source.replace("var.", "");
  for (let i = 1; i <= forIn.length; i += 1) {
    t.updateVar(varKey, i);
    t.recurse(blockNode);
  }
  return forIn.length;
};
