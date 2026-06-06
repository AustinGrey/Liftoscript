import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { is, isNumber, isOneOf } from "@/utils/types.ts";
import {
  TDynamicWeight,
  TWeight,
  convertToWeight,
} from "@/quantities/weight.ts";
import {
  toNumberUnsafe,
  coerceToQuantity,
  operate,
} from "@/logic/result-handling.ts";
import {
  changeBinding,
  changeNumberOfSets,
  recordVariableUpdate,
} from "@/logic/evaluators/common.ts";
import { isQuantity, type Quantity } from "@/logic/types.ts";

// @todo this is a lot of complicated logic - can't this be simplified by just desugaring this to left = left <op> right? We can dispatch this to the existing handlers for binary ops and assignment
export const handler: LogicHandler<"IncAssignmentExpression"> = (n, t) => {
  const [stateVar, incAssignmentExpr, expression] = queryChildren(n, {
    atLeast: 3,
  });
  if (
    stateVar == null ||
    expression == null ||
    incAssignmentExpr == null ||
    !isOneOf(
      stateVar.type.name,
      NodeName.StateVariable,
      NodeName.VariableExpression,
      NodeName.Variable,
    )
  ) {
    return t.error(
      `missing required nodes for ${NodeName.IncAssignmentExpression}`,
      n,
    );
  }

  // This function set is more readable unchopped
  /* prettier-ignore */ const add     = <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a + b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "+", (message)=>t.error(message, n));
  /* prettier-ignore */ const subtract= <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a - b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "-", (message)=>t.error(message, n));
  /* prettier-ignore */ const multiply= <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a * b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "*", (message)=>t.error(message, n));
  /* prettier-ignore */ const divide  = <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a / b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "/", (message)=>t.error(message, n));

  switch (stateVar.type.name) {
    case NodeName.StateVariable: {
      const nameNode = queryChild(stateVar, { ofType: NodeName.Keyword });
      if (nameNode == null) {
        t.error(`Missing variable name`, stateVar);
      }
      const [...indexExprs] = queryChildren(stateVar, {
        ofType: NodeName.VariableIndex,
      });
      const variable = t.getText(nameNode);
      if (variable === "rm1") {
        if (indexExprs.length > 0) {
          t.error(`rm1 is not an array`, n);
        }
        const value = coerceToQuantity(t.recurse(expression));

        const op = t.getText(incAssignmentExpr);
        t.updateGlobal("rm1", (rm1) =>
          convertToWeight(
            rm1,
            op === "+="
              ? add(rm1, value)
              : op === "-="
                ? subtract(rm1, value)
                : op === "*="
                  ? multiply(rm1, value)
                  : op === "/="
                    ? divide(rm1, value)
                    : t.error(
                        `Unknown operator ${op} after ${variable}`,
                        incAssignmentExpr,
                      ),
            // @todo why use this.unit? When you can do all the math in kg and just adjust at display time?
            // this.unit
            "kg",
          ),
        );
        return t.getGlobal("rm1");
      } else if (
        t.mode === "planner" &&
        isOneOf(
          variable,
          "reps",
          "weights",
          "RPE",
          "minReps",
          "timers",
          "setVariationIndex",
          "descriptionIndex",
          "numberOfSets",
        )
      ) {
        const op = t.getText(incAssignmentExpr);
        return isOneOf(op, "=", "+=", "-=", "*=", "/=")
          ? recordVariableUpdate(variable, expression, indexExprs, op, t)
          : t.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
      } else if (t.mode === "update" && variable === "numberOfSets") {
        const op = t.getText(incAssignmentExpr);
        return isOneOf(op, "=", "+=", "-=", "*=", "/=")
          ? changeNumberOfSets(expression, op, t)
          : t.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
      } else if (
        t.mode === "update" &&
        isOneOf(variable, "reps", "weights", "RPE", "minReps", "timers")
      ) {
        const op = t.getText(incAssignmentExpr);
        return isOneOf(op, "=", "+=", "-=", "*=", "/=")
          ? changeBinding(variable, expression, indexExprs, op, t)
          : t.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
      } else {
        return t.error(`Unknown variable '${variable}'`, stateVar);
      }
    }
    case NodeName.VariableExpression: {
      const varKey = t.getText(stateVar).replace("var.", "");
      let value = t.recurse(expression);
      if (
        !(is(TWeight, value) || is(TDynamicWeight, value) || isNumber(value))
      ) {
        value = value ? 1 : 0;
      }
      const op = t.getText(incAssignmentExpr);
      if (isOneOf(op, "=", "+=", "-=", "*=", "/=")) {
        switch (op) {
          case "+=":
            return t.updateVar(varKey, add(t.getVar(varKey), value));
          case "-=":
            return t.updateVar(varKey, subtract(t.getVar(varKey), value));
          case "*=":
            return t.updateVar(varKey, multiply(t.getVar(varKey), value));
          case "/=":
            return t.updateVar(varKey, divide(t.getVar(varKey), value));
          case "=":
            // @todo this would be solved if we used the desugaring method - this would never be reached
            return t.error(
              `Unknown operator ${op} after ${varKey}`,
              incAssignmentExpr,
            );
          default:
            return op satisfies never;
        }
      } else {
        return t.error(
          `Unknown operator ${op} after ${varKey}`,
          incAssignmentExpr,
        );
      }
    }
    case NodeName.Variable: {
      const indexNode = queryChild(stateVar, {
        ofType: NodeName.StateVariableIndex,
      });
      const stateKeyNode = queryChild(stateVar, { ofType: NodeName.Keyword });
      if (stateKeyNode === undefined) {
        // @todo why return 0? why not just undefined?
        return 0;
      }
      const stateKey = t.getText(stateKeyNode);
      // The presence of an index node indicates that we're accessing an "other state"
      // @todo I still don't understand this "otherstate" system? Why not just have one state? Or is this the state of another exercise than the one being evaluated?

      // @todo this coercion is different than  in other places. In this one, arrays are always coerced to 1, but in others, you extract the first value and coerce that as an individual
      let value = t.recurse(expression);
      if (!isQuantity(value)) {
        value = value ? 1 : 0;
      }
      const op = t.getText(incAssignmentExpr);
      // @todo in original liftoscript, if updating an "other state" via index, but there is no state at the index, then you just return the evaluated value, and it's all fine. The update is ignored. Is that still happening?
      return t.updateState(
        stateKey,
        (currentValue = 0) =>
          op === "+="
            ? add(currentValue, value)
            : op === "-="
              ? subtract(currentValue, value)
              : op === "*="
                ? multiply(currentValue, value)
                : op === "/="
                  ? divide(currentValue, value)
                  : t.error(
                      `Unknown operator ${op} after state.${stateKey}`,
                      incAssignmentExpr,
                    ),
        n,
        indexNode ? toNumberUnsafe(t.recurse(indexNode)) : undefined,
      );
    }
    default:
      stateVar.type.name satisfies never;
  }
};
