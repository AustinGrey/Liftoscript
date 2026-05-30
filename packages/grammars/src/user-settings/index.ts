import { type IUnit, TUnit, TWeight } from "@/quantities/weight.ts";
import {
  type IExerciseType,
  TCustomExercise,
  TExerciseId,
  TExerciseTypeKey,
  toKey,
} from "@/exercises";
import {
  TExerciseDataValue,
  TExercisePickerSort,
  TLengthUnit,
  TMuscleGroupsSettings,
  TPlannerSettings,
  TSettingsTimers,
  TTargetType,
} from "@/common-types.ts";
import { z } from "zod";
import { type IGym, TGym } from "@/gyms";
import type { IAllEquipment, IEquipmentData } from "@/equipment";

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

/**
 * @returns The user's equipment settings for the given exercise type
 * @param settings The settings to consider
 * @param exerciseType The type to look for
 */
function getEquipmentData(
  settings: ISettings,
  exerciseType: IExerciseType,
): IEquipmentData | undefined {
  const gym = getCurrentGym(settings);
  // @todo what is the string value of this function supposed to represent? The two strings it might be set to seem unrelated to each other?
  let id: string | undefined;
  if (exerciseType) {
    const key = toKey(exerciseType);
    if (
      !(
        settings.exerciseData[key] &&
        ("equipment" in settings.exerciseData[key] ||
          "rounding" in settings.exerciseData[key])
      )
    ) {
      id = exerciseType.equipment;
    } else {
      id = settings.exerciseData[key]?.equipment?.[gym.id];
    }
  }
  return id ? gym.equipment[id] : undefined;
}

/**
 * @returns The user's preferred unit for a given situation. This might be a fallback default if no preferred unit can be determined for that situation.
 * @param settings The settings where any preferred units might be specified
 * @param exerciseType If getting the units in the context of an exercise type, this is the type to consider, since a user might have different preferences for different exercise types.
 */
export function getPreferredUnit(
  settings: ISettings,
  exerciseType: IExerciseType | undefined,
): IUnit {
  return (
    (exerciseType ? getEquipmentData(settings, exerciseType) : undefined)
      ?.unit ?? settings.units
  );
}
