import type { IPercentage } from "@/evaluators/logic-evaluator.ts";

export function percent(value: number): IPercentage {
  return { value, unit: "%" };
}
