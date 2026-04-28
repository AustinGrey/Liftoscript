import type {
  IExerciseType,
  IGym,
  ISettings,
} from "@/logic/evaluators/types.ts";
import type { IUnit } from "@/models/weight.ts";
import type { IEquipmentData } from "@/evaluators/logic-evaluator.ts";

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

export function Equipment_getUnitOrDefaultForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IUnit {
  const equipment = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  return equipment?.unit ?? settings.units;
}

export function Equipment_getEquipmentDataForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IEquipmentData | undefined {
  const equipment = Equipment_getEquipmentIdForExerciseType(
    settings,
    exerciseType,
  );
  const currentGym = Equipment_getCurrentGym(settings);
  return equipment ? currentGym.equipment[equipment] : undefined;
}

export function Equipment_getGymByIdOrCurrent(
  settings: ISettings,
  gymId?: string,
): IGym {
  return (
    settings.gyms.find((g) => g.id === (gymId ?? settings.currentGymId)) ??
    settings.gyms[0]
  );
}

export function Equipment_getCurrentGym(settings: ISettings): IGym {
  return (
    settings.gyms.find((g) => g.id === settings.currentGymId) ??
    settings.gyms[0]
  );
}

export function Equipment_getEquipmentIdForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
  gymId?: string,
): string | undefined {
  if (exerciseType == null) {
    return undefined;
  }

  const key = Exercise_toKey(exerciseType);
  if (
    !(
      settings.exerciseData[key] &&
      ("equipment" in settings.exerciseData[key] ||
        "rounding" in settings.exerciseData[key])
    )
  ) {
    return exerciseType.equipment;
  }
  const exerciseData = settings.exerciseData[key];
  const exerciseEquipment = exerciseData?.equipment;
  if (exerciseEquipment == null) {
    return undefined;
  }

  const currentGym = Equipment_getGymByIdOrCurrent(settings, gymId);
  return exerciseEquipment[currentGym.id];
}
