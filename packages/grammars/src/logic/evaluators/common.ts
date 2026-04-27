import type { LogicResult } from "@/logic/types.ts";
import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";

/**
 * This type helper ensures you have specified a transformation for every possible type that the value could be.
 * Also maintains the type
 * @param val The value to transform
 * @param handlers The set of mappers for each potential type of value
 * @param defaultValue The default result if an unexpected value is passed, which no handler maps on.
 *    Defensive programming: This can happen if the types aren't set up water tight and an unexpected type of value is given to the function
 */
export function transformLogicResult<
  T extends LogicResult,
  TResultIfNumber extends LogicResult,
  TResultIfWeight extends LogicResult,
  TResultIfDynamicWeight extends LogicResult,
  TResultIfBoolean extends LogicResult,
  TResultIfUndefined extends LogicResult,
  TDefault extends LogicResult,
>(
  val: T,
  handlers: (T extends number
    ? { number: (val: number) => TResultIfNumber }
    : never) &
    (T extends IWeight
      ? { weight: (val: IWeight) => TResultIfWeight }
      : never) &
    (T extends IDynamicWeight
      ? { dynamicWeight: (val: IDynamicWeight) => TResultIfDynamicWeight }
      : never) &
    (T extends boolean
      ? { boolean: (val: boolean) => TResultIfBoolean }
      : never) &
    (T extends undefined
      ? { undefined: (val: undefined) => TResultIfUndefined }
      : never),
  defaultValue: TDefault,
):
  | TResultIfNumber
  | TResultIfWeight
  | TResultIfDynamicWeight
  | TResultIfBoolean
  | TResultIfUndefined
  | TDefault {
  if (isNumber(val)) {
    return handlers.number(val);
  }
  if (is(TWeight, val)) {
    return handlers.weight(val);
  }
  if (is(TDynamicWeight, val)) {
    return handlers.dynamicWeight(val);
  }
  if (isBoolean(val)) {
    return handlers.boolean(val);
  }
  if (val === undefined) {
    return handlers.undefined(val);
  }
  return defaultValue;
}
