import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";

export const handler: LogicHandler<"StateVariableIndex"> = (n, t) => {
  const [expression] = queryChildren(n, { atLeast: 1 }).take(1);
  return t.recurse(expression);
};
