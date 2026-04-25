import type * as logicTerms from "./logic.terms";
import type * as planTerms from "./workout-plan.terms";
import type { SyntaxNode } from "@lezer/common";
import {
  AndOr,
  AssignmentExpression,
  BinaryExpression,
  BlockExpression,
  BuiltinFunctionExpression,
  Cmp,
  ForExpression,
  ForInExpression,
  IfExpression,
  IncAssignment,
  IncAssignmentExpression,
  Keyword,
  LineComment,
  Not,
  Number,
  NumberExpression,
  ParenthesisExpression,
  Percentage,
  Plus,
  Program,
  StateKeyword,
  StateVariable,
  StateVariableIndex,
  Ternary,
  Times,
  UnaryExpression,
  Unit,
  Variable,
  VariableExpression,
  VariableIndex,
  WeightExpression,
  Wildcard,
} from "./logic.terms";

/**
 * Swaps keys for values in a record
 */
type Swap<T extends Record<string, string | number | symbol>> = {
  [K in keyof T as T[K]]: K;
};

type IdMap_Logic = typeof logicTerms;
type IdMap_Plan = typeof planTerms;
type NameMap_Logic = Swap<IdMap_Logic>;
type NameMap_Plan = Swap<IdMap_Plan>;

type NodeNames_Logic = keyof IdMap_Logic;
type NodeNames_Plan = keyof IdMap_Plan;
type NodeIds_Logic = IdMap_Logic[NodeNames_Logic];
type NodeIds_Plan = IdMap_Plan[NodeNames_Plan];

type TypedLogicNode<T extends NodeNames_Logic> = SyntaxNode & {
  name: T;
  type: {
    name: T;
    id: IdMap_Logic[T];
  };
};

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
export function isLogicNode<T extends NodeNames_Logic>(
  name: T,
  node: SyntaxNode,
): node is TypedLogicNode<T> {
  return node.type.name === name;
}
