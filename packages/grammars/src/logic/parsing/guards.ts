import * as logicTerms from "./logic.terms.ts";
import {
  type SourcedSyntaxNode,
  parseBound as originalParseBound,
} from "@/utils/lezer.ts";
import {
  type QueryOptions,
  getChild as originalGetChild,
  queryChildren as originalQueryChildren,
  queryChild as originalQueryChild,
  queryTree as originalQueryTree,
} from "@/utils/grammars.ts";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";

type IdMap_Logic = typeof logicTerms;

export type NodeNames_Logic = keyof IdMap_Logic;

export type TypedLogicNode<T extends NodeNames_Logic> = SourcedSyntaxNode & {
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
export function isLogicNodeOfType<T extends NodeNames_Logic>(
  name: T,
  node: SourcedSyntaxNode | undefined,
): node is TypedLogicNode<T> {
  return node?.type.name === name;
}

export function isLogicNodeName(name: string): name is NodeNames_Logic {
  return name in logicTerms;
}

/**
 * Gets child, or throws an error if there are no (matching) children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function getChild<TTypes extends NodeNames_Logic>(
  node: TypedLogicNode<NodeNames_Logic>,
  options: QueryOptions<TTypes> = {},
): TypedLogicNode<TTypes> {
  return originalGetChild(node, options) as TypedLogicNode<TTypes>;
}

/**
 * Gets child, or returns undefined if there are no (matching) children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function queryChild<TTypes extends NodeNames_Logic>(
  node: TypedLogicNode<NodeNames_Logic>,
  options: QueryOptions<TTypes> = {},
): TypedLogicNode<TTypes> | undefined {
  return originalQueryChild(node, options) as TypedLogicNode<TTypes>;
}

/**
 * @yields all children of a syntax node, optionally restricting by type, and potentially returning nothing
 * @param node The node to get the children of
 * @param options
 * @param options.atLeast - If provided, throws an error if the node has fewer than this many children
 * @param options.ofType - If provided, only yields children of this type, and atLeast ensures that there are at least that number of children of this type
 */
export function* queryChildren<TTypes extends NodeNames_Logic>(
  node: TypedLogicNode<NodeNames_Logic>,
  options?: QueryOptions<TTypes>,
): Generator<TypedLogicNode<TTypes>> {
  yield* originalQueryChildren(node, options) as Generator<
    TypedLogicNode<TTypes>
  >;
}

/**
 * Gets all nodes in the tree of the node that is passed
 * @param node The node that is the root of the tree
 * @param where The filter function to use
 */
export function* queryTree(
  node: TypedLogicNode<NodeNames_Logic>,
  where?: (node: TypedLogicNode<NodeNames_Logic>) => boolean,
): Generator<TypedLogicNode<NodeNames_Logic>> {
  yield* originalQueryTree(
    node,
    where as Parameters<typeof originalQueryTree>[1],
  ) as Generator<TypedLogicNode<NodeNames_Logic>>;
}

/**
 * Parses the given script, using the logic parser, and binds the script to the returned nodes so that it can be accessed later when needed.
 * Lezer parsers normally require you to store the original script and use it to get the original text a node covers, but this simplifies all that storage.
 * @param script The script to parse
 */
export function parseBound(script: string): TypedLogicNode<NodeNames_Logic> {
  return originalParseBound(
    LiftoscriptParser,
    script,
  ) as TypedLogicNode<NodeNames_Logic>;
}
