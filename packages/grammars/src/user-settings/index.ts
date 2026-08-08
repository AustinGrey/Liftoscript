import { type IUnit, TUnit, TWeight, w } from "@/quantities/weight.ts";
import {
	type IExerciseType,
	TCustomExercise,
	TExerciseData,
	TExerciseId,
	toKey,
} from "@/exercises";
import {
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
		exerciseData: TExerciseData,
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
 *   - or undefined if all that fails
 * @param settings The settings object to use
 * @param gymId The id of the gym to find, if desired.
 */
export function getGymByIdOrCurrent(settings: ISettings, gymId?: string): IGym | undefined {
	return settings.gyms.find(g => g.id === (gymId ?? settings.currentGymId)) ?? settings.gyms.at(0);
}

export const getCurrentEquipment = (settings: ISettings): IAllEquipment | undefined =>
	getGymByIdOrCurrent(settings)?.equipment;

/**
 * @returns The user's equipment settings for the given exercise type
 * @param settings The settings to consider
 * @param exerciseType The type to look for
 */
function getEquipmentData(
	settings: ISettings,
	exerciseType: IExerciseType,
): IEquipmentData | undefined {
	const gym = getGymByIdOrCurrent(settings);
	if (!gym) return undefined;
	// @todo what is the string value of this function supposed to represent? The two strings it might be set to seem unrelated to each other?
	let id: string | undefined;
	if (exerciseType) {
		const key = toKey(exerciseType);
		if (
			!(
				settings.exerciseData[key] &&
				("equipment" in settings.exerciseData[key] || "rounding" in settings.exerciseData[key])
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
		(exerciseType ? getEquipmentData(settings, exerciseType) : undefined)?.unit ?? settings.units
	);
}

/**
 * Creates a "typical" settings object that can be used for tests
 * @todo what if you need a "blank" settings object?
 */
export function Settings_build(): ISettings {
	return {
		timers: {
			warmup: 90,
			workout: 180,
			reminder: 900,
		},
		units: "lb",
		graphsSettings: {
			isSameXAxis: false,
			isWithBodyweight: false,
			isWithOneRm: true,
		},
		exerciseData: {},
		graphOptions: {},
		exerciseStatsSettings: {
			ascendingSort: false,
		},
		gyms: [
			{
				id: "default",
				name: "Main",
				equipment: {
					barbell: {
						multiplier: 2,
						bar: {
							lb: w`45lb`,
							kg: w`20kg`,
						},
						plates: [
							{ weight: w`45lb`, num: 8 },
							{ weight: w`25lb`, num: 4 },
							{ weight: w`10lb`, num: 4 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`20kg`, num: 8 },
							{ weight: w`10kg`, num: 4 },
							{ weight: w`5kg`, num: 4 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [],
						isFixed: false,
					},
					trapbar: {
						multiplier: 2,
						bar: {
							lb: w`45lb`,
							kg: w`20kg`,
						},
						plates: [
							{ weight: w`45lb`, num: 8 },
							{ weight: w`25lb`, num: 4 },
							{ weight: w`10lb`, num: 4 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`20kg`, num: 8 },
							{ weight: w`10kg`, num: 4 },
							{ weight: w`5kg`, num: 4 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [],
						isFixed: false,
					},
					leverageMachine: {
						multiplier: 1,
						bar: {
							lb: w`0lb`,
							kg: w`0kg`,
						},
						plates: [
							{ weight: w`45lb`, num: 8 },
							{ weight: w`25lb`, num: 4 },
							{ weight: w`10lb`, num: 4 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`20kg`, num: 8 },
							{ weight: w`10kg`, num: 4 },
							{ weight: w`5kg`, num: 4 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [],
						isFixed: false,
					},
					smith: {
						multiplier: 2,
						bar: {
							lb: w`45lb`,
							kg: w`20kg`,
						},
						plates: [
							{ weight: w`45lb`, num: 8 },
							{ weight: w`25lb`, num: 4 },
							{ weight: w`10lb`, num: 4 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`20kg`, num: 8 },
							{ weight: w`10kg`, num: 4 },
							{ weight: w`5kg`, num: 4 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [],
						isFixed: false,
					},
					dumbbell: {
						multiplier: 2,
						bar: {
							lb: w`10lb`,
							kg: w`5kg`,
						},
						plates: [
							{ weight: w`10lb`, num: 8 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`5kg`, num: 8 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [
							w`10lb`,
							w`15lb`,
							w`20lb`,
							w`25lb`,
							w`30lb`,
							w`35lb`,
							w`40lb`,
							w`4kg`,
							w`6kg`,
							w`8kg`,
							w`10kg`,
							w`12kg`,
							w`14kg`,
							w`20kg`,
						],
						isFixed: false,
					},
					ezbar: {
						multiplier: 2,
						bar: {
							lb: w`20lb`,
							kg: w`10kg`,
						},
						plates: [
							{ weight: w`45lb`, num: 8 },
							{ weight: w`25lb`, num: 4 },
							{ weight: w`10lb`, num: 4 },
							{ weight: w`5lb`, num: 4 },
							{ weight: w`2.5lb`, num: 4 },
							{ weight: w`1.25lb`, num: 2 },
							{ weight: w`20kg`, num: 8 },
							{ weight: w`10kg`, num: 4 },
							{ weight: w`5kg`, num: 4 },
							{ weight: w`2.5kg`, num: 4 },
							{ weight: w`1.25kg`, num: 4 },
							{ weight: w`0.5kg`, num: 2 },
						],
						fixed: [],
						isFixed: false,
					},
					cable: {
						multiplier: 1,
						bar: {
							lb: w`0lb`,
							kg: w`0kg`,
						},
						plates: [
							{
								weight: w`10lb`,
								num: 20,
							},
							{
								weight: w`5lb`,
								num: 10,
							},
							{
								weight: w`5kg`,
								num: 20,
							},
							{
								weight: w`2.5kg`,
								num: 10,
							},
						],
						fixed: [],
						isFixed: false,
					},
					kettlebell: {
						multiplier: 1,
						bar: {
							lb: w`0lb`,
							kg: w`0kg`,
						},
						plates: [],
						fixed: [
							w`10lb`,
							w`15lb`,
							w`20lb`,
							w`25lb`,
							w`30lb`,
							w`35lb`,
							w`40lb`,
							w`4kg`,
							w`8kg`,
							w`12kg`,
							w`16kg`,
							w`24kg`,
						],
						isFixed: true,
					},
				},
			},
		],
		deletedGyms: [],
		volume: 1.0,
		vibration: false,
		startWeekFromMonday: false,
		lengthUnits: "in",
		workoutSettings: {
			targetType: "target",
		},
		exercises: {},
		planner: {
			strengthSetsPct: 30,
			hypertrophySetsPct: 70,
			weeklyRangeSets: {
				shoulders: [10, 12],
				triceps: [10, 12],
				back: [10, 12],
				abs: [10, 12],
				glutes: [10, 12],
				hamstrings: [10, 12],
				quadriceps: [10, 12],
				chest: [10, 12],
				biceps: [10, 12],
				calves: [10, 12],
				forearms: [10, 12],
			},
			weeklyFrequency: {
				shoulders: 2,
				triceps: 2,
				back: 2,
				abs: 2,
				glutes: 2,
				hamstrings: 2,
				quadriceps: 2,
				chest: 2,
				biceps: 2,
				calves: 2,
				forearms: 2,
			},
			synergistMultiplier: 0.5,
		},
		muscleGroups: {
			data: {},
		},
	};
}
