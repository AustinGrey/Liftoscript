import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/parsers/guards.ts";
import type {
  IProgramState,
  LogicHandler,
  LogicResult,
  SourceTools,
} from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import { parser } from "@/parsers/logic.ts";
import { LiftoscriptSyntaxError } from "@/evaluators/logic-evaluator.ts";

/**
 * Dictionary of evaluation methods for different logic nodes.
 */
const handlers: {
  [Key in NodeNames_Logic]: LogicHandler<Key>;
} = {
  AndOr: (n, t) => t.error("Not implemented", n),
  AssignmentExpression: (n, t) => t.error("Not implemented", n),
  BinaryExpression: (await import("./node-binary-expression")).handler,
  BlockExpression: (n, t) => t.error("Not implemented", n),
  BuiltinFunctionExpression: (n, t) => t.error("Not implemented", n),
  Cmp: (n, t) => t.error("Not implemented", n),
  ForExpression: (n, t) => t.error("Not implemented", n),
  ForInExpression: (n, t) => t.error("Not implemented", n),
  IfExpression: (n, t) => t.error("Not implemented", n),
  IncAssignment: (n, t) => t.error("Not implemented", n),
  IncAssignmentExpression: (n, t) => t.error("Not implemented", n),
  Keyword: (n, t) => t.error("Not implemented", n),
  LineComment: (await import("./node-line-comment")).handler,
  Not: (n, t) => t.error("Not implemented", n),
  Number: (n, t) => t.error("Not implemented", n),
  NumberExpression: (await import("./node-number-expression")).handler,
  ParenthesisExpression: (n, t) => t.error("Not implemented", n),
  Percentage: (await import("./node-percentage")).handler,
  Plus: (n, t) => t.error("Not implemented", n),
  Program: (await import("./node-program")).handler,
  StateKeyword: (n, t) => t.error("Not implemented", n),
  StateVariable: (n, t) => t.error("Not implemented", n),
  StateVariableIndex: (n, t) => t.error("Not implemented", n),
  Ternary: (await import("./node-ternary")).handler,
  Times: (n, t) => t.error("Not implemented", n),
  UnaryExpression: (n, t) => t.error("Not implemented", n),
  Unit: (n, t) => t.error("Not implemented", n),
  Variable: (n, t) => t.error("Not implemented", n),
  VariableExpression: (n, t) => t.error("Not implemented", n),
  VariableIndex: (n, t) => t.error("Not implemented", n),
  WeightExpression: (await import("./node-weight-expression")).handler,
  Wildcard: (n, t) => t.error("Not implemented", n),
};

function handleLogic(node: SyntaxNode, tools: SourceTools): LogicResult {
  const handler: LogicHandler<NodeNames_Logic> | undefined = isLogicNodeName(
    node.name,
  )
    ? (handlers[node.name] as LogicHandler<NodeNames_Logic>)
    : undefined;
  if (!handler) {
    return tools.error(`No handler for node type: ${node.type}`, node);
  }
  const state: IProgramState = {};
  return handler(node as TypedLogicNode<NodeNames_Logic>, {
    ...tools,
    recurse: (node) => handleLogic(node, tools),
  });
}

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
export function run(logic: string): LogicResult {
  return handleLogic(parser.parse(logic).topNode, {
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
