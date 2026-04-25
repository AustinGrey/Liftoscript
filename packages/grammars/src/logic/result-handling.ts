import type { LogicResult } from "@/logic/types.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";
import { TDynamicWeight, TWeight } from "@/models/weight.ts";

/**
 * Does it's best to convert something to a number, even if the result makes little to no sense.
 * @param value The value to coerce
 */
export function toNumberUnsafe(value: LogicResult): number {
  if (isNumber(value)) {
    return value;
  } else if (isBoolean(value)) {
    // @TODO why 0, and not 1 for true?
    return 0;
  } else if (is(TWeight, value)) {
    return value.value;
  } else if (is(TDynamicWeight, value)) {
    return value.value;
  } else if (Array.isArray(value)) {
    return toNumberUnsafe(value[0] ?? 0);
  } else {
    return 0;
  }
}
