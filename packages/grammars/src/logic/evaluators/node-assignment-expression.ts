import {
  type EvaluateTools,
  type IProgramState,
  type LogicHandler,
} from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_applyOp,
  Weight_build,
  Weight_buildAny,
  Weight_convertToWeight,
} from "@/evaluators/logic-evaluator.ts";
import * as Weight from "@/models/weight";
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
import {
  MathUtils_applyOp,
  MathUtils_clamp,
  MathUtils_round,
} from "@/utils/math.ts";

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
      //     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
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
      return changeBinding(variable, expression, indexExprs, "=", t);
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

/**
 * Many pieces of data in the globals are arrays that have the same length, the number of sets.
 * So if you change the number of sets, you have to change the length of all these arrays too
 * @TODO this hints at a problem with how this data is stored. If some data is a property of one of the sets, then we should probably have a "set" object, and an array of those
 * @param expression The expression that will be evaluated to decide how many sets there will be
 * @param op The operation used to evaluate the expression
 * @param tools The evaluation tools in the current context
 */
function changeNumberOfSets(
  expression: SyntaxNode,
  op: IAssignmentOp,
  tools: EvaluateTools,
): number | IWeight | IDynamicWeight {
  const oldNumberOfSets = tools.getGlobal("weights").length;
  const ns = oldNumberOfSets - 1;
  const evaluatedValue = MathUtils_applyOp(
    tools.getGlobal("numberOfSets"),
    evaluateToNumber(expression, tools),
    op,
  );

  // For each array whose length is based on the number of sets, we slice it in case the evaluated value is less than the current value, and then we concat a fill in case it's more than the current value
  function chopOrFill<T>(arr: readonly T[], filler: T): T[] {
    const spotsToFill = Math.max(evaluatedValue - arr.length, 0);
    return arr.slice(0, evaluatedValue).concat(Array(spotsToFill).fill(filler));
  }

  // @TODO several of these elements are aliases for others, but we have to duplicate and maintain consistent copies of the data. This is not good design. We should only store data for the vars once, and re-route aliases to access the single copy
  tools.updateGlobal("originalWeights", (x) =>
    chopOrFill(
      x,
      // Copy the last entry to fill
      Weight_buildAny(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
    ),
  );
  tools.updateGlobal("timers", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("amraps", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("logrpes", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("askweights", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("RPE", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("completedRepsLeft", (x) => chopOrFill(x, undefined));
  tools.updateGlobal("completedRPE", (x) => chopOrFill(x, undefined));
  tools.updateGlobal("isCompleted", (x) => chopOrFill(x, 0));

  // @TODO duplicated
  tools.updateGlobal("weights", (x) =>
    chopOrFill(
      x,
      // Copy the last entry to fill
      Weight.build(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
    ),
  );
  tools.updateGlobal("w", (x) =>
    chopOrFill(
      x, // Copy the last entry to fill
      Weight.build(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
    ),
  );

  // @TODO duplicated
  tools.updateGlobal("reps", (x) => chopOrFill(x, x[ns] ?? 0));
  tools.updateGlobal("r", (x) => chopOrFill(x, x[ns] ?? 0));

  // @TODO duplicated
  tools.updateGlobal("minReps", (x) => chopOrFill(x, x[ns]));
  tools.updateGlobal("mr", (x) => chopOrFill(x, x[ns]));

  // @TODO duplicated
  tools.updateGlobal("completedReps", (x) => chopOrFill(x, undefined));
  tools.updateGlobal("cr", (x) => chopOrFill(x, undefined));

  // @TODO duplicated
  tools.updateGlobal("completedWeights", (x) => chopOrFill(x, undefined));
  tools.updateGlobal("cw", (x) => chopOrFill(x, undefined));

  // Then we can finally update the value
  // @TODO duplicated
  tools.updateGlobal("numberOfSets", evaluatedValue);
  tools.updateGlobal("ns", evaluatedValue);

  return evaluatedValue;
}

function changeBinding(
  key:
    | "reps"
    | "weights"
    | "RPE"
    | "minReps"
    | "timers"
    | "logrpes"
    | "amraps"
    | "askweights",
  expression: SyntaxNode,
  indexExprs: SyntaxNode[],
  op: IAssignmentOp,
  tools: EvaluateTools,
): number | IWeight | IDynamicWeight {
  const indexes = indexExprs
    .map((ie) => queryChild(ie))
    .filter((x) => x !== undefined);
  const maxTargetLength = 1;
  if (indexes.length > maxTargetLength) {
    return tools.error(`${key} can only have 1 value inside []`, expression);
  }
  const indexValues = calculateIndexValues(indexes, tools);
  const normalizedIndexValues = normalizeTarget(indexValues, maxTargetLength);
  const [setIndex] = normalizedIndexValues;
  let value: number | IWeight | IDynamicWeight = 0;
  if (key === "weights") {
    for (let i = 0; i < tools.getGlobal("weights").length; i += 1) {
      if (
        !tools.getGlobal("isCompleted")[i] &&
        (setIndex === "*" || setIndex === i + 1)
      ) {
        const evalutedValue = evaluateToQuantity(expression, tools);
        const newValue = Weight_applyOp(
          tools.getGlobal("rm1"),
          tools.getGlobal("weights")[i] ??
            Weight_build(
              0,
              // @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
              //     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
              // this.unit,
              "kg",
            ),
          evalutedValue,
          op,
        );
        value = Weight_convertToWeight(
          tools.getGlobal("rm1"),
          newValue,
          // @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
          //     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
          // this.unit,
          "kg",
        );
        tools.getGlobal("originalWeights")[i] = value;
        tools.getGlobal("weights")[i] = this.fns.roundWeight(
          value,
          this.fnContext,
        );
      }
    }
  } else {
    for (let i = 0; i < tools.getGlobal(key).length; i += 1) {
      if (
        !tools.getGlobal("isCompleted")[i] &&
        (setIndex === "*" || setIndex === i + 1)
      ) {
        const evaluatedValue = evaluateToNumber(expression, tools);
        value = MathUtils_applyOp(
          tools.getGlobal(key)[i] ?? 0,
          evaluatedValue,
          op,
        );
        if (key === "RPE") {
          value = MathUtils_round(MathUtils_clamp(value, 0, 10), 0.5);
        }
        if (key === "amraps" || key === "logrpes" || key === "askweights") {
          value = Math.round(MathUtils_clamp(value, 0, 1));
        }
        tools.getGlobal(key)[i] = value;
      }
    }
  }
  return value;
}
