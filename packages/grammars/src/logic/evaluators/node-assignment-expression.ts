import {
  LiftoscriptSyntaxError,
  type LogicHandler,
  type Validator,
} from "@/logic/evaluators/types.ts";
import { queryChild, queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_convertToWeight,
} from "@/evaluators/logic-evaluator.ts";
import { isLogicNodeOfType } from "@/logic/parsing/guards.ts";
import { isQuantity } from "@/logic/types.ts";
import { toNumberUnsafe } from "@/logic/result-handling.ts";
import { isOneOf } from "@/utils/types.ts";
import {
  changeBinding,
  changeNumberOfSets,
  recordVariableUpdate,
} from "@/logic/evaluators/common.ts";

export const handler: LogicHandler<"AssignmentExpression"> = (n, t) => {
  const [variableNode, expression] = queryChildren(n, { atLeast: 2 });
  if (isLogicNodeOfType("VariableExpression", variableNode)) {
    const nameNode = variableNode.getChild(NodeName.Keyword);
    if (nameNode == null) {
      return t.error(`Missing variable name`, variableNode);
    }
    const [...indexExprs] = queryChildren(variableNode, {
      ofType: NodeName.VariableIndex,
    });
    const variable = nameNode.source;
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
      value = Weight_convertToWeight(
        t.getGlobal("rm1"),
        value,

        // @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
        //     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
        // this.unit,
        "kg",
      );
      t.updateGlobal("rm1", value);
      return value;
    } else if (
      t.mode === "planner" &&
      isOneOf(
        variable,
        "reps",
        "weights",
        "RPE",
        "minReps",
        "timers",
        "logrpes",
        "amraps",
        "askweights",
        "setVariationIndex",
        "descriptionIndex",
        "numberOfSets",
      )
    ) {
      return recordVariableUpdate(variable, expression, indexExprs, "=", t);
    } else if (t.mode === "update" && variable === "numberOfSets") {
      return changeNumberOfSets(expression, "=", t);
    } else if (
      t.mode === "update" &&
      isOneOf(
        variable,
        "reps",
        "weights",
        "RPE",
        "amraps",
        "logrpes",
        "askweights",
        "minReps",
        "timers",
      )
    ) {
      return changeBinding(variable, expression, indexExprs, "=", t);
    } else {
      return t.error(`Unknown variable '${variable}'`, variableNode);
    }
  } else if (isLogicNodeOfType("Variable", variableNode)) {
    const varKey = variableNode.source.replace("var.", "");
    const value = t.recurse(expression);
    return t.updateVar(varKey, isQuantity(value) ? value : value ? 1 : 0);
  } else if (isLogicNodeOfType("StateVariable", variableNode)) {
    const indexNode = variableNode.getChild(NodeName.StateVariableIndex);
    const stateKeyNode = variableNode.getChild(NodeName.Keyword);
    if (stateKeyNode == null) {
      return 0;
    }
    const stateKey = stateKeyNode.source;

    // There are two different state sources - the normal "state" and the "otherStates" collection of various states
    // @TODO Why? What makes these two different from each other? Hypothesis - "state" is the state of the current exercise, while otherStates is the state of all the other exercises, indexed by set
    // If there is no index node, we assume we are trying to update the current state, otherwise, we pull the state from the other states at that index.
    const value = t.recurse(expression);
    t.updateState(
      stateKey,
      // @TODO why would we be forcing this to be a number? Would it make more sense to bubble an error?
      isQuantity(value) ? value : value ? 1 : 0,
      n,
      indexNode ? toNumberUnsafe(t.recurse(indexNode)) : undefined,
    );
    return value;
  }
  return t.error("Cannot assign a value to something other than a variable", n);
};

export const validator: Validator<"AssignmentExpression"> = function* (n, t) {
  const [variableNode] = queryChildren(n);

  if (variableNode?.type.name === NodeName.Variable) {
    t.trackVariable(variableNode.source);
    return;
  }

  if (variableNode?.type.name === NodeName.VariableExpression) {
    const name = queryChild(variableNode, { ofType: NodeName.Keyword })?.source;
    if (name !== undefined && t.mode === "update") {
      if (
        ![
          "reps",
          "weights",
          "RPE",
          "minReps",
          "numberOfSets",
          "timers",
          "askweights",
          "amraps",
          "logrpes",
        ].includes(name)
      ) {
        yield LiftoscriptSyntaxError.fromNode(
          `Cannot assign to '${name}'`,
          variableNode,
        );
        return;
      }
      const indexExprs = queryChildren(variableNode, {
        ofType: NodeName.VariableIndex,
      }).toArray();
      if (name === "numberOfSets" && indexExprs.length > 0) {
        yield LiftoscriptSyntaxError.fromNode(
          `${name} is not an array`,
          variableNode,
        );
        return;
      }

      if (indexExprs.length > 1) {
        yield LiftoscriptSyntaxError.fromNode(
          `Can't assign to set variations, weeks or days here`,
          variableNode,
        );
        return;
      }
    }
  }
};
