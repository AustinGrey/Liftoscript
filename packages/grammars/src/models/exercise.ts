import { getUnitForExerciseType } from "@/models/equipment.ts";
import type { IExerciseType, IExerciseTypeKey } from "@/exercises";
import type { ISettings } from "@/user-settings";

export function Exercise_defaultRounding(type: IExerciseType, settings: ISettings): number {
	const units =
		getUnitForExerciseType(
			settings.units,
			settings.exerciseData,
			settings.gyms.find(g => g.id === settings.currentGymId) ?? settings.gyms[0], // @todo use getGymByIdOrCurrent - can't right now because of circular dependencies
			type,
		) ?? settings.units;
	return Math.max(
		0.1,
		settings.exerciseData[Exercise_toKey(type)]?.rounding ?? (units === "kg" ? 2.5 : 5),
	);
}

export function Exercise_toKey(type: IExerciseType): IExerciseTypeKey {
	return `${type.id}${type.equipment ? `_${type.equipment}` : ""}` as IExerciseTypeKey;
}
