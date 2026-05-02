import type { EvaluateTools, LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";
import * as Weight from "@/models/weight.ts";
import { pad } from "@/utils/collection.ts";
import {
  isQuantity,
  type LogicResult,
  type LogicResultSingular,
  type Quantity,
} from "@/logic/types.ts";
import {
  type IWeight,
  percentORM,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { LiftoscriptSyntaxError } from "@/evaluators/logic-evaluator.ts";
import { MathUtils_roundFloat } from "@/utils/math.ts";
import { kgToLb, lbToKg } from "@/utils/mass.ts";
import { print, toQuantity } from "@/utils/logic-results.ts";
import { zip } from "es-toolkit";

export const handler: LogicHandler<"BinaryExpression"> = (n, t) => {
  const [leftNode, opNode, rightNode] = queryChildren(n, { atLeast: 3 });
  const left = t.recurse(leftNode);
  const op = t.getText(opNode);
  const right = t.recurse(rightNode);

  //@TODO original liftoscript checks the left and right side types before applying an operator. Potentially to give better error messages.
  //    What is the best "dev" experience for the user?
  switch (op) {
    case "&&":
      return left && right;
    case "||":
      return left || right;
    case ">":
    case "<":
    case ">=":
    case "<=":
    case "==":
    case "!=": {
      const operator = op;
      /*
       * Compare two logic results using the specified operator
       *
       * Either side of the comparison can be an array. If so, here is how the logic resolves
       * - Both arrays: comparison checked pair wise for each element. If the arrays are of different lengths, the shorter array is padded with 0s
       * - Single array: comparison checked for every element in the array
       */

      function comparator(
        l: LogicResultSingular,
        r: LogicResultSingular,
      ): boolean {
        if (
          l === undefined ||
          isBoolean(l) ||
          r === undefined ||
          isBoolean(r)
        ) {
          return false;
        }
        switch (operator) {
          case ">":
            return Weight.gt(l, r);
          case "<":
            return Weight.lt(l, r);
          case ">=":
            return Weight.gte(l, r);
          case "<=":
            return Weight.lte(l, r);
          case "==":
            return Weight.eq(l, r);
          case "!=":
            return !Weight.eq(l, r);
        }
      }
      if (Array.isArray(left)) {
        if (Array.isArray(right)) {
          const longestLength = Math.max(left.length, right.length);
          const leftPadded = pad(left, 0, longestLength);
          const rightPadded = pad(right, 0, longestLength);
          return leftPadded.every((l, i) =>
            // @TODO why all this coercion to 0? Seems like a foot gun. If comparison doesn't make sense, perhaps we should propagate an error?
            comparator(l ?? 0, rightPadded[i] ?? 0),
          );
        } else {
          return left.every((l) => comparator(l ?? 0, right ?? 0));
        }
      } else if (Array.isArray(right)) {
        return right.every((r) => comparator(left ?? 0, r ?? 0));
      } else {
        return comparator(left ?? 0, right ?? 0);
      }
    }
    case "+":
      return binaryMathOp(
        op,
        left,
        right,
        (a, b) => a + b,
        {
          true: 0,
          false: 0,
          undefined: 0,
        },
        t,
      );
    case "-":
      return binaryMathOp(
        op,
        left,
        right,
        (a, b) => a - b,
        {
          true: 0,
          false: 0,
          undefined: 0,
        },
        t,
      );
    case "*":
      return binaryMathOp(
        op,
        left,
        right,
        (a, b) => a * b,
        {
          true: 1,
          false: 1,
          undefined: 1,
        },
        t,
      );
    case "/":
      return binaryMathOp(
        op,
        left,
        right,
        (a, b) => a / b,
        {
          true: 1,
          false: 1,
          undefined: 1,
        },
        t,
      );
    case "%":
      return binaryMathOp(
        op,
        left,
        right,
        (a, b) => a % b,
        {
          true: 1,
          false: 1,
          undefined: 1,
        },
        t,
      );
    default:
      return t.error(`Unsupported operator ${op}`, opNode);
  }
};

/**
 * Applies the given operation after coercing the units of the two logic results
 *
 * Array coercion rules
 * - If both sides are arrays, then the operation is applied to each element pairwise
 *   - @todo what if the arrays are of different lengths?
 * - If one side is an array, then the operation is applied to each element of the array with the other value
 * - See {@link binaryMathOpSingular} for coercion rules of the result of an operation on two single values which are not the same type.
 *
 * @param operator The operator that was in the original script
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 * @param coercion How non-numbers will be converted
 * @param tools the evaluation tools
 */
export function binaryMathOp(
  operator: string,
  left: LogicResult,
  right: LogicResult,
  o: (x: number, y: number) => number,
  coercion: {
    true: Quantity | undefined;
    false: Quantity | undefined;
    undefined: Quantity | undefined;
  },
  tools: EvaluateTools,
): LogicResult {
  if (Array.isArray(left)) {
    if (Array.isArray(right)) {
      //@todo zip gives undefined for the missing values of mixed length arrays, is that what we want?
      return zip(left, right).map(([l, r]) =>
        binaryMathOpSingular(operator, l, r, o, coercion, tools),
      );
    }
    return left.map((l) =>
      binaryMathOpSingular(operator, l, right, o, coercion, tools),
    );
  }
  if (Array.isArray(right)) {
    return right.map((r) =>
      binaryMathOpSingular(operator, left, r, o, coercion, tools),
    );
  }
  return binaryMathOpSingular(operator, left, right, o, coercion, tools);
}

/**
 * Applies the given math operation after coercing the units of the two logic results
 *
 * Single value coercion rules - when two values don't have the same types
 * - If any value is a {@link Quantity}, then they are converted to the same unit and the operation applied. See {@link coerceUnits} for the rules of coercion for units.
 * - Other like values are converted to numbers according to the coercion rules supplied. If undefined, an error is thrown.
 *
 * @param operator The operator that was in the original script
 * @param left The first quantity
 * @param right The second quantity
 * @param o The operation to perform
 * @param coercion How non-numbers will be converted
 * @param tools the evaluation tools
 */
function binaryMathOpSingular(
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
  const { aCoerced: a, bCoerced: b } = coerceUnits(
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

  throw new Error(`Can't apply operation to ${a} and ${b}`);
}

/**
 * Determines what the unit should be for two quantities when an operation is applied
 *
 * Unit coercion rules
 * - If there are 0 or 1 distinct units involved, then the result has the same 0 or 1 unit.
 * - If there are 2 distinct units the unit is chosen from the first used in this list:
 *   - "kg" or "lb", if a tie, the left unit wins
 *   - "%"
 *   - unitless
 *
 * @param a The left Quantity
 * @param b The right Quantity
 * @return Both values coerced to the same unit.
 */
function coerceUnits(
  a: Quantity,
  b: Quantity,
  tools: EvaluateTools,
): { aCoerced: Quantity; bCoerced: Quantity } {
  // Weights
  if (typeof a === "object" && (a.unit === "kg" || a.unit === "lb"))
    return { aCoerced: a, bCoerced: asUnit(b, a.unit, tools) };
  if (typeof b === "object" && (b.unit === "kg" || b.unit === "lb"))
    return { aCoerced: asUnit(a, b.unit, tools), bCoerced: b };

  // Dynamic Weights
  if (typeof a === "object" && a.unit === "%")
    return { aCoerced: a, bCoerced: isNumber(b) ? percentORM(b) : b };
  if (typeof b === "object" && b.unit === "%")
    return { aCoerced: isNumber(a) ? percentORM(a) : a, bCoerced: b };

  // Both Unitless
  return { aCoerced: a, bCoerced: b };
}

function asUnit(q: Quantity, unit: "kg" | "lb", tools: EvaluateTools): IWeight {
  let value: number;

  if (isNumber(q)) {
    value = q;
  } else {
    if (q.unit === unit) {
      value = q.value;
    } else {
      switch (q.unit) {
        case "kg":
          value = kgToLb(q.value);
          break;
        case "lb":
          value = lbToKg(q.value);
          break;
        case "%":
          value = tools.getGlobal("rm1").value * (q.value / 100);
          break;
        default:
          q satisfies never;
          value = q;
      }
    }
  }

  return {
    value,
    unit,
  };
}
