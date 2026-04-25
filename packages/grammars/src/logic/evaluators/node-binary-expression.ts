import type {
  LogicHandler,
  LogicResultSingular,
} from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { isBoolean } from "@/utils/types.ts";
import * as Weight from "@/models/weight.ts";
import { pad } from "@/utils/collection.ts";

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
      return Weight.add(left, right);
    case "-":
      return Weight.subtract(left, right);
    case "*":
      return Weight.multiply(left, right);
    case "/":
      return Weight.divide(left, right);
    case "%":
      return Weight.modulo(left, right);
    default:
      return t.error(`Unsupported operator ${op}`, opNode);
  }
};
