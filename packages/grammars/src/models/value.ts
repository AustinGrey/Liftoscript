/*
"Unitless" values, like percents, and bare numbers.
 */

import { TUnit } from "@/evaluators/logic-evaluator.ts";
import { z } from "zod";

export const TPercentage = z.object({
  value: z.number(),
  unit: "%",
});
export type IPercentage = t.infer<typeof TPercentage>;

export function percent(value: number): IPercentage {
  return { value, unit: "%" };
}
