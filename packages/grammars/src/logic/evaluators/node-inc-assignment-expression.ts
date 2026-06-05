import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";

export const handler: LogicHandler<"IncAssignmentExpression"> = (n, t) => {
  const [stateVar, incAssignmentExpr, expression] = getChildren(expr);
  if (
    stateVar == null ||
    (stateVar.type.name !== NodeName.StateVariable &&
      stateVar.type.name !== NodeName.VariableExpression &&
      stateVar.type.name !== NodeName.Variable) ||
    expression == null ||
    incAssignmentExpr == null
  ) {
    assert(NodeName.IncAssignmentExpression);
  }
  if (stateVar.type.name === NodeName.VariableExpression) {
    const nameNode = stateVar.getChild(NodeName.Keyword);
    if (nameNode == null) {
      this.error(`Missing variable name`, stateVar);
    }
    const indexExprs = stateVar.getChildren(NodeName.VariableIndex);
    const variable = this.getValue(nameNode);
    if (variable === "rm1") {
      if (indexExprs.length > 0) {
        this.error(`rm1 is not an array`, expr);
      }
      const evaluatedValue = this.evaluate(expression);
      let value = Array.isArray(evaluatedValue)
        ? evaluatedValue[0]
        : evaluatedValue;
      value = value ?? 0;
      value = value === true ? 1 : value === false ? 0 : value;

      const op = this.getValue(incAssignmentExpr);
      if (op === "+=") {
        this.bindings.rm1 = Weight_convertToWeight(
          this.bindings.rm1,
          this.add(this.bindings.rm1, value),
          this.unit,
        );
      } else if (op === "-=") {
        this.bindings.rm1 = Weight_convertToWeight(
          this.bindings.rm1,
          this.subtract(this.bindings.rm1, value),
          this.unit,
        );
      } else if (op === "*=") {
        this.bindings.rm1 = Weight_convertToWeight(
          this.bindings.rm1,
          this.multiply(this.bindings.rm1, value),
          this.unit,
        );
      } else if (op === "/=") {
        this.bindings.rm1 = Weight_convertToWeight(
          this.bindings.rm1,
          this.divide(this.bindings.rm1, value),
          this.unit,
        );
      } else {
        this.error(
          `Unknown operator ${op} after ${variable}`,
          incAssignmentExpr,
        );
      }
      return this.bindings.rm1;
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
      const op = this.getValue(incAssignmentExpr);
      if (
        op !== "=" &&
        op !== "+=" &&
        op !== "-=" &&
        op !== "*=" &&
        op !== "/="
      ) {
        this.error(
          `Unknown operator ${op} after ${variable}`,
          incAssignmentExpr,
        );
      }
      return this.recordVariableUpdate(variable, expression, indexExprs, op);
    } else if (this.mode === "update" && variable === "numberOfSets") {
      const op = this.getValue(incAssignmentExpr);
      if (
        op !== "=" &&
        op !== "+=" &&
        op !== "-=" &&
        op !== "*=" &&
        op !== "/="
      ) {
        this.error(
          `Unknown operator ${op} after ${variable}`,
          incAssignmentExpr,
        );
      }
      return this.changeNumberOfSets(expression, op);
    } else if (
      this.mode === "update" &&
      (variable === "reps" ||
        variable === "weights" ||
        variable === "RPE" ||
        variable === "minReps" ||
        variable === "timers")
    ) {
      const op = this.getValue(incAssignmentExpr);
      if (
        op !== "=" &&
        op !== "+=" &&
        op !== "-=" &&
        op !== "*=" &&
        op !== "/="
      ) {
        this.error(
          `Unknown operator ${op} after ${variable}`,
          incAssignmentExpr,
        );
      }
      return this.changeBinding(variable, expression, indexExprs, op);
    } else {
      this.error(`Unknown variable '${variable}'`, stateVar);
    }
  } else if (stateVar.type.name === NodeName.Variable) {
    const varKey = this.getValue(stateVar).replace("var.", "");
    let value = this.evaluate(expression);
    if (
      !(Weight_is(value) || Weight_isPct(value) || typeof value === "number")
    ) {
      value = value ? 1 : 0;
    }
    const op = this.getValue(incAssignmentExpr);
    if (
      op !== "=" &&
      op !== "+=" &&
      op !== "-=" &&
      op !== "*=" &&
      op !== "/="
    ) {
      this.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
    }
    const currentValue = this.vars[varKey];
    if (op === "+=") {
      this.vars[varKey] = this.add(currentValue, value);
    } else if (op === "-=") {
      this.vars[varKey] = this.subtract(currentValue, value);
    } else if (op === "*=") {
      this.vars[varKey] = this.multiply(currentValue, value);
    } else if (op === "/=") {
      this.vars[varKey] = this.divide(currentValue, value);
    } else {
      this.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
    }
    return this.vars[varKey];
  } else {
    const indexNode = stateVar.getChild(NodeName.StateVariableIndex);
    const stateKeyNode = stateVar.getChild(NodeName.Keyword);
    if (stateKeyNode != null) {
      const stateKey = this.getValue(stateKeyNode);
      let state: IProgramState | undefined;
      if (indexNode == null) {
        if (stateKey in this.state) {
          state = this.state;
        } else {
          this.error(`There's no state variable '${stateKey}'`, stateVar);
        }
      } else {
        const indexEval = this.evaluate(indexNode);
        const index = this.toNumber(indexEval);
        state = this.otherStates[index];
      }

      let value = this.evaluate(expression);
      if (state != null) {
        if (
          !(
            Weight_is(value) ||
            Weight_isPct(value) ||
            typeof value === "number"
          )
        ) {
          value = value ? 1 : 0;
        }
        const op = this.getValue(incAssignmentExpr);
        const currentValue = state[stateKey] ?? 0;
        if (op === "+=") {
          state[stateKey] = this.add(currentValue, value);
        } else if (op === "-=") {
          state[stateKey] = this.subtract(currentValue, value);
        } else if (op === "*=") {
          state[stateKey] = this.multiply(currentValue, value);
        } else if (op === "/=") {
          state[stateKey] = this.divide(currentValue, value);
        } else {
          this.error(
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
