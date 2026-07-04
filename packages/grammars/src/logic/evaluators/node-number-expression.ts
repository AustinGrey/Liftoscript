import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { getChild, queryChild } from "@/logic/parsing/guards.ts";

export const handler: LogicHandler<"NumberExpression"> = (n) => {
  const numberNode = getChild(n, {
    ofType: "Number",
  });
  const value = parseFloat(numberNode.source);
  // @TODO Why would this node be called "plus" when the obvious use case for it is to specify a minus?
  // @TODO Why would the leading sign not be considered part of the number literal? Could we simplify the grammar parsing if we just make the sign part of the literal?
  const plusNode = queryChild(n, { ofType: "Plus" });
  const sign = plusNode?.source;
  return sign === "-" ? -value : value;
};
