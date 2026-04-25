import { parser } from "@/parsers/logic.ts";
import type { SyntaxNode } from "@lezer/common";
import {
  type IPercentage,
  type IWeight,
  LiftoscriptSyntaxError,
  NodeName,
} from "@/evaluators/logic-evaluator.ts";
import { pad } from "@/utils/collection.ts";

type LogicResultSingular = number | boolean | IWeight | IPercentage | undefined;

export type LogicResult = LogicResultSingular | LogicResultSingular[];
/**
 * Tools related to the original source code. This keeps the evaluator from needing to know about the source code
 */
type SourceTools = {
  getText: <TNode extends SyntaxNode | undefined>(
    node: TNode,
  ) => TNode extends undefined ? undefined : string;
  /**
   * @returns The [line, offset] of the node in the source code
   */
  locate: (node: SyntaxNode) => [number, number];
  /**
   * Throws an error related to a node
   * @param message The message to share
   * @param node The node to throw the error for
   */
  error: (message: string, node: SyntaxNode) => never;
};

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
export function run(logic: string): LogicResult {
  return evaluate(parser.parse(logic).topNode, {
    getText(node) {
      return (
        node === undefined ? undefined : logic.slice(node.from, node.to)
      ) as typeof node extends undefined ? undefined : string;
    },
    locate(node: SyntaxNode) {
      const linesLengths = logic.split("\n").map((l) => l.length + 1);
      let offset = 0;
      for (let i = 0; i < linesLengths.length; i++) {
        const lineLength = linesLengths[i];
        if (node.from > offset && node.from < offset + lineLength) {
          return [i + 1, node.from - offset];
        }
        offset += lineLength;
      }
      return [linesLengths.length, linesLengths[linesLengths.length - 1]];
    },
    error(message, node) {
      const [line, offset] = this.locate(node);
      throw new LiftoscriptSyntaxError(
        `${message} (${line}:${offset})`,
        line,
        offset,
        node.from,
        node.to,
      );
    },
  });
}

/**
 * A new simplified evaluator that gets the result of a logic script
 * @param expr The logic script to evaluate
 * @param tools Source tools that need to be made use of during evaluation
 */
function evaluate(expr: SyntaxNode, tools: SourceTools): LogicResult {
  const { getText, locate, error } = tools;
  function recurse(expr: SyntaxNode): LogicResult {
    return evaluate(expr, tools);
  }

  switch (expr.type.name) {
    case NodeName.Program:
    case NodeName.BlockExpression:
    case NodeName.ParenthesisExpression: {
      let result: LogicResult = 0;
      // @TODO Why evaluate all children if only the last child's evaluate is returned?
      for (const child of queryChildren(expr, { atLeast: 1 })) {
        result = recurse(child);
      }
      return result;
    }
    case NodeName.NumberExpression: {
      const numberNode = getChild(expr, {
        ofType: NodeName.Number,
      });
      const value = parseFloat(getText(numberNode));
      // @TODO Why would this node be called "plus" when the obvious use case for it is to specify a minus?
      // @TODO Why would the leading sign not be considered part of the number literal? We could simplify the grammar parsing if we just make the sign part of the literal
      const plusNode = queryChild(expr, { ofType: NodeName.Plus });
      const sign = getText(plusNode);
      return sign === "-" ? -value : value;
    }
    case NodeName.Percentage: {
      // @TODO the original was both rounding to 2 decimals. Rounding prior to the result is a loss of precision I don't like, but I should see if it had a purpose
      const value = parseFloat(getText(expr));
      return { value: isNaN(value) ? 0 : value, unit: "%" };
    }
    case NodeName.Ternary: {
      const [condition, then, else_] = queryChildren(expr, { atLeast: 3 });
      return recurse(condition) ? recurse(then) : recurse(else_);
    }
    case NodeName.BinaryExpression: {
      const [leftNode, opNode, rightNode] = queryChildren(expr, { atLeast: 3 });
      const left = recurse(leftNode);
      const op = getText(opNode);
      const right = recurse(rightNode);

      //@TODO original liftoscript checks the left and right side types before applying an operator. Potentially to give better error messages.
      //    What is the best "dev" experience for the user?
      switch (op) {
        case "&&":
          return left && right;
        case "||":
          return left || right;
        case ">":
        case "<":
        case ">=":
        case "<=":
        case "==":
        case "!=": {
          const operator = op;
          /*
           * Compare two logic results using the specified operator
           *
           * Either side of the comparison can be an array. If so, here is how the logic resolves
           * - Both arrays: comparison checked pair wise for each element. If the arrays are of different lengths, the shorter array is padded with 0s
           * - Single array: comparison checked for each element in the array
           */

          function comparator(
            l: LogicResultSingular,
            r: LogicResultSingular,
          ): boolean {
            switch (operator) {
              case ">":
                return Weight_gt(l, r);
              case "<":
                return Weight_lt(l, r);
              case ">=":
                return Weight_gte(l, r);
              case "<=":
                return Weight_lte(l, r);
              case "==":
                return Weight_eq(l, r);
              case "!=":
                return !Weight_eq(l, r);
            }
          }
          if (Array.isArray(left)) {
            if (Array.isArray(right)) {
              const longestLength = Math.max(left.length, right.length);
              const leftPadded = pad(left, 0, longestLength);
              const rightPadded = pad(right, 0, longestLength);
              // @TODO why all this coercion to 0? Seems like a foot gun. If comparison doesn't make sense, perhaps we should propagate an error?
              return leftPadded.every((l, i) =>
                comparator(l ?? 0, rightPadded[i] ?? 0),
              );
            } else {
              return left.every((l) => comparator(l ?? 0, right ?? 0));
            }
          } else if (Array.isArray(right)) {
            return right.every((r) => comparator(left ?? 0, r ?? 0));
          } else {
            return comparator(left ?? 0, right ?? 0);
          }
        }
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
        default:
          throw new Error(`Unsupported operator ${op}`);
      }
    }

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
 * Options when querying for children of a syntax node
 */
type QueryOptions = Partial<{
  /**
   * If provided, throws an error if the node has fewer than this many children of the given type
   */
  atLeast?: number;
  /**
   * If provided, skips all children not of this type
   */
  ofType: NodeName;
  /**
   * If true, includes skipped nodes in the result. Otherwise they are skipped.
   * Defaults to false.
   */
  includeSkipped?: boolean;
}>;

/**
 * @yields all children of a syntax node, optionally restricting by type, and potentially returning nothing
 * @param node The node to get the children of
 * @param options
 * @param options.atLeast - If provided, throws an error if the node has fewer than this many children
 * @param options.ofType - If provided, only yields children of this type, and atLeast ensures that there are at least that number of children of this type
 */
function* queryChildren(
  node: SyntaxNode,
  { atLeast, ofType, includeSkipped }: QueryOptions = {},
): Generator<SyntaxNode> {
  const cur = node.cursor();
  let count = 0;
  if (!cur.firstChild()) {
    if (atLeast !== undefined && atLeast !== 0) {
      throw new SyntaxError(
        `Expected at least${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
      );
    }
    return;
  }
  do {
    if (ofType && cur.node.type.name !== ofType) {
      continue;
    }
    if (cur.node.type.isSkipped && !includeSkipped) {
      continue;
    }
    yield cur.node;
    count++;
  } while (cur.nextSibling());
  if (atLeast !== undefined && count < atLeast) {
    throw new SyntaxError(
      `Expected at least ${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
    );
  }
}

/**
 * Gets child, or throws an error if there are no children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
function getChild(node: SyntaxNode, options: QueryOptions = {}): SyntaxNode {
  const [result] = queryChildren(node, { ...options, atLeast: 1 });
  return result;
}

/**
 * Gets child, or returns undefined if there are no children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
function queryChild(
  node: SyntaxNode,
  options: QueryOptions = {},
): SyntaxNode | undefined {
  const [result] = queryChildren(node, options);
  return result;
}
