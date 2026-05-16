import { Equipment_getUnitOrDefaultForExerciseType } from "@/models/equipment.ts";
import type { IExerciseType, ISettings } from "@/common-types.ts";

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

export function Exercise_toKey(type: IExerciseType): string {
  return `${type.id}${type.equipment ? `_${type.equipment}` : ""}`;
}
