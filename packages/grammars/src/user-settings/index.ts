import { TUnit, TWeight } from "@/models/weight.ts";
import { TExerciseId, TExerciseTypeKey } from "@/exercises";
import {
  type IAllEquipment,
  TCustomExercise,
  TExerciseDataValue,
  TExercisePickerSort,
  TLengthUnit,
  TMuscleGroupsSettings,
  TPlannerSettings,
  TSettingsTimers,
  TStatsEnabled,
  TTargetType,
} from "@/common-types.ts";
import { z } from "zod";
import { type IGym, TGym } from "@/gyms";

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
    exerciseData: z.record(TExerciseTypeKey, TExerciseDataValue),
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

/**
 * @returns The first gym found from this list
 *   - The gym in the settings with the provided id
 *   - The gym in the settings matching the currentGymId in the settings
 *   - The first gym
 *   - @todo what if this list is empty? The types are wrong here and I think this should throw? Or create a default gym?
 * @param settings The settings object to use
 * @param gymId The id of the gym to find, if desired.
 */
export function getGymByIdOrCurrent(settings: ISettings, gymId?: string): IGym {
  const targetId = gymId ?? settings.currentGymId;
  return settings.gyms.find((g) => g.id === targetId) ?? settings.gyms[0];
}

export const getCurrentGym = (settings: ISettings): IGym =>
  getGymByIdOrCurrent(settings);

export const getCurrentEquipment = (settings: ISettings): IAllEquipment =>
  getCurrentGym(settings)?.equipment;
