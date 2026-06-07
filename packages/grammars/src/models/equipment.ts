import type { IUnit, IWeight } from "@/quantities/weight.ts";
import * as Weight from "@/quantities/weight.ts";
import { Exercise_toKey } from "@/models/exercise.ts";
import type { IExerciseType } from "@/exercises";
import type { ISettings } from "@/user-settings";
import type { IGym } from "@/gyms";
import type { IEquipmentData } from "@/equipment";

export function Equipment_smallestPlate(
  equipmentData: IEquipmentData,
  unit: IUnit,
): IWeight {
  return (
    equipmentData.plates
      .filter((p) => p.weight.unit === unit)
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
    exerciseType,
  );
  const equipmentUnit = equipment?.unit;
  return equipmentUnit == null || equipmentUnit === settings.units
    ? undefined
    : equipmentUnit;
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
  const currentGym = Equipment_getGymByIdOrCurrent(settings);
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
