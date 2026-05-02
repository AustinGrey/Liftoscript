import {
  isQuantity,
  type LogicResult,
  type LogicResultSingular,
  type Quantity,
} from "@/logic/types.ts";
import { isNumber } from "@/utils/types.ts";

export function print(value: LogicResult): string {
  if (Array.isArray(value)) {
    return "[" + value.map(printSingular).join(", ") + "]";
  }
  return printSingular(value);
}

function printSingular(value: LogicResultSingular): string {
  if (value === undefined) {
    return "UNDEFINED";
  }
  if (value === true) {
    return "TRUE";
  }
  if (value === false) {
    return "FALSE";
  }
  if (isNumber(value)) {
    return value.toString();
  }
  return value.value + value.unit;
}

/**
 * Converts the result to a Quantity. If there is no coercion defined for a value, it will throw
 * @todo don't throw. Instead bubble up the error so we can give a better error message to the user
 * @param value The value to convert
 * @param coercion How non-quantities will be converted
 */
export function toQuantity(
  value: LogicResultSingular,
  coercion: {
    true: Quantity | undefined;
    false: Quantity | undefined;
    undefined: Quantity | undefined;
  },
): Quantity {
  if (isQuantity(value)) return value;
  if (value === true && coercion.true) {
    return structuredClone(coercion.true);
  } else if (value === false && coercion.false) {
    return structuredClone(coercion.false);
  } else if (value === undefined && coercion.undefined) {
    return structuredClone(coercion.undefined);
  } else
    // @TODO really? Throwing an error here doesn't seem like a good idea unless we can give the user a better error message to track down where the value came from
    throw new Error(
      `A value could not be converted into a Quantity, but is needed to be. The value was: ${print(value)}`,
    );
}

/**
 * Rounds all quantities in the result using the given rounder function.
 * @param result The result to round
 * @param rounder The function to use to round quantities
 */
export function round<T extends LogicResult>(
  result: T,
  rounder: <TQ extends Quantity>(q: TQ) => TQ,
): T {
  if (Array.isArray(result)) {
    return result.map((r) => round(r, rounder)) as T;
  }
  if (isQuantity(result)) {
    return rounder(result);
  }
  return result;
}
