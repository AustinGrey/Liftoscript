import { TEquipment } from "@/equipment";
import { TEquipmentData } from "@/common-types.ts";
import { z } from "zod";

export const TGym = z
  .object({
    /**
     * Unique system identifier for this gym
     */
    id: z.string(),
    /**
     * Human-readable name for this gym
     */
    name: z.string(),
    /**
     * What equipment is available at this gym, and any additional data about that specific equipment in the gym
     */
    equipment: z.record(TEquipment, z.union([TEquipmentData, z.undefined()])),
  })
  .strict();
export type IGym = z.infer<typeof TGym>;
