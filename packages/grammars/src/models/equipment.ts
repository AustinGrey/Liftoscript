import type { IUnit, IWeight } from "@/quantities/weight.ts";
import * as Weight from "@/quantities/weight.ts";
import { Exercise_toKey } from "@/models/exercise.ts";
import type { IExerciseData, IExerciseType } from "@/exercises";
import type { IGym } from "@/gyms";
import type { IEquipmentData } from "@/equipment";

export function Equipment_smallestPlate(equipmentData: IEquipmentData, unit: IUnit): IWeight {
	return (
		equipmentData.plates
			.filter(p => p.weight.unit === unit)
			.toSorted((a, b) => Weight.compare(a.weight, b.weight))
			.at(0)?.weight || Weight.build(1, unit)
	);
}

/**
 * Gets what unit to use for the given exercise type.
 * @param defaultUnit The user's preferred unit.
 * @param exerciseData The information about all known exercises
 * @param gym The gym to consider, as different gyms mean different equipment mean different units
 * @param exerciseType The exercise type to get the units for
 * @returns the unit to use, or undefined if the defaultUnit should be used. @todo why undefined? Why not just return the default unit for better type safety?
 */
export function getUnitForExerciseType(
	defaultUnit: IUnit,
	exerciseData: IExerciseData,
	gym: IGym | undefined,
	exerciseType: IExerciseType | undefined,
): IUnit | undefined {
	const equipment = getEquipmentDataForExerciseType(gym, exerciseData, exerciseType);
	return equipment?.unit == null || equipment.unit === defaultUnit ? undefined : equipment.unit;
}

export function getEquipmentDataForExerciseType(
	gym: IGym | undefined,
	exerciseData: IExerciseData,
	exerciseType: IExerciseType | undefined,
): IEquipmentData | undefined {
	if (exerciseType == null) {
		return undefined;
	}

	const { equipment: fallbackEquipment, rounding } =
		exerciseData[Exercise_toKey(exerciseType)] ?? {};
	const equipmentId = !rounding // @todo why does the existance of a rounding field decide which equipment to use?
		? exerciseType.equipment
		: gym
			? fallbackEquipment?.[gym.id]
			: undefined;
	return equipmentId ? gym?.equipment[equipmentId] : undefined;
}
