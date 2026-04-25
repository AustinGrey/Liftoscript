import type { SyntaxNode } from "@lezer/common";
import type { NodeNames_Logic, TypedLogicNode } from "@/parsers/guards.ts";
import type { IDynamicWeight, IWeight } from "@/models/weight.ts";

export type Quantity = number | IWeight | IDynamicWeight;
export type LogicResultSingular = Quantity | boolean | undefined;
export type LogicResult = LogicResultSingular | LogicResultSingular[];
export type LogicHandler<T extends NodeNames_Logic> = (
  node: TypedLogicNode<T>,
  tools: EvaluateTools,
) => LogicResult;
/**
 * Tools related to the original source code. This keeps the evaluator from needing to know about the source code
 */
export type SourceTools = {
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

export type EvaluateTools = SourceTools & {
  /**
   * Continues evaluation into a node, using the same tools as the existing context
   */
  recurse: (node: SyntaxNode) => LogicResult;
};
