/**
 * Types which are common to multiple domains
 */

import type { LogicResult, Quantity } from "@/logic/types.ts";
import {
  type IDynamicWeight,
  type IUnit,
  type IWeight,
  TDynamicWeight,
  TUnit,
  TWeight,
} from "@/quantities/weight.ts";
import type { EvaluateTools } from "@/logic/evaluators/types.ts";
import { z } from "zod";
import { TMuscle, TScreenMuscle } from "@/human-body";
import { type IExerciseType } from "@/exercises";
import type { IBuiltinEquipment } from "@/evaluators/logic-evaluator.ts";
import type { OpenRecord } from "@/utils/types.ts";

export interface IScriptFnContext {
  prints: Quantity[][];
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
  floor: {
    (num: number): number;
    (num: IWeight): IWeight;
    (num: Exclude<LogicResult, number | IWeight>): number;
  };
  ceil: {
    (num: number): number;
    (num: IWeight): IWeight;
    (num: Exclude<LogicResult, number | IWeight>): number;
  };
  round: {
    (num: number): number;
    (num: IWeight): IWeight;
    (num: Exclude<LogicResult, number | IWeight>): number;
  };
  sum(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): Quantity;
  min(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): Quantity;
  max(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IDynamicWeight
      | IDynamicWeight[]
    )[]
  ): Quantity;
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
    tools: EvaluateTools,
  ): number;
}

/**
 * Definition of how to treat a piece of equipment for calculations
 */
export const TEquipmentData = z.strictObject({
  /**
   * The weight of the bar
   */
  bar: z.strictObject({
    // @todo why is this specified twice when a single TWeight can handle either?
    lb: TWeight,
    kg: TWeight,
  }),
  multiplier: z.number(),
  /**
   * What bar plates are available
   */
  plates: z.array(
    z.strictObject({
      weight: TWeight,
      num: z.number(),
    }),
  ),
  fixed: z.array(TWeight),
  isFixed: z.boolean(),
  unit: TUnit.optional(),
  name: z.string().optional(),
  similarTo: z.string().optional(),
  isDeleted: z.boolean().optional(),
  useBodyweightForBar: z.boolean().optional(),
  isAssisting: z.boolean().optional(),
  notes: z.string().optional(),
});
export type IEquipmentData = z.infer<typeof TEquipmentData>;
/**
 * A dictionary combining custom equipment categories with the built in ones, and the settings to use for them
 */
export type IAllEquipment = OpenRecord<
  IEquipmentData,
  | IBuiltinEquipment
  // Because the user can specify their own equipment categories, the key could be any string
  | string
>;
export const TSettingsTimers = z.strictObject({
  warmup: z.union([z.number(), z.undefined(), z.null()]),
  workout: z.union([z.number(), z.undefined(), z.null()]),
  reminder: z.number().optional(),
  superset: z.number().optional(),
});

export type ISettingsTimers = z.infer<typeof TSettingsTimers>;

export const TLengthUnit = z.enum(["in", "cm"] as const);
export type ILengthUnit = z.infer<typeof TLengthUnit>;
export const TExerciseDataValue = z.strictObject({
  rm1: TWeight.optional(),
  rounding: z.number().optional(),
  equipment: z
    .record(z.string(), z.union([z.string(), z.undefined()]))
    .optional(),
  notes: z.string().optional(),
  muscleMultipliers: z
    .record(TMuscle, z.union([z.number(), z.undefined()]))
    .optional(),
  isUnilateral: z.boolean().optional(),
});

export type IExerciseDataValue = z.infer<typeof TExerciseDataValue>;

export const TPlannerSettings = z.strictObject({
  synergistMultiplier: z.number(),
  strengthSetsPct: z.number(),
  hypertrophySetsPct: z.number(),
  weeklyRangeSets: z.record(TScreenMuscle, z.tuple([z.number(), z.number()])),
  weeklyFrequency: z.record(TScreenMuscle, z.number()),
});

export type IPlannerSettings = z.infer<typeof TPlannerSettings>;
export const TMuscleGroupsSettings = z.strictObject({
  data: z.record(
    z.string(),
    z.strictObject({
      name: z.string().optional(),
      isHidden: z.boolean().optional(),
      muscles: z.array(TMuscle).optional(),
    }),
  ),
});

export type IMuscleGroupsSettings = z.infer<typeof TMuscleGroupsSettings>;
export const targetTypes = [
  "target",
  "lasttime",
  "platescalculator",
  "e1rm",
] as const;
export const TTargetType = z.enum(targetTypes);
export const exercisePickerSorts = ["name_asc", "similar_muscles"] as const;
export const TExercisePickerSort = z.enum(exercisePickerSorts);
export const TPlate = z.object({
  weight: TWeight,
  num: z.number(),
});
export type IPlate = z.infer<typeof TPlate>;
export const TSet = z.strictObject({
  index: z.number(),
  id: z.string(),
  reps: z.number().optional(),
  originalWeight: z.union([TWeight, TDynamicWeight]).optional(),
  weight: TWeight.optional(),
  minReps: z.number().optional(),
  rpe: z.number().optional(),
  logRpe: z.boolean().optional(),
  timestamp: z.number().optional(),
  isAmrap: z.boolean().optional(),
  label: z.string().optional(),
  timer: z.number().optional(),
  askWeight: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
  isUnilateral: z.boolean().optional(),
  completedRepsLeft: z.number().optional(),
  completedReps: z.number().optional(),
  completedWeight: TWeight.optional(),
  completedRpe: z.number().optional(),
  programSetIndex: z.number().optional(),
});

export type ISet = z.infer<typeof TSet>;

/**
 * A program is stateful, as lines execute they may alter the state of the program.
 * A state is a dictionary of quantities, no other kinds of data are tracked.
 * @todo why zod this? Either Quantity should be zod'd and used here, or this should not be a zod type.
 */
export const TProgramState = z.record(
  z.string(),
  z.union([z.number(), TWeight, TDynamicWeight, z.undefined()]),
);
/**
 * @see TProgramState
 */
export type IProgramState = z.infer<typeof TProgramState>;
