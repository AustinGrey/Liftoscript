/*
Values which represent weight. Like lbs, kg, etc.
 */

import { z } from "zod";
import type { IPercentage } from "@/models/value.ts";
import { is, isNumber } from "@/utils/types.ts";

export const TUnit = z.union([z.literal("kg"), z.literal("lb")]);
export type IUnit = "kg" | "lb";
export const TWeight = z.object({
  value: z.number(),
  unit: TUnit,
});
export type IWeight = z.infer<typeof TWeight>;

export function add(weight: IWeight, value: IWeight | number): IWeight {
  return operation(weight, value, (a, b) => a + b);
}

export function subtract(weight: IWeight, value: IWeight | number): IWeight {
  return operation(weight, value, (a, b) => a - b);
}

export function multiply(weight: IWeight, value: IWeight | number): IWeight {
  return operation(weight, value, (a, b) => a * b);
}

export function divide(weight: IWeight, value: IWeight | number): IWeight {
  return operation(weight, value, (a, b) => a / b);
}

export function gt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a > b);
}

export function lt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a < b);
}

export function gte(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a >= b);
}

export function lte(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a <= b);
}

export function operation(
  weight: IWeight,
  value: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight;
export function operation(
  weight: IWeight | number,
  value: IWeight,
  o: (a: number, b: number) => number,
): IWeight;
export function operation(
  weight: IWeight | number,
  value: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight {
  if (typeof weight === "number" && typeof value !== "number") {
    return build(o(weight, value.value), value.unit);
  } else if (typeof weight !== "number" && typeof value === "number") {
    return build(o(weight.value, value), weight.unit);
  } else if (typeof weight !== "number" && typeof value !== "number") {
    return build(
      o(weight.value, convertTo(value, weight.unit).value),
      weight.unit,
    );
  } else {
    throw new Error("Weight.operation should never work with numbers only");
  }
}

const prebuiltWeights: Partial<Record<string, IWeight>> = {};
export function build(value: number, unit: IUnit): IWeight {
  const key = `${value}_${unit}`;
  const prebuiltWeight = prebuiltWeights[key];
  if (prebuiltWeight != null) {
    return prebuiltWeight;
  } else {
    const v = {
      value: typeof value === "string" ? parseFloat(value) : value,
      unit,
    };
    prebuiltWeights[`${value}_${unit}`] = v;
    return v;
  }
}

export function convertTo(weight: IWeight, unit: IUnit): IWeight;
export function convertTo(weight: IPercentage, unit: "%" | IUnit): IPercentage;
export function convertTo(weight: number, unit: IUnit): number;
export function convertTo(
  weight: IWeight | number | IPercentage,
  unit: IUnit | "%",
): IWeight | number | IPercentage {
  if (typeof weight === "number") {
    return weight;
  } else if (weight.unit === "%" || unit === "%") {
    return weight;
  } else {
    if (weight.unit === unit) {
      return weight;
    } else if (weight.unit === "kg" && unit === "lb") {
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
  left: IWeight | number | IPercentage,
  right: IWeight | number | IPercentage,
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
