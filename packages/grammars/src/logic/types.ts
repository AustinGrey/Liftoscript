import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { is, isNumber } from "@/utils/types.ts";

export type Quantity = number | IWeight | IDynamicWeight;

export function isQuantity(value: unknown): value is Quantity {
  return isNumber(value) || is(TWeight, value) || is(TDynamicWeight, value);
}

export type LogicResultSingular = Quantity | boolean | undefined;
export type LogicResult = LogicResultSingular | LogicResultSingular[];
