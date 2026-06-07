import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { queryChild } from "@/utils/grammars.ts";
import type { SourcedSyntaxNode } from "@/utils/lezer.ts";

export const handler: LogicHandler<"StateVariable"> = (n, t) => {
  const stateKey =
    getStateKey(n) ??
    t.error(
      `You cannot read from other exercise's states, you can only write to them`,
      n,
    );
  return t.getState(stateKey, n);
};

/**
 * Gets the text of the variable attempting to be accessed on the state
 * e.g. state.foo, this would return 'foo'
 * @param expr The node to get the state key from
 */

function getStateKey(expr: SourcedSyntaxNode): string | undefined {
  const index = queryChild(expr, { ofType: NodeName.StateVariableIndex });
  if (index === undefined) {
    const stateKeyNode = queryChild(expr, { ofType: NodeName.Keyword });
    if (stateKeyNode != null) {
      return stateKeyNode.source;
    }
  }
  return undefined;
}
