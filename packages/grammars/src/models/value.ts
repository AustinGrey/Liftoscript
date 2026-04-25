/*
"Unitless" values, like percents, and bare numbers.
 */
import { z } from "zod";

export const TPercentage = z.object({
  value: z.number(),
  unit: z.literal("%"),
});
export type IPercentage = z.infer<typeof TPercentage>;

export function percent(value: number): IPercentage {
  return { value, unit: "%" };
}
