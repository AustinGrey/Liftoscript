import { type LogicHandler, type Validator } from "@/logic/evaluators/types.ts";
import { nodeError } from "@/utils/lezer.ts";

export const handler: LogicHandler<"Variable"> = (n, t) => {
  return t.getVar(n.source.replace("var.", ""));
};

export const validator: Validator<"Variable"> = function* (n, t) {
  const variableKey = n.source;
  if (!t.isKnownVariable(variableKey)) {
    yield nodeError(n, `There's no variable '${variableKey}'`);
  }
};
