import { Equipment_getUnitOrDefaultForExerciseType } from "@/models/equipment.ts";
import type { IExerciseType, IExerciseTypeKey } from "@/exercises";
import type { ISettings } from "@/user-settings";

export function Exercise_defaultRounding(
  type: IExerciseType,
  settings: ISettings,
): number {
  const units = Equipment_getUnitOrDefaultForExerciseType(settings, type);
  return Math.max(
    0.1,
    settings.exerciseData[Exercise_toKey(type)]?.rounding ??
      (units === "kg" ? 2.5 : 5),
  );
}

export function Exercise_toKey(type: IExerciseType): IExerciseTypeKey {
  return `${type.id}${type.equipment ? `_${type.equipment}` : ""}` as IExerciseTypeKey;
}
