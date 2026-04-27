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
 * @param defaultValue The default result if an unexpected value is passed, which no handler maps on, or handler was missed but needed.
 *    Defensive programming: This can happen if the types aren't set up water tight and an unexpected type of value is given to the function
 */
export function transformLogicResult<
  T extends LogicResult,
  TResultIfNumber,
  TResultIfWeight,
  TResultIfDynamicWeight,
  TResultIfBoolean,
  TResultIfUndefined,
  TDefault,
>(
  val: T,
  handlers: (T extends number
    ? { number: (val: number) => TResultIfNumber }
    : {}) &
    (T extends IWeight ? { weight: (val: IWeight) => TResultIfWeight } : {}) &
    (T extends IDynamicWeight
      ? { dynamicWeight: (val: IDynamicWeight) => TResultIfDynamicWeight }
      : {}) &
    (T extends boolean ? { boolean: (val: boolean) => TResultIfBoolean } : {}) &
    (T extends undefined
      ? { undefined: (val: undefined) => TResultIfUndefined }
      : {}),
  defaultValue: TDefault,
):
  | TResultIfNumber
  | TResultIfWeight
  | TResultIfDynamicWeight
  | TResultIfBoolean
  | TResultIfUndefined
  | TDefault {
  if (isNumber(val) && "number" in handlers) {
    return handlers.number(val);
  }
  if (is(TWeight, val) && "weight" in handlers) {
    return handlers.weight(val);
  }
  if (is(TDynamicWeight, val) && "dynamicWeight" in handlers) {
    return handlers.dynamicWeight(val);
  }
  if (isBoolean(val) && "boolean" in handlers) {
    return handlers.boolean(val);
  }
  if (val === undefined && "undefined" in handlers) {
    return handlers.undefined(val);
  }
  return defaultValue;
}

let foo: number | boolean = false as number | boolean;

const bar = transformLogicResult(
  foo,
  {
    number: (x) => x,
    boolean: (x) => x,
  },
  0,
);
