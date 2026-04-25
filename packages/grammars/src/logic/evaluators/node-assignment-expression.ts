import {
  type EvaluateTools,
  type IProgramState,
  type LogicHandler,
} from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_build,
  Weight_buildAny,
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
import { MathUtils_applyOp } from "@/utils/math.ts";

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
      // @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
      // I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
      // value = Weight_convertToWeight(t.getGlobal("rm1"), value, this.unit);
      value = Weight_convertToWeight(t.getGlobal("rm1"), value, "kg");
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
      return changeNumberOfSets(expression, "=", t);
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

function changeNumberOfSets(
  expression: SyntaxNode,
  op: IAssignmentOp,
  tools: EvaluateTools,
): number | IWeight | IDynamicWeight {
  const oldNumberOfSets = tools.getGlobal("weights").length;
  const evaluatedValue = MathUtils_applyOp(
    tools.getGlobal("numberOfSets"),
    evaluateToNumber(expression, tools),
    op,
  );

  this.bindings.weights = tools.getGlobal("weights").slice(0, evaluatedValue);
  this.bindings.originalWeights = tools
    .getGlobal("originalWeights")
    .slice(0, evaluatedValue);
  this.bindings.reps = tools.getGlobal("reps").slice(0, evaluatedValue);
  this.bindings.minReps = tools.getGlobal("minReps").slice(0, evaluatedValue);
  this.bindings.RPE = tools.getGlobal("RPE").slice(0, evaluatedValue);
  this.bindings.w = tools.getGlobal("weights").slice(0, evaluatedValue);
  this.bindings.r = tools.getGlobal("reps").slice(0, evaluatedValue);
  this.bindings.mr = tools.getGlobal("minReps").slice(0, evaluatedValue);
  this.bindings.timers = tools.getGlobal("timers").slice(0, evaluatedValue);
  this.bindings.amraps = tools.getGlobal("amraps").slice(0, evaluatedValue);
  this.bindings.logrpes = tools.getGlobal("logrpes").slice(0, evaluatedValue);
  this.bindings.askweights = tools
    .getGlobal("askweights")
    .slice(0, evaluatedValue);
  this.bindings.completedReps = tools
    .getGlobal("completedReps")
    .slice(0, evaluatedValue);
  this.bindings.completedRepsLeft = tools
    .getGlobal("completedRepsLeft")
    .slice(0, evaluatedValue);
  this.bindings.cr = tools.getGlobal("cr").slice(0, evaluatedValue);
  this.bindings.cw = tools.getGlobal("cw").slice(0, evaluatedValue);
  this.bindings.completedWeights = tools
    .getGlobal("completedWeights")
    .slice(0, evaluatedValue);
  this.bindings.completedRPE = tools
    .getGlobal("completedRPE")
    .slice(0, evaluatedValue);
  this.bindings.isCompleted = tools
    .getGlobal("isCompleted")
    .slice(0, evaluatedValue);

  const ns = oldNumberOfSets - 1;
  for (let i = 0; i < evaluatedValue; i += 1) {
    if (i > ns) {
      this.bindings.weights[i] = Weight_build(
        tools.getGlobal("weights")[ns]?.value ?? 0,
        tools.getGlobal("weights")[ns]?.unit || "lb",
      );
      this.bindings.originalWeights[i] = Weight_buildAny(
        tools.getGlobal("originalWeights")[ns]?.value ?? 0,
        tools.getGlobal("originalWeights")[ns]?.unit || "lb",
      );
      this.bindings.reps[i] = tools.getGlobal("reps")[ns] ?? 0;
      this.bindings.timers[i] = tools.getGlobal("timers")[ns];
      this.bindings.amraps[i] = tools.getGlobal("amraps")[ns];
      this.bindings.logrpes[i] = tools.getGlobal("logrpes")[ns];
      this.bindings.askweights[i] = tools.getGlobal("askweights")[ns];
      this.bindings.minReps[i] = tools.getGlobal("minReps")[ns];
      this.bindings.RPE[i] = tools.getGlobal("RPE")[ns];
      this.bindings.w[i] = tools.getGlobal("weights")[i];
      this.bindings.r[i] = tools.getGlobal("reps")[i];
      this.bindings.mr[i] = tools.getGlobal("minReps")[i];
      this.bindings.completedReps[i] = undefined;
      this.bindings.completedRepsLeft[i] = undefined;
      this.bindings.completedWeights[i] = undefined;
      this.bindings.completedRPE[i] = undefined;
      this.bindings.cr[i] = undefined;
      this.bindings.cw[i] = undefined;
      this.bindings.isCompleted[i] = 0;
    }
  }

  this.bindings.numberOfSets = evaluatedValue;
  this.bindings.ns = evaluatedValue;

  return evaluatedValue;
}
