import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { is, isNumber, isOneOf } from "@/utils/types.ts";
import {
  TDynamicWeight,
  TWeight,
  convertToWeight,
} from "@/quantities/weight.ts";
import type { IProgramState } from "@/common-types.ts";
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
import type { Quantity } from "@/logic/types.ts";

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

  if (stateVar.type.name === NodeName.VariableExpression) {
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
  } else if (stateVar.type.name === NodeName.Variable) {
    const varKey = t.getText(stateVar).replace("var.", "");
    let value = t.recurse(expression);
    if (!(is(TWeight, value) || is(TDynamicWeight, value) || isNumber(value))) {
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
        default:
          op satisfies never;
          t.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
      }
    } else {
      t.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
    }
  } else {
    const indexNode = queryChild(stateVar, {
      ofType: NodeName.StateVariableIndex,
    });
    const stateKeyNode = queryChild(stateVar, { ofType: NodeName.Keyword });
    if (stateKeyNode == null) {
      return 0;
    }
    const stateKey = t.getText(stateKeyNode);
    let state: IProgramState | undefined;
    if (indexNode == null) {
      if (stateKey in this.state) {
        state = this.state;
      } else {
        t.error(`There's no state variable '${stateKey}'`, stateVar);
      }
    } else {
      const indexEval = t.recurse(indexNode);
      const index = toNumberUnsafe(indexEval);
      state = this.otherStates[index];
    }

    let value = t.recurse(expression);
    if (state == null) {
      return value;
    }
    if (!(is(TWeight, value) || is(TDynamicWeight, value) || isNumber(value))) {
      value = value ? 1 : 0;
    }
    const op = t.getText(incAssignmentExpr);
    const currentValue = state[stateKey] ?? 0;
    if (op === "+=") {
      state[stateKey] = add(currentValue, value);
    } else if (op === "-=") {
      state[stateKey] = subtract(currentValue, value);
    } else if (op === "*=") {
      state[stateKey] = multiply(currentValue, value);
    } else if (op === "/=") {
      state[stateKey] = divide(currentValue, value);
    } else {
      t.error(
        `Unknown operator ${op} after state.${stateKey}`,
        incAssignmentExpr,
      );
    }
    return state[stateKey];
  }
};
