import { z } from "zod";
import type { IAllEquipment } from "@/common-types.ts";

export const TEquipmentType = z.string();
export type IEquipmentType = z.infer<typeof TEquipmentType>;

/**
 * The various known broad categories of equipment built in to the system.
 * There may be other categories which a user would add to themselves, but these are the ones known always.
 */
export const builtInEquipmentTypes = [
  "barbell",
  "cable",
  "dumbbell",
  "smith",
  "band",
  "kettlebell",
  "bodyweight",
  "leverageMachine",
  "medicineball",
  "ezbar",
  "trapbar",
] as const satisfies IEquipmentType[];
export const TBuiltinEquipmentTypes = z.enum(builtInEquipmentTypes);

export function equipmentName(
  equipment: IEquipmentType | undefined,
  equipmentSettings?: IAllEquipment,
): string {
  const equipmentData =
    equipment && equipmentSettings ? equipmentSettings[equipment] : undefined;
  // @todo if this is the way to get the name of a piece of equipment, why bother with this hard coded list in here? We should move the hard coded list into the equipment data for the builtins
  if (equipmentData?.name) {
    return equipmentData.name.trim();
  }
  switch (equipment) {
    case "barbell":
      return "Barbell";
    case "cable":
      return "Cable";
    case "dumbbell":
      return "Dumbbell";
    case "smith":
      return "Smith Machine";
    case "band":
      return "Band";
    case "kettlebell":
      return "Kettlebell";
    case "bodyweight":
      return "Bodyweight";
    case "leverageMachine":
      return "Leverage Machine";
    case "medicineball":
      return "Medicine Ball";
    case "ezbar":
      return "EZ Bar";
    case "trapbar":
      return "Trap Bar";
    default:
      return "";
  }
}
