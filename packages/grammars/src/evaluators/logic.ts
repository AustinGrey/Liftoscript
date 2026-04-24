import { parser } from "@/parsers/logic.ts";
import type { SyntaxNode } from "@lezer/common";
import {
  type IPercentage,
  type IWeight,
  NodeName,
} from "@/evaluators/logic-evaluator.ts";
type LogicResultSingular = number | boolean | IWeight | IPercentage | undefined;

export type LogicResult = LogicResultSingular | LogicResultSingular[];

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
export function run(logic: string): LogicResult {
  return evaluate(parser.parse(logic).topNode);
}

/**
 * A new simplified evaluator that gets the result of a logic script
 * @param expr The logic script to evaluate
 */
function evaluate(expr: SyntaxNode): LogicResult {
  switch (expr.type.name) {
    case NodeName.Program:
    case NodeName.BlockExpression:
    case NodeName.ParenthesisExpression: {
      let result: LogicResult = 0;
      // @TODO Why evaluate all children if only the last child's evaluate is returned?
      for (const child of getChildren(expr, { atLeast: 1 })) {
        if (!child.type.isSkipped) {
          result = evaluate(child);
        }
      }
      return result;
    }

    case NodeName.BinaryExpression:
    case NodeName.NumberExpression:
    case NodeName.Percentage:
    case NodeName.Ternary:
    case NodeName.ForExpression:
    case NodeName.IfExpression:
    case NodeName.StateVariableIndex:
    case NodeName.AssignmentExpression:
    case NodeName.IncAssignmentExpression:
    case NodeName.BuiltinFunctionExpression:
    case NodeName.UnaryExpression:
    case NodeName.WeightExpression:
    case NodeName.VariableExpression:
    case NodeName.StateVariable:
    case NodeName.Variable:
    case NodeName.ForInExpression:
      throw new Error(`Unsupported node type ${expr.type.name}`);
    default:
      throw new Error(`Unknown node type ${expr.type.name}`);
  }
}

/**
 * @yields all children of a syntax node, regardless of their type
 * @param node The node to get the children of
 * @param options
 * @param options.atLeast - If provided, throws an error if the node has fewer than this many children
 */
function* getChildren(
  node: SyntaxNode,
  {
    atLeast,
  }: Partial<{
    atLeast?: number;
  }> = {},
): Generator<SyntaxNode> {
  const cur = node.cursor();
  let count = 0;
  if (!cur.firstChild()) {
    if (atLeast !== undefined && atLeast !== 0) {
      throw new SyntaxError(
        `Expected at least${atLeast} children, but got ${count}`,
      );
    }
    return;
  }
  do {
    yield cur.node;
    count++;
  } while (cur.nextSibling());
  if (atLeast !== undefined && count < atLeast) {
    throw new SyntaxError(
      `Expected at least ${atLeast} children, but got ${count}`,
    );
  }
}
