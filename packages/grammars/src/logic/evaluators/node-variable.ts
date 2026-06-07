import type { LogicHandler } from "@/logic/evaluators/types.ts";

export const handler: LogicHandler<"Variable"> = (n, t) => {
  return t.getVar(n.source.replace("var.", ""));
};
