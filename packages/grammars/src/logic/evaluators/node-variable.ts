import type { LogicHandler } from "@/logic/evaluators/types.ts";

export const handler: LogicHandler<"Variable"> = (n, t) => {
  const varKey = t.getText(n).replace("var.", "");
  return t.getVar(varKey);
};
