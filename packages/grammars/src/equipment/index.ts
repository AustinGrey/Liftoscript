import { z } from "zod";

export const equipments = [
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
] as const;
export const TBuiltinEquipment = z.enum(equipments);
export const TEquipment = z.string();
export type IEquipment = z.infer<typeof TEquipment>;
