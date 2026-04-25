import type { SyntaxNode } from "@lezer/common";
import type { NodeNames_Logic, TypedLogicNode } from "@/parsers/guards.ts";
import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { z } from "zod";

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
  /**
   * Gets the value of a state variable. If the state variable is not found, it throws an error.
   * @param key The key of the state variable
   * @param relatedNode The node that caused this action
   */
  getState: (key: string, relatedNode: SyntaxNode) => Quantity;
  /**
   * Updates the value of a state variable. If the state variable is not found, it throws an error.
   * @param key The key of the state variable
   * @param value The new value of the state variable
   * @param relatedNode The node that caused this action
   */
  updateState: (key: string, value: Quantity, relatedNode: SyntaxNode) => void;
  /**
   * Updates the value of a state variable. If the state variable is not found, it creates a new one.
   * @param key The key of the state variable
   * @param value The new value of the state variable
   * @param relatedNode The node that caused this action
   */
  upsertState: (key: string, value: Quantity, relatedNode: SyntaxNode) => void;
};

/**
 * A program is stateful, as lines execute they may alter the state of the program.
 * A state is a dictionary of quantities, no other kinds of data are tracked.
 * @todo why zod this? Either Quantity should be zod'd and used here, or this should not be a zod type.
 */
export const TProgramState = z.record(
  z.string(),
  z.union([z.number(), TWeight, TDynamicWeight]),
);
/**
 * @see TProgramState
 */
export type IProgramState = z.infer<typeof TProgramState>;
