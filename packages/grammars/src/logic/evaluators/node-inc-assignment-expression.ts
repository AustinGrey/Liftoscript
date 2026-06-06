import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import { is, isNumber, isOneOf } from "@/utils/types.ts";
import {
  TDynamicWeight,
  TWeight,
  convertToWeight,
  add,
  subtract,
  divide,
  multiply,
} from "@/quantities/weight.ts";
import type { IProgramState } from "@/common-types.ts";

export const handler: LogicHandler<"IncAssignmentExpression"> = (n, t) => {
  const [stateVar, incAssignmentExpr, expression] = queryChildren(n, {
    atLeast: 3,
  });
  if (
    stateVar == null ||
    (stateVar.type.name !== NodeName.StateVariable &&
      stateVar.type.name !== NodeName.VariableExpression &&
      stateVar.type.name !== NodeName.Variable) ||
    expression == null ||
    incAssignmentExpr == null
  ) {
    t.error(
      `missing required nodes for ${NodeName.IncAssignmentExpression}`,
      n,
    );
  }
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
      const evaluatedValue = t.recurse(expression);
      let value = Array.isArray(evaluatedValue)
        ? evaluatedValue[0]
        : evaluatedValue;
      value = value ?? 0;
      value = value === true ? 1 : value === false ? 0 : value;

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
      this.mode === "planner" &&
      (variable === "reps" ||
        variable === "weights" ||
        variable === "RPE" ||
        variable === "minReps" ||
        variable === "timers" ||
        variable === "setVariationIndex" ||
        variable === "descriptionIndex" ||
        variable === "numberOfSets")
    ) {
      const op = t.getText(incAssignmentExpr);
      if (
        op !== "=" &&
        op !== "+=" &&
        op !== "-=" &&
        op !== "*=" &&
        op !== "/="
      ) {
        t.error(`Unknown operator ${op} after ${variable}`, incAssignmentExpr);
      }
      return this.recordVariableUpdate(variable, expression, indexExprs, op);
    } else if (this.mode === "update" && variable === "numberOfSets") {
      const op = t.getText(incAssignmentExpr);
      if (isOneOf(op, "=", "+=", "-=", "*=", "/=")) {
        return this.changeNumberOfSets(expression, op);
      }
      t.error(`Unknown operator ${op} after ${variable}`, incAssignmentExpr);
    } else if (
      this.mode === "update" &&
      isOneOf(variable, "reps", "weights", "RPE", "minReps", "timers")
    ) {
      const op = t.getText(incAssignmentExpr);
      if (isOneOf(op, "=", "+=", "-=", "*=", "/=")) {
        return this.changeBinding(variable, expression, indexExprs, op);
      }
      t.error(`Unknown operator ${op} after ${variable}`, incAssignmentExpr);
    } else {
      t.error(`Unknown variable '${variable}'`, stateVar);
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
          return (this.vars[varKey] = add(this.vars[varKey], value));
        case "-=":
          return (this.vars[varKey] = subtract(this.vars[varKey], value));
        case "*=":
          return (this.vars[varKey] = multiply(this.vars[varKey], value));
        case "/=":
          return (this.vars[varKey] = divide(this.vars[varKey], value));
        default:
          op satisfies never;
          t.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
      }
    } else {
      t.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
    }
  } else {
    const indexNode = stateVar.getChild(NodeName.StateVariableIndex);
    const stateKeyNode = stateVar.getChild(NodeName.Keyword);
    if (stateKeyNode != null) {
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
        const index = this.toNumber(indexEval);
        state = this.otherStates[index];
      }

      let value = t.recurse(expression);
      if (state != null) {
        if (
          !(is(TWeight, value) || is(TDynamicWeight, value) || isNumber(value))
        ) {
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
      } else {
        return value;
      }
    } else {
      return 0;
    }
  }
};
