import { type IDynamicWeight, type IWeight } from "@/models/weight.ts";
import * as Weight from "@/models/weight.ts";

/**
 * Converts a dynamic weight to a weight based on the one rep max
 * @param dynamicWeight The dynamic weight to convert
 * @param oneRepMax The one rep max weight
 */
export function toWeight(
  dynamicWeight: IDynamicWeight,
  oneRepMax: IWeight,
): IWeight {
  return Weight.build(
    (oneRepMax.value * dynamicWeight.value) / 100,
    oneRepMax.unit,
  );
}
