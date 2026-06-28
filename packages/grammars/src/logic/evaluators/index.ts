import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/logic/parsing/guards.ts";
import {
  type EvaluateTools,
  IProgramMode,
  type IProgramState,
  type IScriptBindings,
  type LogicHandler,
  type ValidationTools,
  type Validator,
} from "@/logic/evaluators/types.ts";
import { parser } from "@/logic/parsing/logic.ts";
import {
  type ILiftoscriptEvaluatorUpdate,
  type LogicResult,
} from "@/logic/types.ts";
import type { IScriptFnContext, IScriptFunctions } from "@/common-types.ts";
import {
  nodeError,
  parseBound,
  SourcedSyntaxError,
  type SourcedSyntaxNode,
} from "@/utils/lezer.ts";
import { queryTree } from "@/utils/grammars.ts";
import type { IEither } from "@/utils/types.ts";

/**
 * The handler for when we haven't decided how to handle a node
 * @param n The node
 * @param t The tools
 * @deprecated There shouldn't be any unhandled nodes
 */
const NOT_IMPLEMENTED: LogicHandler<NodeNames_Logic> = (n, t) => {
  throw nodeError(n, `Not implemented - type ${n.type.name}`);
};

/**
 * Dictionary of evaluation methods for different logic nodes.
 */
const parsers: {
  [Key in NodeNames_Logic]: {
    handler: LogicHandler<Key>;
    validator?: Validator<Key>;
  };
} = {
  AndOr: { handler: NOT_IMPLEMENTED },
  AssignmentExpression: await import("./node-assignment-expression"),
  BinaryExpression: await import("./node-binary-expression"),
  BlockExpression: await import("./node-block-expression"),
  BuiltinFunctionExpression: await import("./node-builtin-function-expression"),
  Cmp: { handler: NOT_IMPLEMENTED },
  ForExpression: await import("./node-for-expression"),
  ForInExpression: await import("./node-for-in-expression"),
  IfExpression: await import("./node-if-expression"),
  IncAssignment: { handler: NOT_IMPLEMENTED },
  IncAssignmentExpression: await import("./node-inc-assignment-expression"),
  Keyword: { handler: NOT_IMPLEMENTED },
  LineComment: await import("./node-line-comment"),
  Not: { handler: NOT_IMPLEMENTED },
  Number: { handler: NOT_IMPLEMENTED },
  NumberExpression: await import("./node-number-expression"),
  ParenthesisExpression: await import("./node-parenthesis-expression"),
  Percentage: await import("./node-percentage"),
  Plus: { handler: NOT_IMPLEMENTED },
  Program: await import("./node-program"),
  StateKeyword: { handler: NOT_IMPLEMENTED },
  StateVariable: await import("./node-state-variable"),
  StateVariableIndex: await import("./node-state-variable-index"),
  Ternary: await import("./node-ternary"),
  Times: { handler: NOT_IMPLEMENTED },
  UnaryExpression: await import("./node-unary-expression"),
  Unit: { handler: NOT_IMPLEMENTED },
  Variable: await import("./node-variable"),
  VariableExpression: await import("./node-variable-expression"),
  VariableIndex: { handler: NOT_IMPLEMENTED },
  WeightExpression: await import("./node-weight-expression"),
  Wildcard: { handler: NOT_IMPLEMENTED },
};

function handleLogic(
  node: SourcedSyntaxNode,
  tools: EvaluateTools,
): LogicResult {
  const handler: LogicHandler<NodeNames_Logic> | undefined = isLogicNodeName(
    node.name,
  )
    ? (parsers[node.name].handler as LogicHandler<NodeNames_Logic>)
    : undefined;
  if (!handler) {
    throw nodeError(node, `No handler for node type: ${node.type}`);
  }
  const result = handler(node as TypedLogicNode<NodeNames_Logic>, tools);
  // console.log("EVAL: ", result, " <- ", node.source);
  return result;
}

export function* validate(
  node: SourcedSyntaxNode,
  tools: ValidationTools,
): Generator<SourcedSyntaxError> {
  for (const n of queryTree(node)) {
    if (n.type.isError) {
      yield nodeError(n);
      return;
    }

    const validator: Validator<NodeNames_Logic> | undefined = isLogicNodeName(
      n.name,
    )
      ? (parsers[n.name].validator as Validator<NodeNames_Logic>)
      : undefined;
    yield* validator?.(n as TypedLogicNode<NodeNames_Logic>, tools) ?? [];
  }
}

/**
 * Runs a script to return it's value
 * @todo all calls to this function in old liftoscript took in a units parameter, which was settings.units on all call
 *   sites. But it doesn't seem necessary to do that since all math can be done in any unit, and then converted after
 *   to display in whichever unit is needed. So I'm leaving that off and will delete this comment once I'm sure it's not needed.
 * @param logic The script to run
 * @param initialState
 * @param globalData
 * @param publicFunctions
 * @param fnContext
 * @param otherStates
 * @param mode
 */
export function run(
  logic: string,
  initialState: Readonly<IProgramState>,
  globalData: IScriptBindings,
  publicFunctions: IScriptFunctions,
  fnContext: IScriptFnContext,
  // @TODO in original liftoscript, there seems to be multiple use cases for this -> either states by tag, or by exercise, or something else.... not sure how to hook this up, or how to test for it.
  otherStates: Record<string | number, IProgramState>,
  mode: IProgramMode,
): {
  result: IEither<LogicResult, string>;
  finalState: IProgramState;
  updates: ILiftoscriptEvaluatorUpdate[];
} {
  const state: IProgramState = { ...initialState };
  const updates: ILiftoscriptEvaluatorUpdate[] = [];
  // @TODO surely this is something which needs to be reset between blocks? Not sure at all why this is different that state if that's not the case
  const vars: IProgramState = {};

  const tools: EvaluateTools = {
    mode,
    recurse: (node) => handleLogic(node, tools),
    getState: (key, relatedNode, index) => {
      if (index === undefined) {
        if (key in state) {
          return state[key];
        }
        throw nodeError(relatedNode, `There's no state variable '${key}'`);
      }

      if (index in otherStates && key in otherStates[key]) {
        return otherStates[index][key];
      }
      throw nodeError(
        relatedNode,
        `There's no state variable '${key}' in the state dictionary at index '${index}'`,
      );
    },
    updateState: (key, value, relatedNode, index) => {
      if (index === undefined) {
        if (!(key in state)) {
          throw nodeError(relatedNode, `There's no state variable '${key}'`);
        }
        return (state[key] =
          typeof value === "function" ? value(state[key]) : value);
      }
      if (!(index in otherStates && key in otherStates[index])) {
        // Silently ignore update, as per the spec
        return typeof value === "function" ? value(undefined) : value;
      }
      if (!(key in otherStates[index])) {
        throw nodeError(
          relatedNode,
          `There's no state variable '${key}' in the state dictionary at index '${index}'`,
        );
      }
      return (otherStates[index][key] =
        typeof value === "function" ? value(otherStates[index][key]) : value);
    },
    upsertState: (key, value) => {
      state[key] = value;
    },
    getGlobal: (key) => globalData[key],
    updateGlobal: (key, valueOrSetter) => {
      globalData[key] =
        typeof valueOrSetter === "function"
          ? valueOrSetter(globalData[key])
          : valueOrSetter;
    },
    requestUpdate: (update) => {
      updates.push(update);
    },
    getVar(key) {
      return vars[key];
    },
    updateVar(key, value) {
      return (vars[key] = value);
    },
    publicFunctions,
    fnContext,
  };

  // @todo this should keep getting pushed down so you can collect ALL errors before returning, rather than returning only the first error?
  let result: IEither<LogicResult, string>;
  try {
    result = {
      success: true,
      data: handleLogic(parseBound(parser, logic), tools),
    };
  } catch (e) {
    if (e instanceof SyntaxError) {
      result = { success: false, error: e.message };
    } else {
      throw e;
    }
  }

  return {
    result,
    finalState: state,
    updates,
  };
}
