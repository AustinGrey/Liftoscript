import type { SyntaxNode } from "@lezer/common";
import type { NodeNames_Logic, TypedLogicNode } from "@/parsers/guards.ts";
import {
  type IDynamicWeight,
  type IUnit,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { z } from "zod";
import type { IExerciseType } from "@/evaluators/logic-evaluator.ts";
import type {
  ILiftoscriptEvaluatorUpdate,
  LogicResult,
  Quantity,
} from "@/logic/types.ts";

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
   */
  upsertState: (key: string, value: Quantity) => void;
  getGlobal: <TKey extends keyof IScriptBindings>(
    key: TKey,
  ) => IScriptBindings[TKey];
  updateGlobal: <TKey extends keyof IScriptBindings>(
    key: TKey,
    value: IScriptBindings[TKey],
  ) => void;
  /**
   * @TODO what are these updates for? Why can't the thing being updated be updated at the time this is created instead?
   */
  requestUpdate: <TKey extends ILiftoscriptEvaluatorUpdate["type"]>(
    key: TKey,
    value: (ILiftoscriptEvaluatorUpdate & { type: TKey })["value"],
  ) => void;
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

export interface IScriptBindings {
  day: number;
  week: number;
  dayInWeek: number;
  originalWeights: (IWeight | IDynamicWeight)[];
  weights: (IWeight | undefined)[];
  completedWeights: (IWeight | undefined)[];
  rm1: IWeight;
  reps: (number | undefined)[];
  minReps: (number | undefined)[];
  amraps: (number | undefined)[];
  askweights: (number | undefined)[];
  logrpes: (number | undefined)[];
  timers: (number | undefined)[];
  RPE: (number | undefined)[];
  completedRPE: (number | undefined)[];
  completedReps: (number | undefined)[];
  completedRepsLeft: (number | undefined)[];
  isCompleted: (0 | 1)[];
  w: (IWeight | undefined)[];
  r: (number | undefined)[];
  mr: (number | undefined)[];
  cr: (number | undefined)[];
  cw: (IWeight | undefined)[];
  ns: number;
  programNumberOfSets: number;
  numberOfSets: number;
  completedNumberOfSets: number;
  setVariationIndex: number;
  bodyweight: IWeight;
  descriptionIndex: number;
  setIndex: number;
}

export interface IScriptFnContext {
  prints: (number | IWeight | IDynamicWeight)[][];
  unit: IUnit;
  exerciseType?: IExerciseType;
}

export interface IScriptFunctions {
  roundWeight: (num: IWeight, context: IScriptFnContext) => IWeight;
  roundConvertWeight: (num: IWeight, context: IScriptFnContext) => IWeight;
  calculateTrainingMax: (
    weight: IWeight,
    reps: number,
    context: IScriptFnContext,
  ) => IWeight;
  calculate1RM: (
    weight: IWeight,
    reps: number,
    context: IScriptFnContext,
  ) => IWeight;
  rpeMultiplier: (
    reps: number,
    rpe: number,
    context: IScriptFnContext,
  ) => number;
  floor(num: number): number;
  floor(num: IWeight): IWeight;
  ceil(num: number): number;
  ceil(num: IWeight): IWeight;
  round(num: number): number;
  round(num: IWeight): IWeight;
  sum(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): number | IWeight | IDynamicWeight;
  min(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): number | IWeight | IDynamicWeight;
  max(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): number | IWeight | IDynamicWeight;
  zeroOrGte(a: number[] | IWeight[], b: number[] | IWeight[]): boolean;
  print(...args: unknown[]): (typeof args)[0];
  increment(val: IWeight, context: IScriptFnContext): IWeight;
  increment(val: IDynamicWeight, context: IScriptFnContext): IDynamicWeight;
  increment(val: number, context: IScriptFnContext): number;
  decrement(val: IWeight, context: IScriptFnContext): IWeight;
  decrement(val: IDynamicWeight, context: IScriptFnContext): IDynamicWeight;
  decrement(val: number, context: IScriptFnContext): number;
  sets(
    from: number,
    to: number,
    minReps: number,
    reps: number,
    isAmrap: number,
    weight: IWeight | IDynamicWeight | number,
    timer: number,
    rpe: number,
    logRpe: number,
    context: IScriptFnContext,
    bindings: IScriptBindings,
  ): number;
}
