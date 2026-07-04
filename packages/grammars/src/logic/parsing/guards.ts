import * as logicTerms from "./logic.terms.ts";
import type { SourcedSyntaxNode } from "@/utils/lezer.ts";

type IdMap_Logic = typeof logicTerms;

export type NodeNames_Logic = keyof IdMap_Logic;

export type TypedLogicNode<T extends NodeNames_Logic> = SourcedSyntaxNode & {
  name: T;
  type: {
    name: T;
    id: IdMap_Logic[T];
  };
};

export enum LogicNodeName {
  LineComment = "LineComment",
  Program = "Program",
  BinaryExpression = "BinaryExpression",
  Plus = "Plus",
  Times = "Times",
  Cmp = "Cmp",
  AndOr = "AndOr",
  NumberExpression = "NumberExpression",
  Number = "Number",
  Percentage = "Percentage",
  WeightExpression = "WeightExpression",
  ParenthesisExpression = "ParenthesisExpression",
  BlockExpression = "BlockExpression",
  Ternary = "Ternary",
  IfExpression = "IfExpression",
  ForExpression = "ForExpression",
  ForInExpression = "ForInExpression",
  If = "If",
  Else = "Else",
  AssignmentExpression = "AssignmentExpression",
  IncAssignmentExpression = "IncAssignmentExpression",
  StateVariable = "StateVariable",
  StateVariableIndex = "StateVariableIndex",
  Variable = "Variable",
  BuiltinFunctionExpression = "BuiltinFunctionExpression",
  Keyword = "Keyword",
  VariableExpression = "VariableExpression",
  VariableIndex = "VariableIndex",
  Current = "Current",
  Wildcard = "Wildcard",
  UnaryExpression = "UnaryExpression",
  Not = "Not",
  Unit = "Unit",
}

export namespace LogicNodes {
  export type LineComment = TypedLogicNode<"LineComment">;
  export type Program = TypedLogicNode<"Program">;
  export type BinaryExpression = TypedLogicNode<"BinaryExpression">;
  export type Plus = TypedLogicNode<"Plus">;
  export type Times = TypedLogicNode<"Times">;
  export type Cmp = TypedLogicNode<"Cmp">;
  export type AndOr = TypedLogicNode<"AndOr">;
  export type NumberExpression = TypedLogicNode<"NumberExpression">;
  export type Number = TypedLogicNode<"Number">;
  export type WeightExpression = TypedLogicNode<"WeightExpression">;
  export type Unit = TypedLogicNode<"Unit">;
  export type Percentage = TypedLogicNode<"Percentage">;
  export type ParenthesisExpression = TypedLogicNode<"ParenthesisExpression">;
  export type BlockExpression = TypedLogicNode<"BlockExpression">;
  export type Ternary = TypedLogicNode<"Ternary">;
  export type IfExpression = TypedLogicNode<"IfExpression">;
  export type Keyword = TypedLogicNode<"Keyword">;
  export type ForExpression = TypedLogicNode<"ForExpression">;
  export type Variable = TypedLogicNode<"Variable">;
  export type ForInExpression = TypedLogicNode<"ForInExpression">;
  export type AssignmentExpression = TypedLogicNode<"AssignmentExpression">;
  export type StateVariable = TypedLogicNode<"StateVariable">;
  export type StateKeyword = TypedLogicNode<"StateKeyword">;
  export type StateVariableIndex = TypedLogicNode<"StateVariableIndex">;
  export type VariableExpression = TypedLogicNode<"VariableExpression">;
  export type VariableIndex = TypedLogicNode<"VariableIndex">;
  export type Wildcard = TypedLogicNode<"Wildcard">;
  export type IncAssignmentExpression =
    TypedLogicNode<"IncAssignmentExpression">;
  export type IncAssignment = TypedLogicNode<"IncAssignment">;
  export type BuiltinFunctionExpression =
    TypedLogicNode<"BuiltinFunctionExpression">;
  export type UnaryExpression = TypedLogicNode<"UnaryExpression">;
  export type Not = TypedLogicNode<"Not">;
}

/**
 * Typeguards a generic SyntaxNode into a specific type of node
 * @param name The Syntax kind to guard to
 * @param node The node to guard
 */
export function isLogicNodeOfType<T extends NodeNames_Logic>(
  name: T,
  node: SourcedSyntaxNode,
): node is TypedLogicNode<T> {
  return node.type.name === name;
}

export function isLogicNodeName(name: string): name is NodeNames_Logic {
  return name in logicTerms;
}
