import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { getChild } from "@/utils/grammars.ts";

export const handler: LogicHandler<"ParenthesisExpression"> = (n, t) => {
  return t.recurse(getChild(n));
};
