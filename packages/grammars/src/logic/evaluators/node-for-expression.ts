import { type LogicHandler, type Validator } from "@/logic/evaluators/types.ts";
import { nodeError } from "@/utils/lezer.ts";
import { getChild } from "@/logic/parsing/guards.ts";

export const handler: LogicHandler<"ForExpression"> = (n, t) => {
  const variableNode = getChild(n, { ofType: "Variable" });
  const forInExpression = getChild(n, { ofType: "ForInExpression" });
  const blockNode = getChild(n, { ofType: "BlockExpression" });
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

export const validator: Validator<"ForExpression"> = function (n, t): [] {
  const varName = getChild(n, { ofType: "Variable" })?.source;
  if (varName != null) {
    t.trackVariable(varName);
  }
  return [];
};
