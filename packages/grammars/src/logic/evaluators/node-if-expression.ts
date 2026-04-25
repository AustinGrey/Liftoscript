import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { queryChildren } from "@/utils/grammars.ts";

export const handler: LogicHandler<"IfExpression"> = (n, t) => {
  // if/else chains are just linear lists of conditions (in parenthesis) and
  // blocks that execute and short circuit if the condition is met. So we
  // Can just make two zippered lists of the conditions and blocks and evaluate
  // the conditions to determine where to short circuit
  const conditionNodes = [
    ...queryChildren(n, {
      ofType: NodeName.ParenthesisExpression,
    }),
  ];
  const blockNodes = [
    ...queryChildren(n, { ofType: NodeName.BlockExpression }),
  ];
  while (conditionNodes.length > 0) {
    const conditionNode = conditionNodes.shift()!;
    const blockNode = blockNodes.shift()!;
    if (t.recurse(conditionNode)) {
      return t.recurse(blockNode);
    }
  }
  const lastBlock = blockNodes.shift();
  return lastBlock != null ? t.recurse(lastBlock) : 0;
};
