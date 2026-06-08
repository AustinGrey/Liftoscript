import {
  type IScriptBindings,
  LiftoscriptSyntaxError,
  type LogicHandler,
  type Validator,
} from "@/logic/evaluators/types.ts";
import { getChild, queryChildren } from "@/utils/grammars.ts";
import {
  NodeName,
  Weight_is,
  Weight_isPct,
} from "@/evaluators/logic-evaluator.ts";

export const handler: LogicHandler<"VariableExpression"> = (n, t) => {
  // Get the variable to be indexed
  const nameNode = getChild(n);
  const name = nameNode.source as keyof IScriptBindings;

  // Get the logic that will determine which index to pull from the variable
  // Ignore other nodes found here.
  const [firstIndexExpression, ...otherIndexExpressions] = queryChildren(n, {
    ofType: NodeName.VariableIndex,
  });
  if (!firstIndexExpression) {
    // There is no indexing happening
    let value = t.getGlobal(name);
    if (Array.isArray(value) && name === "minReps") {
      value = value.map((v, i) => (v as number) ?? t.getGlobal("reps")[i]);
    }
    return value;
  } else if (otherIndexExpressions.length === 0) {
    // There is only one index expression, so we can evaluate it
    const [indexNode] = queryChildren(firstIndexExpression);
    if (
      indexNode.type.name === NodeName.Wildcard ||
      indexNode.type.name === NodeName.Current
    ) {
      return t.error(
        `Can't use '*' or '_' as an index when reading from variables`,
        indexNode,
      );
    }
    const indexEval = t.recurse(indexNode);
    let index: number;
    if (Weight_is(indexEval) || Weight_isPct(indexEval)) {
      index = indexEval.value;
    } else if (typeof indexEval === "number") {
      index = indexEval;
    } else {
      index = indexEval ? 1 : 0;
    }
    index -= 1;
    const binding = t.getGlobal(name);
    if (!Array.isArray(binding)) {
      return t.error(`Variable ${name} should be an array`, nameNode);
    }
    if (index >= binding.length) {
      return t.error(
        `Out of bounds index ${index + 1} for array ${name}`,
        nameNode,
      );
    }
    let value = binding[index];
    if (value == null) {
      value = name === "minReps" ? (t.getGlobal("reps")[index] ?? 0) : 0;
    }
    return value;
  } else {
    return t.error(
      `Can't use [1:1] syntax when reading from the ${name} variable`,
      n,
    );
  }
};

export const validator: Validator<"VariableExpression"> = function* (n, t) {
  const [nameNode, indexExpr] = queryChildren(n);
  if (nameNode == null) {
    yield LiftoscriptSyntaxError.fromNode(
      `Expected a ${NodeName.VariableExpression} child in a ${NodeName.StateVariable} node, but found none`,
      n,
    );
    return;
  }
  const name = nameNode.source;
  if (indexExpr != null) {
    const validNames: (keyof IScriptBindings)[] = [
      "originalWeights",
      "weights",
      "reps",
      "minReps",
      "completedReps",
      "completedRepsLeft",
      "completedWeights",
      "timers",
      "w",
      "r",
      "cr",
      "cw",
      "mr",
      "completedRPE",
      "bodyweight",
      "RPE",
      "setVariationIndex",
      "descriptionIndex",
      "numberOfSets",
      "programNumberOfSets",
      "completedNumberOfSets",
      "amraps",
      "logrpes",
      "askweights",
    ];
    if (!validNames.includes(name as keyof IScriptBindings)) {
      yield LiftoscriptSyntaxError.fromNode(
        `${name} is not an array variable`,
        nameNode,
      );
      return;
    }
  }

  if (!t.knownBindings.includes(name)) {
    yield LiftoscriptSyntaxError.fromNode(
      `${name} is not a valid variable`,
      nameNode,
    );
    return;
  }
};
