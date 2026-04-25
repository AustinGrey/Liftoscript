import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { getChild, queryChild } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";

export const handler: LogicHandler<"NumberExpression"> = (n, t) => {
  const numberNode = getChild(n, {
    ofType: NodeName.Number,
  });
  const value = parseFloat(t.getText(numberNode));
  // @TODO Why would this node be called "plus" when the obvious use case for it is to specify a minus?
  // @TODO Why would the leading sign not be considered part of the number literal? Could we simplify the grammar parsing if we just make the sign part of the literal?
  const plusNode = queryChild(n, { ofType: NodeName.Plus });
  const sign = t.getText(plusNode);
  return sign === "-" ? -value : value;
};
