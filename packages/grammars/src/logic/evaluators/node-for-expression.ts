import { type LogicHandler, type Validator } from "@/logic/evaluators/types.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { getChild } from "@/utils/grammars.ts";
import { nodeError } from "@/utils/lezer.ts";

export const handler: LogicHandler<"ForExpression"> = (n, t) => {
  const variableNode = getChild(n, { ofType: NodeName.Variable });
  const forInExpression = getChild(n, { ofType: NodeName.ForInExpression });
  const blockNode = getChild(n, { ofType: NodeName.BlockExpression });
  const forIn = t.recurse(forInExpression);
  if (!Array.isArray(forIn)) {
    throw nodeError(
      forInExpression,
      `for in expression should return an array`,
    );
  }
  const varKey = variableNode.source.replace("var.", "");
  for (let i = 1; i <= forIn.length; i += 1) {
    t.updateVar(varKey, i);
    t.recurse(blockNode);
  }
  return forIn.length;
};

export const validator: Validator<"ForExpression"> = function* (n, t) {
  const varName = getChild(n, { ofType: NodeName.Variable })?.source;
  if (varName != null) {
    t.trackVariable(varName);
  }
};
