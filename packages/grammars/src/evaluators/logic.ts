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
    case NodeName.BlockExpression: {
      let result: LogicResult = 0;
      // @TODO Why evaluate all children if only the last child's evaluate is returned?
      for (const child of getChildren(expr)) {
        if (!child.type.isSkipped) {
          result = evaluate(child);
        }
      }
      return result;
    }

    case NodeName.BinaryExpression:
    case NodeName.NumberExpression:
    case NodeName.IfExpression:
    case NodeName.ParenthesisExpression:
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
    default:
      throw new Error(`Unknown node type ${expr.type.name}`);
  }
}

/**
 * @yields all children of a syntax node, regardless of their type
 * @param node The node to get the children of
 */
function* getChildren(node: SyntaxNode): Generator<SyntaxNode> {
  const cur = node.cursor();
  if (!cur.firstChild()) {
    return;
  }
  do {
    yield cur.node;
  } while (cur.nextSibling());
}
