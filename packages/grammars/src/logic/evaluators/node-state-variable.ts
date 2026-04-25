import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { getChild, queryChild } from "@/utils/grammars.ts";

export const handler: LogicHandler<"StateVariable"> = (n, t) => {
  const stateKey = getStateKey(n, t);
  if (stateKey == null) {
    return t.error(
      `You cannot read from other exercise's states, you can only write to them`,
      n,
    );
  }
  if (stateKey in t.state) {
    return t.state[stateKey];
  } else {
    return t.error(`There's no state variable '${stateKey}'`, n);
  }
};

function getStateKey(
  expr: SyntaxNode,
  tools: EvaluateTools,
): string | undefined {
  const index = queryChild(expr, { ofType: NodeName.StateVariableIndex });
  if (index == null) {
    const stateKeyNode = getChild(expr, { ofType: NodeName.Keyword });
    if (stateKeyNode != null) {
      return tools.getText(stateKeyNode);
    }
  }
  return undefined;
}
