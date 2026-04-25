import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";

export const handler: LogicHandler<"Ternary"> = (n, t) => {
  const [condition, then, else_] = queryChildren(n, { atLeast: 3 });
  return t.recurse(condition) ? t.recurse(then) : t.recurse(else_);
};
