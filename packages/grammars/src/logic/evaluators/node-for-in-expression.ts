import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";

export const handler: LogicHandler<"ForInExpression"> = (n, t) => {
  const [child] = queryChildren(n, { atLeast: 1 });
  return t.recurse(child);
};
