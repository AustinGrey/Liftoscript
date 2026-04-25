import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/parsers/guards.ts";
import type { LogicHandler, SourceTools } from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import type { LogicResult } from "@/evaluators/logic.ts";

/**
 * Dictionary of evaluation methods for different logic nodes.
 */
const handlers: {
  [Key in NodeNames_Logic]: LogicHandler<Key>;
} = {
  LineComment: (await import("./line-comment")).handler,
  Program: (n, t) => t.error("Not implemented", n),
  BinaryExpression: (n, t) => t.error("Not implemented", n),
  Plus: (n, t) => t.error("Not implemented", n),
  Times: (n, t) => t.error("Not implemented", n),
  Cmp: (n, t) => t.error("Not implemented", n),
  AndOr: (n, t) => t.error("Not implemented", n),
  NumberExpression: (n, t) => t.error("Not implemented", n),
  Number: (n, t) => t.error("Not implemented", n),
  WeightExpression: (n, t) => t.error("Not implemented", n),
  Unit: (n, t) => t.error("Not implemented", n),
  Percentage: (n, t) => t.error("Not implemented", n),
  ParenthesisExpression: (n, t) => t.error("Not implemented", n),
  BlockExpression: (n, t) => t.error("Not implemented", n),
  Ternary: (n, t) => t.error("Not implemented", n),
  IfExpression: (n, t) => t.error("Not implemented", n),
  Keyword: (n, t) => t.error("Not implemented", n),
  ForExpression: (n, t) => t.error("Not implemented", n),
  Variable: (n, t) => t.error("Not implemented", n),
  ForInExpression: (n, t) => t.error("Not implemented", n),
  AssignmentExpression: (n, t) => t.error("Not implemented", n),
  StateVariable: (n, t) => t.error("Not implemented", n),
  StateKeyword: (n, t) => t.error("Not implemented", n),
  StateVariableIndex: (n, t) => t.error("Not implemented", n),
  VariableExpression: (n, t) => t.error("Not implemented", n),
  VariableIndex: (n, t) => t.error("Not implemented", n),
  Wildcard: (n, t) => t.error("Not implemented", n),
  IncAssignmentExpression: (n, t) => t.error("Not implemented", n),
  IncAssignment: (n, t) => t.error("Not implemented", n),
  BuiltinFunctionExpression: (n, t) => t.error("Not implemented", n),
  UnaryExpression: (n, t) => t.error("Not implemented", n),
  Not: (n, t) => t.error("Not implemented", n),
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
  return handler(node as TypedLogicNode<NodeNames_Logic>, tools);
}
