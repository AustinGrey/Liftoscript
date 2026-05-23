import { z } from "zod";

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
