import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { getDescendant } from "@/utils/grammars.ts";
import type { TypedLogicNode } from "@/parsers/guards.ts";

export const handler: LogicHandler<"StateVariable"> = (n, t) => {
  const stateKey = getStateKey(n, t);
  if (stateKey == null) {
    return t.error(
      `You cannot read from other exercise's states, you can only write to them`,
      n,
    );
  }
  return t.getState(stateKey, n);
};

/**
 * Gets the text of the variable attempting to be accessed on the state
 * e.g. state.foo, this would return 'foo'
 * @param expr The node to get the state key from
 * @param tools
 */
function getStateKey(
  expr: TypedLogicNode<"StateVariable">,
  tools: EvaluateTools,
): string | undefined {
  try {
    return tools.getText(getDescendant(expr, { ofType: NodeName.Keyword }));
  } catch (e) {
    return undefined;
  }
}
