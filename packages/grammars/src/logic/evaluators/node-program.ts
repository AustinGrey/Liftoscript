import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import type { LogicResult } from "@/logic/types.ts";

export const handler: LogicHandler<"Program"> = (n, t) => {
  let result: LogicResult = 0;
  // Each child needs to be evaluated, since each could potentially alter the state of the program, impacting future steps
  for (const child of queryChildren(n, { atLeast: 1 })) {
    result = t.recurse(child);
  }
  return result;
};
