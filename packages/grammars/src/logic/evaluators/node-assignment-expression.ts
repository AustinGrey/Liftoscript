import type { IProgramState, LogicHandler } from "@/logic/evaluators/types.ts";
import { queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_convertToWeight,
  Weight_is,
  Weight_isPct,
} from "@/evaluators/logic-evaluator.ts";
import { isLogicNodeOfType } from "@/parsers/guards.ts";

export const handler: LogicHandler<"AssignmentExpression"> = (n, t) => {
  const [variableNode, expression] = queryChildren(n, { atLeast: 2 });
  if (isLogicNodeOfType("VariableExpression", variableNode)) {
    const nameNode = variableNode.getChild(NodeName.Keyword);
    if (nameNode == null) {
      return t.error(`Missing variable name`, variableNode);
    }
    const indexExprs = variableNode.getChildren(NodeName.VariableIndex);
    const variable = t.getText(nameNode);
    if (variable === "rm1") {
      if (indexExprs.length > 0) {
        return t.error(`rm1 is not an array`, n);
      }
      const evaluatedValue = t.recurse(expression);
      let value = Array.isArray(evaluatedValue)
        ? evaluatedValue[0]
        : evaluatedValue;
      value = value ?? 0;
      value = value === true ? 1 : value === false ? 0 : value;
      value = Weight_convertToWeight(this.bindings.rm1, value, this.unit);
      this.bindings.rm1 = value;
      return value;
    } else if (
      this.mode === "planner" &&
      (variable === "reps" ||
        variable === "weights" ||
        variable === "RPE" ||
        variable === "minReps" ||
        variable === "timers" ||
        variable === "logrpes" ||
        variable === "amraps" ||
        variable === "askweights" ||
        variable === "setVariationIndex" ||
        variable === "descriptionIndex" ||
        variable === "numberOfSets")
    ) {
      return this.recordVariableUpdate(variable, expression, indexExprs, "=");
    } else if (this.mode === "update" && variable === "numberOfSets") {
      return this.changeNumberOfSets(expression, "=");
    } else if (
      this.mode === "update" &&
      (variable === "reps" ||
        variable === "weights" ||
        variable === "RPE" ||
        variable === "amraps" ||
        variable === "logrpes" ||
        variable === "askweights" ||
        variable === "minReps" ||
        variable === "timers")
    ) {
      return this.changeBinding(variable, expression, indexExprs, "=");
    } else {
      return t.error(`Unknown variable '${variable}'`, variableNode);
    }
  } else if (isLogicNodeOfType("Variable", variableNode)) {
    const varKey = t.getText(variableNode).replace("var.", "");
    const value = t.recurse(expression);
    if (Weight_is(value) || Weight_isPct(value) || typeof value === "number") {
      this.vars[varKey] = value;
    } else {
      this.vars[varKey] = value ? 1 : 0;
    }
    return this.vars[varKey];
  } else if (isLogicNodeOfType("StateVariable", variableNode)) {
    const indexNode = variableNode.getChild(NodeName.StateVariableIndex);
    const stateKeyNode = variableNode.getChild(NodeName.Keyword);
    if (stateKeyNode != null) {
      const stateKey = this.getValue(stateKeyNode);
      let state: IProgramState | undefined;
      if (indexNode == null) {
        if (stateKey in this.state) {
          state = this.state;
        } else {
          this.error(`There's no state variable '${stateKey}'`, variableNode);
        }
      } else {
        const indexEval = t.recurse(indexNode);
        const index = this.toNumber(indexEval);
        state = this.otherStates[index];
      }
      const value = t.recurse(expression);
      if (state != null) {
        if (
          Weight_is(value) ||
          Weight_isPct(value) ||
          typeof value === "number"
        ) {
          state[stateKey] = value;
        } else {
          state[stateKey] = value ? 1 : 0;
        }
      }
      return value;
    } else {
      return 0;
    }
  }
  return t.error("Cannot assign a value to something other than a variable", n);
};
