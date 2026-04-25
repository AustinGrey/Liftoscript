import {
  type EvaluateTools,
  type IProgramState,
  type LogicHandler,
} from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_convertToWeight,
} from "@/evaluators/logic-evaluator.ts";
import { isLogicNodeOfType } from "@/parsers/guards.ts";
import {
  type IAssignmentOp,
  isQuantity,
  type Quantity,
} from "@/logic/types.ts";
import { toNumberUnsafe } from "@/logic/result-handling.ts";
import type { SyntaxNode } from "@lezer/common";
import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { CollectionUtils_compact } from "@/utils/collection.ts";
import { is, isNumber } from "@/utils/types.ts";

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
      value = Weight_convertToWeight(t.getGlobal("rm1"), value, this.unit);
      t.updateGlobal("rm1", value);
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
      return recordVariableUpdate(variable, expression, indexExprs, "=", t);
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
    if (isQuantity(value)) {
      this.vars[varKey] = value;
    } else {
      this.vars[varKey] = value ? 1 : 0;
    }
    return this.vars[varKey];
  } else if (isLogicNodeOfType("StateVariable", variableNode)) {
    const indexNode = variableNode.getChild(NodeName.StateVariableIndex);
    const stateKeyNode = variableNode.getChild(NodeName.Keyword);
    if (stateKeyNode == null) {
      return 0;
    }
    const stateKey = t.getText(stateKeyNode);
    let state: IProgramState | undefined;
    if (indexNode == null) {
      if (stateKey in this.state) {
        state = this.state;
      } else {
        return t.error(`There's no state variable '${stateKey}'`, variableNode);
      }
    } else {
      const index = toNumberUnsafe(t.recurse(indexNode));
      state = this.otherStates[index];
    }
    const value = t.recurse(expression);
    if (state != null) {
      if (isQuantity(value)) {
        state[stateKey] = value;
      } else {
        state[stateKey] = value ? 1 : 0;
      }
    }
    return value;
  }
  return t.error("Cannot assign a value to something other than a variable", n);
};

function recordVariableUpdate(
  key:
    | "reps"
    | "weights"
    | "timers"
    | "RPE"
    | "minReps"
    | "setVariationIndex"
    | "descriptionIndex"
    | "numberOfSets"
    | "logrpes"
    | "amraps"
    | "askweights",
  expression: SyntaxNode,
  indexExprs: SyntaxNode[],
  op: IAssignmentOp,
  tools: EvaluateTools,
): Quantity {
  const indexes = indexExprs
    .map((ie) => queryChild(ie))
    .filter((i) => i != undefined);
  const maxTargetLength =
    key === "setVariationIndex" || key === "descriptionIndex"
      ? 2
      : key === "numberOfSets"
        ? 3
        : 4;
  if (key === "setVariationIndex") {
    if (indexes.length > maxTargetLength) {
      return tools.error(
        `setVariationIndex can only have 2 values inside [*:*]`,
        expression,
      );
    }
  } else if (key === "descriptionIndex") {
    if (indexes.length > maxTargetLength) {
      return tools.error(
        `descriptionIndex can only have 2 values inside [*:*]`,
        expression,
      );
    }
  } else if (key === "numberOfSets") {
    if (indexes.length > maxTargetLength) {
      return tools.error(
        `numberOfSets can only have 3 values inside [*:*:*]`,
        expression,
      );
    }
  } else if (indexes.length > maxTargetLength) {
    return tools.error(
      `${key} can only have 4 values inside [*:*:*:*]`,
      expression,
    );
  }
  const indexValues = calculateIndexValues(indexes, tools);
  const normalizedIndexValues = normalizeTarget(indexValues, maxTargetLength);
  let result: number | IWeight | IDynamicWeight;
  if (key === "weights") {
    result = evaluateToQuantity(expression, tools);
    tools.requestUpdate({
      type: key,
      value: { value: result, op, target: normalizedIndexValues },
    });
  } else {
    result = evaluateToNumber(expression, tools);
    tools.requestUpdate({
      type: key,
      value: { value: result, op, target: normalizedIndexValues },
    });
    if (key === "setVariationIndex") {
      const [week, day] = normalizedIndexValues;
      if (
        (week === "*" || week === tools.getGlobal("week")) &&
        (day === "*" || day === tools.getGlobal("day"))
      ) {
        tools.updateGlobal("setVariationIndex", result);
      }
    } else if (key === "descriptionIndex") {
      const [week, day] = normalizedIndexValues;
      if (
        (week === "*" || week === tools.getGlobal("week")) &&
        (day === "*" || day === tools.getGlobal("day"))
      ) {
        tools.updateGlobal("descriptionIndex", result);
      }
    } else if (key === "numberOfSets") {
      const [week, day, setVariationIndex] = normalizedIndexValues;
      if (
        (week === "*" || week === tools.getGlobal("week")) &&
        (day === "*" || day === tools.getGlobal("day")) &&
        (setVariationIndex === "*" ||
          setVariationIndex === tools.getGlobal("setVariationIndex"))
      ) {
        tools.updateGlobal("numberOfSets", result);
        tools.updateGlobal("ns", result);
      }
    }
  }

  return result;
}

function calculateIndexValues(
  indexes: SyntaxNode[],
  tools: EvaluateTools,
): (number | "*")[] {
  return CollectionUtils_compact(indexes).map((ie) => {
    if (ie.type.name === NodeName.Wildcard) {
      return "*" as const;
    } else {
      const v = tools.recurse(ie);
      const v1 = Array.isArray(v) ? v[0] : v;
      return is(TWeight, v1) ? v1.value : isNumber(v1) ? v1 : v1 ? 1 : 0;
    }
  });
}

function evaluateToNumber(expr: SyntaxNode, tools: EvaluateTools): number {
  const v = tools.recurse(expr);
  const v1 = Array.isArray(v) ? v[0] : v;
  return is(TWeight, v1) ? v1.value : isNumber(v1) ? v1 : v1 ? 1 : 0;
}

function evaluateToQuantity(expr: SyntaxNode, tools: EvaluateTools): Quantity {
  const v = tools.recurse(expr);
  const v1 = Array.isArray(v) ? v[0] : v;
  return is(TWeight, v1) || is(TDynamicWeight, v1)
    ? v1
    : isNumber(v1)
      ? v1
      : v1
        ? 1
        : 0;
}

/**
 * Adds '*' to the front of an array until it reaches the specified length.
 * Returns a new array, the original is untouched
 * @param target The target array
 * @param length The target length to pad to
 * @TODO move to the collection utils
 */
function normalizeTarget(
  target: Readonly<(number | "*")[]>,
  length: number,
): (number | "*")[] {
  const newTarget = [...target];
  for (let i = 0; i < length - target.length; i++) {
    newTarget.unshift("*");
  }
  return newTarget;
}
