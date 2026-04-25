/*
Values which represent weight. Like lbs, kg, etc.
 */

import { z } from "zod";
import { is, isNumber } from "@/utils/types.ts";
import type { Quantity } from "@/evaluators/logic.ts";

export const TUnit = z.union([z.literal("kg"), z.literal("lb")]);
export type IUnit = "kg" | "lb";
export const TWeight = z.object({
  value: z.number(),
  unit: TUnit,
});
export type IWeight = z.infer<typeof TWeight>;
export const TDynamicWeight = z.object({
  value: z.number(),
  unit: z.literal("%"),
});
export type IDynamicWeight = z.infer<typeof TDynamicWeight>;

/**
 * @returns Model for specifying a percentage of the user's current one rep max
 * @param value The percentage value
 */
export function percentORM(value: number): IDynamicWeight {
  return { value, unit: "%" };
}

/**
 * A weight operation that only allows the right operand to be a number
 */
type TOperation = (left: IWeight, right: IWeight | number) => IWeight;
/**
 * A weight operation that allows both operands to be numbers, weights, or percentages
 */
type TComparison = (left: Quantity, right: Quantity) => boolean;

export const add: TOperation = (l, r) => operation(l, r, (a, b) => a + b);
export const subtract: TOperation = (l, r) => operation(l, r, (a, b) => a - b);
export const multiply: TOperation = (l, r) => operation(l, r, (a, b) => a * b);
export const divide: TOperation = (l, r) => operation(l, r, (a, b) => a / b);
export const gt: TComparison = (l, r) => comparison(l, r, (a, b) => a > b);
export const lt: TComparison = (l, r) => comparison(l, r, (a, b) => a < b);
export const gte: TComparison = (l, r) => comparison(l, r, (a, b) => a >= b);
export const lte: TComparison = (l, r) => comparison(l, r, (a, b) => a <= b);
export const eq: TComparison = (l, r) => comparison(l, r, (a, b) => a === b);

export function operation(
  left: IWeight,
  right: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight;
export function operation(
  left: IWeight | number,
  right: IWeight,
  o: (a: number, b: number) => number,
): IWeight;
export function operation(
  left: IWeight | number,
  right: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight {
  if (isNumber(left) && !isNumber(right)) {
    return build(o(left, right.value), right.unit);
  } else if (!isNumber(left) && isNumber(right)) {
    return build(o(left.value, right), left.unit);
  } else if (!isNumber(left) && !isNumber(right)) {
    return build(o(left.value, convertTo(right, left.unit).value), left.unit);
  } else {
    throw new Error("Weight.operation should never work with numbers only");
  }
}

const prebuiltWeights: Partial<Record<string, IWeight>> = {};
/**
 * Creates a new weight object. Memoized so that it doesn't create a new object for the same value and unit combination.
 * @TODO is memoization really important here? This seems insanely over engineered.
 * @param value The value to set
 * @param unit The unit to use for the weight
 */
export function build(value: number, unit: IUnit): IWeight {
  const key = `${value}_${unit}`;
  return prebuiltWeights[key] != null
    ? prebuiltWeights[key]
    : (prebuiltWeights[key] = {
        value: typeof value === "string" ? parseFloat(value) : value,
        unit,
      });
}

export function convertTo(weight: IWeight, unit: IUnit): IWeight;
export function convertTo(
  weight: IDynamicWeight,
  unit: "%" | IUnit,
): IDynamicWeight;
export function convertTo(weight: number, unit: IUnit): number;
export function convertTo(
  weight: IWeight | number | IDynamicWeight,
  unit: IUnit | "%",
): IWeight | number | IDynamicWeight {
  if (isNumber(weight)) {
    return weight;
  } else if (weight.unit === "%" || unit === "%") {
    return weight;
  } else {
    if (weight.unit === unit) {
      return weight;
    } else if (weight.unit === "kg" && unit === "lb") {
      // @TODO what kind of precision is being rounded to here? It's not a particular number of decimal places or else it would be / 10 then round then * 10. Instead it's * 2 then round divide by 2
      return build(Math.round((weight.value * 2.205) / 0.5) * 0.5, unit);
    } else {
      return build(Math.round(weight.value / 2.205 / 0.5) * 0.5, unit);
    }
  }
}

/**
 * Performs the operation on the two values after making sure they are in the same units
 *
 * If the units cannot be normalized, false is returned.
 * @TODO is that really valid? Should we return some error result to bubble up instead?
 *
 * @param left The left value to compare
 * @param right The right value to compare
 * @param o The comparison function to perform once the units are converted.
 */
function comparison(
  left: IWeight | number | IDynamicWeight,
  right: IWeight | number | IDynamicWeight,
  o: (a: number, b: number) => boolean,
): boolean {
  if (isNumber(left)) {
    if (isNumber(right)) {
      return o(left, right);
    }
    return o(left, right.value);
  } else if (isNumber(right)) {
    return o(left.value, right);
  } else if (left.unit === "%" && right.unit === "%") {
    return o(left.value, right.value);
  } else if (is(TWeight, left) && is(TWeight, right)) {
    return o(left.value, convertTo(right, left.unit).value);
  }
  return false;
}
