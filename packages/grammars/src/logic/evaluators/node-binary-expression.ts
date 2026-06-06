import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";
import * as Weight from "@/quantities/weight.ts";
import {
  type LogicResult,
  type LogicResultSingular,
  type Quantity,
} from "@/logic/types.ts";
import {
  type IWeight,
  percentORM,
  TDynamicWeight,
  TWeight,
} from "@/quantities/weight.ts";
import { MathUtils_roundFloat } from "@/utils/math.ts";
import { kgToLb, lbToKg } from "@/utils/mass.ts";
import { equal, toQuantity } from "@/utils/logic-results.ts";
import { zip } from "es-toolkit";
import { toWeight } from "@/utils/dynamic-weight.ts";

export const handler: LogicHandler<"BinaryExpression"> = (n, t) => {
  const [leftNode, opNode, rightNode] = queryChildren(n, { atLeast: 3 });
  const left = t.recurse(leftNode);
  const op = t.getText(opNode);
  const right = t.recurse(rightNode);

  const maybeArrayResult = binaryOpMaybeArray(left, right, (l, r) => {
    switch (op) {
      // These cases are of the form (LogicResultSingular, LogicResultSingular) => boolean
      case "==":
        return equal(l, r);
      case "!=":
        return !equal(l, r);
      // These cases are of the form (Quantity, Quantity) => boolean
      case ">":
      case "<":
      case ">=":
      case "<=":
        return binaryCompareOp(
          l,
          r,
          (aValue, bValue) => {
            switch (op) {
              case ">":
                return aValue > bValue;
              case "<":
                return aValue < bValue;
              case ">=":
                return aValue >= bValue;
              case "<=":
                return aValue <= bValue;
            }
          },
          {
            true: undefined,
            false: undefined,
            undefined: 0, // @todo this is what original liftoscript was doing.... but that's wrong because it means undefined < 1 is true but undefined < 0 is false!
          },
          t,
        );
      // These cases are of the form (boolean, boolean) => boolean
      case "&&":
      case "||": {
        // The value that causes no change when applied to a value.
        const identity = op === "&&" ? true : false;
        return binaryBooleanOp(
          l,
          r,
          (a, b) => {
            return op === "&&" ? a && b : a || b;
          },
          {
            number: identity,
            weight: identity,
            dynamicWeight: identity,
            undefined: identity,
          },
        );
      }
      // These cases are of the form (Quantity, Quantity) => number
      case "+":
      case "-":
      case "*":
      case "/":
      case "%": {
        // The value that causes no change when applied to a value.
        const identity = "+" === op || "-" === op ? 0 : 1;
        return binaryMathOp(
          op,
          l,
          r,
          (a, b) => {
            switch (op) {
              case "+":
                return a + b;
              case "-":
                return a - b;
              case "*":
                return a * b;
              case "/":
                return a / b;
              case "%":
                return a % b;
            }
          },
          {
            true: identity,
            false: identity,
            undefined: identity,
          },
          t,
        );
      }
      default:
        return t.error(`Unsupported operator ${op}`, opNode);
    }
  });

  /*
  Weird special case:
  For comparison operations on arrays. There is an additional combining of the result. The result is true if and only if every element in the resulting array is true.
  This is because in original liftoscript, boolean arrays aren't a legal result type.
  But I relaxed that requirement, so this is no longer necessary.
  However we want to maintain compatibility with the original language, so we will still perform this operation.
  @todo Is compatibility really important here? I think the language needs an "every" or "some" operation to give script writers control over the language
   */

  if (
    Array.isArray(maybeArrayResult) &&
    maybeArrayResult.every((x) => typeof x === "boolean")
  ) {
    return maybeArrayResult.every((x) => x);
  }

  return maybeArrayResult;
};

/**
 * Performs an operation on two Logic Results, which means one or both may be arrays.
 * If either are arrays, the result is an array. Otherwise the result is a singular value.
 *
 * Array coercion rules
 * - If both sides are arrays, then the operation is applied to each element pairwise
 *   - If the arrays are different lengths, the shorter array is padded with "undefined"
 * - If one side is an array, then the operation is applied to each element of the array with the other value
 * - If both are singular values, then the operation is applied directly to them
 *
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 */
function binaryOpMaybeArray(
  left: LogicResult,
  right: LogicResult,
  o: (
    leftSingular: LogicResultSingular,
    rightSingular: LogicResultSingular,
  ) => LogicResultSingular,
): LogicResult {
  if (Array.isArray(left)) {
    if (Array.isArray(right)) {
      return zip(left, right).map(([l, r]) => o(l, r));
    }
    return left.map((l) => o(l, right));
  }
  if (Array.isArray(right)) {
    return right.map((r) => o(left, r));
  }
  return o(left, right);
}

/**
 * Applies the given math operation after coercing the units of the two logic results
 *
 * @param operator The operator that was in the original script
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 * @param coercion How non-numbers will be converted
 * @param tools the evaluation tools
 */
function binaryMathOp(
  operator: string,
  left: LogicResultSingular,
  right: LogicResultSingular,
  o: (aValue: number, bValue: number) => number,
  coercion: {
    true: Quantity | undefined;
    false: Quantity | undefined;
    undefined: Quantity | undefined;
  },
  tools: EvaluateTools,
): LogicResultSingular {
  const { aCoerced: a, bCoerced: b } = coerceQuantities(
    toQuantity(left, coercion),
    toQuantity(right, coercion),
    tools,
  );

  const onerm = tools.getGlobal("rm1");

  if (isNumber(a) && isNumber(b)) {
    return o(a, b);
  }
  if (isNumber(a) && is(TDynamicWeight, b)) {
    return percentORM(o(a, b.value));
  }
  if (isNumber(a) && is(TWeight, b)) {
    return Weight.operation(a, b, o);
  }

  if (is(TDynamicWeight, a) && isNumber(b)) {
    return percentORM(o(a.value, b));
  }
  if (is(TDynamicWeight, a) && is(TDynamicWeight, b)) {
    return percentORM(o(a.value, b.value));
  }
  if (is(TDynamicWeight, a) && is(TWeight, b)) {
    const aWeight = onerm
      ? Weight.multiply(onerm, a.value / 100)
      : MathUtils_roundFloat(a.value / 100, 4);
    return Weight.operation(aWeight, b, o);
  }

  if (is(TWeight, a) && isNumber(b)) {
    return Weight.operation(a, b, o);
  }
  if (is(TWeight, a) && is(TDynamicWeight, b)) {
    const bWeight = onerm
      ? Weight.multiply(onerm, b.value / 100)
      : MathUtils_roundFloat(b.value / 100, 4);
    return Weight.operation(a, bWeight, o);
  }
  if (is(TWeight, a) && is(TWeight, b)) {
    return Weight.operation(a, b, o);
  }

  throw new Error(`Can't apply operation ${operator} to ${a} and ${b}`);
}

/**
 * Coerces the two Quantities to be of the same unit.
 *
 * Unit coercion rules
 * - If there are 0 or 1 distinct units involved, then the result has the same 0 or 1 unit.
 * - If there are 2 distinct units the unit is chosen from the first used in this list:
 *   - "kg" or "lb", if a tie, the left unit wins. Dynamic units like "%" are resolved before this is decided.
 *   - unitless
 *
 * @param left The left Quantity
 * @param right The right Quantity
 * @param tools the evaluation tools
 * @return Both values coerced to the same unit.
 */
function coerceQuantities(
  left: Quantity,
  right: Quantity,
  tools: EvaluateTools,
): { aCoerced: Quantity; bCoerced: Quantity } {
  if (is(TWeight, left)) {
    if (is(TWeight, right)) {
      return { aCoerced: left, bCoerced: asUnit(right, left.unit) };
    }
    if (is(TDynamicWeight, right)) {
      return {
        aCoerced: left,
        bCoerced: asUnit(toWeight(right, tools.getGlobal("rm1")), left.unit),
      };
    }
    right satisfies number;
    return { aCoerced: left, bCoerced: Weight.build(right, left.unit) };
  }
  if (is(TDynamicWeight, left)) {
    const leftWeight = toWeight(left, tools.getGlobal("rm1"));
    if (is(TWeight, right)) {
      return { aCoerced: leftWeight, bCoerced: asUnit(right, leftWeight.unit) };
    }
    if (is(TDynamicWeight, right)) {
      return { aCoerced: left, bCoerced: right };
    }
    right satisfies number;
    return { aCoerced: left, bCoerced: percentORM(right) };
  }
  left satisfies number;
  if (is(TWeight, right)) {
    return { aCoerced: Weight.build(left, right.unit), bCoerced: right };
  }
  if (is(TDynamicWeight, right)) {
    return { aCoerced: percentORM(left), bCoerced: right };
  }
  right satisfies number;
  return { aCoerced: left, bCoerced: right };
}

function asUnit(q: IWeight, unit: "kg" | "lb"): IWeight {
  if (q.unit === "kg") {
    if (unit === "kg") {
      return q;
    }
    return { value: kgToLb(q.value), unit };
  }
  q.unit satisfies "lb";
  if (unit === "lb") {
    return q;
  }
  return { value: lbToKg(q.value), unit };
}

/**
 * Applies the given comparison operation after coercing the units of the two logic results
 *
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 * @param coercion How non-numbers will be converted
 * @param tools the evaluation tools
 */
function binaryCompareOp(
  left: LogicResultSingular,
  right: LogicResultSingular,
  o: (aValue: number, bValue: number) => boolean,
  coercion: {
    true: Quantity | undefined;
    false: Quantity | undefined;
    undefined: Quantity | undefined;
  },
  tools: EvaluateTools,
): LogicResultSingular {
  const { aCoerced: a, bCoerced: b } = coerceQuantities(
    toQuantity(left, coercion),
    toQuantity(right, coercion),
    tools,
  );
  return o(isNumber(a) ? a : a.value, isNumber(b) ? b : b.value);
}

/**
 * Applies the given comparison operation after coercing the units of the two logic results
 *
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 * @param coercion How non-numbers will be converted
 */
function binaryBooleanOp(
  left: LogicResultSingular,
  right: LogicResultSingular,
  o: (aValue: boolean, bValue: boolean) => boolean,
  coercion: {
    number: boolean | undefined;
    weight: boolean | undefined;
    dynamicWeight: boolean | undefined;
    undefined: boolean | undefined;
  },
): LogicResultSingular {
  function coerceToBoolean(val: LogicResultSingular): boolean {
    if (isBoolean(val)) return val;
    if (isNumber(val) && coercion.number) return coercion.number;
    if (is(TWeight, val) && coercion.weight) return coercion.weight;
    if (is(TDynamicWeight, val) && coercion.dynamicWeight)
      return coercion.dynamicWeight;
    if (val === undefined && coercion.undefined) return coercion.undefined;
    // @todo shouldn't I bubble up the error to give a better, tracable error message?
    throw new Error(
      `A value needed to be turned into a boolean but could not be. The value was: ${val}`,
    );
  }
  return o(coerceToBoolean(left), coerceToBoolean(right));
}
