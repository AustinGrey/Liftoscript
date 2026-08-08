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

export function Equipment_getUnitForExerciseType(
	settings: ISettings,
	exerciseType?: IExerciseType,
): IUnit | undefined {
	const equipment = Equipment_getEquipmentDataForExerciseType(
		settings,
		settings.exerciseData,
		exerciseType,
	);
	const equipmentUnit = equipment?.unit;
	return equipmentUnit == null || equipmentUnit === settings.units ? undefined : equipmentUnit;
}

export function Equipment_getUnitOrDefaultForExerciseType(
	settings: ISettings,
	exerciseType?: IExerciseType,
): IUnit {
	const equipment = Equipment_getEquipmentDataForExerciseType(
		settings,
		settings.exerciseData,
		exerciseType,
	);
	return equipment?.unit ?? settings.units;
}

export function Equipment_getEquipmentDataForExerciseType(
	settings: ISettings,
	exerciseData: IExerciseData,
	exerciseType?: IExerciseType,
): IEquipmentData | undefined {
	if (exerciseType == null) {
		return undefined;
	}

	const currentGym = getGymByIdOrCurrent(settings);

	const { equipment: fallbackEquipment, rounding } =
		exerciseData[Exercise_toKey(exerciseType)] ?? {};
	const equipmentId = !rounding ? exerciseType.equipment : fallbackEquipment?.[currentGym.id];
	return equipmentId ? currentGym.equipment[equipmentId] : undefined;
}

function getGymByIdOrCurrent(settings: ISettings, gymId?: string): IGym {
	return settings.gyms.find(g => g.id === (gymId ?? settings.currentGymId)) ?? settings.gyms[0];
}
