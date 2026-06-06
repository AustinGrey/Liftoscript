import type {
  LogicResult,
  LogicResultSingular,
  Quantity,
} from "@/logic/types.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";
import {
  build,
  convertTo,
  type IDynamicWeight,
  type IUnit,
  type IWeight,
  percentORM,
  TDynamicWeight,
  TWeight,
} from "@/quantities/weight.ts";

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

function toSingular(value: LogicResult): LogicResultSingular | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function coerceToQuantity(value: LogicResult): Quantity {
  const result = toSingular(value) ?? 0;
  return result === true ? 1 : result === false ? 0 : result;
}

type OperateReturnType<
  TLeft extends Quantity | undefined,
  TRight extends Quantity | undefined,
> = TLeft extends undefined
  ? TRight extends undefined
    ? undefined
    : Quantity
  : Quantity;

// This function is more readable with lengthy lines and no chop
// prettier-ignore
/**
 * @todo whole function should go into "quantities" library
 * Perform an operation on two potentially undefined quantities.
 *
 * @todo coercion should be it's own library, and anytime coercion happens you should log so that script authors can see what's going on
 * COERCION rules
 * - Undefined cannot be operated on with anything except undefined.
 * - Less specific unit is coerced to more specific unit number->dynamic weight->weight
 * - When weights of different units are operated on, the result is in the left unit
 *
 * @param left The left side of the operation
 * @param right The right side of the operation
 * @param o The operation to perform
 * @param asWeight How dynamic weights should be converted to weights, if needed
 * @param describe How you would describe this operation to a human. Use the symbols in the script writer would use e.g. "+" for adding
 * @param onError When an error needs to be thrown. This function MUST throw and not return.
 */
export function operate<
  TLeft extends Quantity | undefined,
  TRight extends Quantity | undefined,
>(
  left: TLeft,
  right: TRight,
  o: (a: number, b: number) => number,
  asWeight: (d: IDynamicWeight, unit: IUnit) => IWeight,
  describe: string,
  onError: (error: string, left: TLeft, right: TRight) => never,
): OperateReturnType<TLeft, TRight> {
  if (left === undefined) {
    if (right === undefined) {
      return undefined as OperateReturnType<TLeft, TRight>;
    }
    return onError(`Cannot apply operation "${describe}" when left side is undefined and right side is defined ${right}`, left, right);
  }
  if (isNumber(left)) {
    if (right === undefined) {
      return onError(`Cannot apply operation "${describe}" when left side is a number and right side is undefined`, left, right);
    }
    if (isNumber(right)) {
      return o(left, right) as number as OperateReturnType<TLeft, TRight>;
    }
    if (is(TWeight, right)) {
      return build(o(left, right.value), right.unit) as IWeight as OperateReturnType<TLeft, TRight>;
    }
    // Right is dynamic weight
    return percentORM(o(left, right.value)) as IDynamicWeight as OperateReturnType<TLeft, TRight>;
  }
  if (is(TWeight, left)) {
    if (right === undefined) {
      return onError(`Cannot apply operation "${describe}" when left side is a weight and right side is undefined`, left, right);
    }
    if (isNumber(right)) {
      return build(o(left.value, right), left.unit) as IWeight as OperateReturnType<TLeft, TRight>;
    }
    if (is(TWeight, right)) {
      return build(o(left.value, convertTo(right.value, left.unit)), left.unit) as IWeight as OperateReturnType<TLeft, TRight>;
    }
    // Right is dynamic weight
    return build(o(left.value, asWeight(right, left.unit).value), left.unit,) as IWeight as OperateReturnType<TLeft, TRight>;
  }
  // Left is dynamic weight
  if (right === undefined) {
    return onError(`Cannot apply operation "${describe}" when left side is a weight and right side is undefined`, left, right);
  }
  if (isNumber(right)) {
    return percentORM(o(left.value, right)) as IDynamicWeight as OperateReturnType<TLeft, TRight>;
  }
  if (is(TWeight, right)) {
    return build(o(asWeight(left, right.unit).value ,right.value), right.unit) as IWeight as OperateReturnType<TLeft, TRight>;
  }
  return percentORM(o(left.value, right.value)) as IDynamicWeight as OperateReturnType<TLeft, TRight>;
}
