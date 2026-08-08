import type { IUnit, IWeight } from "@/quantities/weight.ts";
import * as Weight from "@/quantities/weight.ts";
import { Exercise_toKey } from "@/models/exercise.ts";
import type { IExerciseData, IExerciseType } from "@/exercises";
import type { ISettings } from "@/user-settings";
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

export function getUnitForExerciseType(
	settings: ISettings,
	gym: IGym | undefined,
	exerciseType?: IExerciseType,
): IUnit | undefined {
	const equipment = Equipment_getEquipmentDataForExerciseType(
		gym,
		settings.exerciseData,
		exerciseType,
	);
	return equipment?.unit == null || equipment.unit === settings.units ? undefined : equipment.unit;
}

export function Equipment_getEquipmentDataForExerciseType(
	gym: IGym | undefined,
	exerciseData: IExerciseData,
	exerciseType?: IExerciseType,
): IEquipmentData | undefined {
	if (exerciseType == null) {
		return undefined;
	}

	const { equipment: fallbackEquipment, rounding } =
		exerciseData[Exercise_toKey(exerciseType)] ?? {};
	const equipmentId = !rounding
		? exerciseType.equipment
		: gym
			? fallbackEquipment?.[gym.id]
			: undefined;
	return equipmentId ? gym?.equipment[equipmentId] : undefined;
}
