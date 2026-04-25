import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";

// @TODO Original liftoscript would evaluate all children, but only return the result of the last child.
//    I don't understand that, so I'm going to just get the last child's result directly. But I need to add a test to check against the original behaviour.
export const handler: LogicHandler<"Program"> = (n, t) => {
  const lastChild = [...queryChildren(n, { atLeast: 1 })].at(-1);
  return lastChild ? t.recurse(lastChild) : 0;
};
