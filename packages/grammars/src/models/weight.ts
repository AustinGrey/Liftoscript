/*
Values which represent weight. Like lbs, kg, etc.
 */

import {
  type IPercentage,
  type IWeight,
} from "@/evaluators/logic-evaluator.ts";

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
