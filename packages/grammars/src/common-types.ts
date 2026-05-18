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
} from "@/models/weight.ts";
import type { EvaluateTools } from "@/logic/evaluators/types.ts";
import { z } from "zod";
import { TBodyPart, TMuscle, TScreenMuscle } from "@/human-body";
import {
  type IExerciseType,
  TEquipment,
  TExerciseId,
  TExerciseKind,
  TExerciseType,
} from "@/exercises";

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

export const TEquipmentData = z
  .object({
    vtype: z.literal("equipment_data"),
    bar: z
      .object({
        lb: TWeight,
        kg: TWeight,
      })
      .strict(),
    multiplier: z.number(),
    plates: z.array(
      z
        .object({
          weight: TWeight,
          num: z.number(),
        })
        .strict(),
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
  })
  .strict();
export type IEquipmentData = z.infer<typeof TEquipmentData>;
export type IAllEquipment = Partial<Record<string, IEquipmentData>>;
export const TGym = z
  .object({
    vtype: z.literal("gym"),
    id: z.string(),
    name: z.string(),
    equipment: z.record(TEquipment, z.union([TEquipmentData, z.undefined()])),
  })
  .strict();
export type IGym = z.infer<typeof TGym>;
export const TSettingsTimers = z
  .object({
    warmup: z.union([z.number(), z.undefined(), z.null()]),
    workout: z.union([z.number(), z.undefined(), z.null()]),
    reminder: z.number().optional(),
    superset: z.number().optional(),
  })
  .strict();

export type ISettingsTimers = z.infer<typeof TSettingsTimers>;

export const TMetaExercises = z
  .object({
    bodyParts: z.array(TBodyPart),
    targetMuscles: z.array(TMuscle),
    synergistMuscles: z.array(TMuscle),

    sortedEquipment: z.array(TEquipment).optional(),
  })
  .strict();
export type IMetaExercises = z.infer<typeof TMetaExercises>;
export const TCustomExercise = z
  .object({
    vtype: z.literal("custom_exercise"),
    id: TExerciseId,
    name: z.string(),
    isDeleted: z.boolean(),
    meta: TMetaExercises,

    defaultEquipment: TEquipment.optional(),
    types: z.array(TExerciseKind).optional(),
    clonedFrom: TExerciseType.optional(),
    reuseImageFrom: TExerciseType.optional(),
    largeImageUrl: z.string().optional(),
    smallImageUrl: z.string().optional(),
  })
  .strict();

export type ICustomExercise = z.infer<typeof TCustomExercise>;
export const TStatsWeightEnabled = z
  .object({
    weight: z.boolean(),
  })
  .partial()
  .strict();

export type IStatsWeightEnabled = z.infer<typeof TStatsWeightEnabled>;
export const TStatsLengthEnabled = z
  .object({
    neck: z.boolean(),
    shoulders: z.boolean(),
    bicepLeft: z.boolean(),
    bicepRight: z.boolean(),
    forearmLeft: z.boolean(),
    forearmRight: z.boolean(),
    chest: z.boolean(),
    waist: z.boolean(),
    hips: z.boolean(),
    thighLeft: z.boolean(),
    thighRight: z.boolean(),
    calfLeft: z.boolean(),
    calfRight: z.boolean(),
  })
  .partial()
  .strict();
export type IStatsLengthEnabled = z.infer<typeof TStatsLengthEnabled>;
export const TStatsPercentageEnabled = z
  .object({
    bodyfat: z.boolean(),
  })
  .partial()
  .strict();
export const TStatsEnabled = z
  .object({
    weight: TStatsWeightEnabled,
    length: TStatsLengthEnabled,
    percentage: TStatsPercentageEnabled,
  })
  .strict();

export type IStatsEnabled = Readonly<z.infer<typeof TStatsEnabled>>;
export const lengthUnits = ["in", "cm"] as const;
export const TLengthUnit = z.enum(lengthUnits);
export type ILengthUnit = z.infer<typeof TLengthUnit>;
export const TExerciseDataValue = z
  .object({
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
  })
  .strict();

export type IExerciseDataValue = z.infer<typeof TExerciseDataValue>;

export const TPlannerSettings = z
  .object({
    synergistMultiplier: z.number(),
    strengthSetsPct: z.number(),
    hypertrophySetsPct: z.number(),
    weeklyRangeSets: z.record(TScreenMuscle, z.tuple([z.number(), z.number()])),
    weeklyFrequency: z.record(TScreenMuscle, z.number()),
  })
  .strict();

export type IPlannerSettings = z.infer<typeof TPlannerSettings>;
export const TMuscleGroupsSettings = z
  .object({
    vtype: z.literal("muscle_groups_settings"),
    data: z.record(
      z.string(),
      z
        .object({
          name: z.string().optional(),
          isHidden: z.boolean().optional(),
          muscles: z.array(TMuscle).optional(),
        })
        .strict(),
    ),
  })
  .strict();

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
const TWorkoutSettings = z.object({
  targetType: TTargetType,
  shouldHideGraphs: z.boolean().optional(),
  shouldKeepProgramExerciseId: z.boolean().optional(),
  shouldShowInvisibleEquipment: z.boolean().optional(),
  pickerSort: TExercisePickerSort.optional(),
});
//@todo restore the commented out settings, or prune them entirely since they don't impact evaluating logic
export const TSettings = z
  .object({
    timers: TSettingsTimers,
    gyms: z.array(TGym),
    deletedGyms: z.array(z.string()),
    // graphs: TGraphs,
    graphOptions: z.record(
      z.string(),
      z.object({
        movingAverageWindowSize: z.number().optional(),
      }),
    ),
    graphsSettings: z
      .object({
        isSameXAxis: z.boolean().optional(),
        isWithBodyweight: z.boolean().optional(),
        isWithOneRm: z.boolean().optional(),
        isWithProgramLines: z.boolean().optional(),
        // defaultType: TGraphExerciseSelectedType.optional(),
        // defaultMuscleGroupType: TGraphMuscleGroupSelectedType.optional(),
      })
      .optional(),
    exerciseStatsSettings: z
      .object({
        ascendingSort: z.boolean().optional(),
        hideWithoutWorkoutNotes: z.boolean().optional(),
        hideWithoutExerciseNotes: z.boolean().optional(),
      })
      .optional(),
    exercises: z.record(z.string(), TCustomExercise),
    statsEnabled: TStatsEnabled,
    units: TUnit,
    lengthUnits: TLengthUnit,
    volume: z.number(),
    exerciseData: z.record(z.string(), TExerciseDataValue),
    planner: TPlannerSettings,
    workoutSettings: TWorkoutSettings,
    muscleGroups: TMuscleGroupsSettings,

    appleHealthSyncWorkout: z.boolean().optional(),
    appleHealthSyncMeasurements: z.boolean().optional(),
    appleHealthAnchor: z.string().optional(),
    googleHealthSyncWorkout: z.boolean().optional(),
    googleHealthSyncMeasurements: z.boolean().optional(),
    googleHealthAnchor: z.string().optional(),
    healthConfirmation: z.boolean().optional(),
    ignoreDoNotDisturb: z.boolean().optional(),
    currentGymId: z.string().optional(),
    isPublicProfile: z.boolean().optional(),
    nickname: z.string().optional(),
    alwaysOnDisplay: z.boolean().optional(),
    vibration: z.boolean().optional(),
    startWeekFromMonday: z.boolean().optional(),
    textSize: z.number().optional(),
    starredExercises: z.record(TExerciseId, z.boolean()).optional(),
    theme: z.enum(["dark", "light"]).optional(),
    currentBodyweight: TWeight.optional(),
    affiliateEnabled: z.boolean().optional(),
  })
  .strict();
export type ISettings = z.infer<typeof TSettings>;
export const TPlate = z.object({
  weight: TWeight,
  num: z.number(),
});
export type IPlate = z.infer<typeof TPlate>;
export const TSet = z
  .object({
    vtype: z.literal("set"),
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
  })
  .strict();

export type ISet = z.infer<typeof TSet>;

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
