import { TUnit, TWeight } from "@/models/weight.ts";
import { TExerciseId } from "@/exercises";
import {
  TCustomExercise,
  TExerciseDataValue,
  TExercisePickerSort,
  TGym,
  TLengthUnit,
  TMuscleGroupsSettings,
  TPlannerSettings,
  TSettingsTimers,
  TStatsEnabled,
  TTargetType,
} from "@/common-types.ts";
import { z } from "zod";

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
    workoutSettings: {
      targetType: TTargetType,
      shouldHideGraphs: z.boolean().optional(),
      shouldKeepProgramExerciseId: z.boolean().optional(),
      shouldShowInvisibleEquipment: z.boolean().optional(),
      pickerSort: TExercisePickerSort.optional(),
    },
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
