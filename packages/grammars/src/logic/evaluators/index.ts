import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/logic/parsing/guards.ts";
import type {
  EvaluateTools,
  IProgramState,
  IScriptBindings,
  LogicHandler,
} from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import { parser } from "@/logic/parsing/logic.ts";
import { LiftoscriptSyntaxError } from "@/evaluators/logic-evaluator.ts";
import {
  type ILiftoscriptEvaluatorUpdate,
  type LogicResult,
} from "@/logic/types.ts";
import type { IScriptFnContext, IScriptFunctions } from "@/common-types.ts";

/**
 * The handler for when we haven't decided how to handle a node
 * @param n The node
 * @param t The tools
 * @deprecated There shouldn't be any unhandled nodes
 */
const NOT_IMPLEMENTED: LogicHandler<NodeNames_Logic> = (n, t) =>
  t.error("Not implemented", n);

/**
 * Dictionary of evaluation methods for different logic nodes.
 */
const handlers: {
  [Key in NodeNames_Logic]: LogicHandler<Key>;
} = {
  AndOr: NOT_IMPLEMENTED,
  AssignmentExpression: (await import("./node-assignment-expression")).handler,
  BinaryExpression: (await import("./node-binary-expression")).handler,
  BlockExpression: (await import("./node-block-expression")).handler,
  BuiltinFunctionExpression: (
    await import("./node-builtin-function-expression")
  ).handler,
  Cmp: NOT_IMPLEMENTED,
  ForExpression: NOT_IMPLEMENTED,
  ForInExpression: NOT_IMPLEMENTED,
  IfExpression: (await import("./node-if-expression")).handler,
  IncAssignment: NOT_IMPLEMENTED,
  IncAssignmentExpression: NOT_IMPLEMENTED,
  Keyword: NOT_IMPLEMENTED,
  LineComment: (await import("./node-line-comment")).handler,
  Not: NOT_IMPLEMENTED,
  Number: NOT_IMPLEMENTED,
  NumberExpression: (await import("./node-number-expression")).handler,
  ParenthesisExpression: (await import("./node-parenthesis-expression"))
    .handler,
  Percentage: (await import("./node-percentage")).handler,
  Plus: NOT_IMPLEMENTED,
  Program: (await import("./node-program")).handler,
  StateKeyword: NOT_IMPLEMENTED,
  StateVariable: (await import("./node-state-variable")).handler,
  StateVariableIndex: NOT_IMPLEMENTED,
  Ternary: (await import("./node-ternary")).handler,
  Times: NOT_IMPLEMENTED,
  UnaryExpression: (await import("./node-unary-expression")).handler,
  Unit: NOT_IMPLEMENTED,
  Variable: NOT_IMPLEMENTED,
  VariableExpression: (await import("./node-variable-expression")).handler,
  VariableIndex: NOT_IMPLEMENTED,
  WeightExpression: (await import("./node-weight-expression")).handler,
  Wildcard: NOT_IMPLEMENTED,
};

function handleLogic(node: SyntaxNode, tools: EvaluateTools): LogicResult {
  const handler: LogicHandler<NodeNames_Logic> | undefined = isLogicNodeName(
    node.name,
  )
    ? (handlers[node.name] as LogicHandler<NodeNames_Logic>)
    : undefined;
  if (!handler) {
    return tools.error(`No handler for node type: ${node.type}`, node);
  }
  return handler(node as TypedLogicNode<NodeNames_Logic>, tools);
}

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
export function run(
  logic: string,
  initialState: Readonly<IProgramState>,
  globalData: IScriptBindings,
  publicFunctions: IScriptFunctions,
  fnContext: IScriptFnContext,
): { result: LogicResult; finalState: IProgramState } {
  const state: IProgramState = { ...initialState };
  const updates: ILiftoscriptEvaluatorUpdate[] = [];
  // @TODO in original liftoscript, there seems to be multiple use cases for this -> either states by tag, or by exercise, or something else.... not sure how to hook this up, or how to test for it.
  const otherStates: Record<string | number, IProgramState> = {};
  // @TODO surely this is something which needs to be reset between blocks? Not sure at all why this is different that state if that's not the case
  const vars: IProgramState = {};

  const tools: EvaluateTools = {
    getText(node) {
      return (
        node === undefined ? undefined : logic.slice(node.from, node.to)
      ) as typeof node extends undefined ? undefined : string;
    },
    locate(node: SyntaxNode) {
      const linesLengths = logic.split("\n").map((l) => l.length + 1);
      let offset = 0;
      for (let i = 0; i < linesLengths.length; i++) {
        const lineLength = linesLengths[i];
        if (node.from > offset && node.from < offset + lineLength) {
          return [i + 1, node.from - offset];
        }
        offset += lineLength;
      }
      return [linesLengths.length, linesLengths[linesLengths.length - 1]];
    },
    error(message, node) {
      const [line, offset] = this.locate(node);
      throw new LiftoscriptSyntaxError(
        `${message} (${line}:${offset})`,
        line,
        offset,
        node.from,
        node.to,
      );
    },
    // @TODO should probably figure out when and where this will change
    mode: "update",
    recurse: (node) => handleLogic(node, tools),
    getState: (key, relatedNode, index) => {
      if (index === undefined) {
        if (key in state) {
          return state[key];
        }
        return tools.error(`There's no state variable '${key}'`, relatedNode);
      }

      if (index in otherStates && key in otherStates[key]) {
        return otherStates[index][key];
      }
      return tools.error(
        `There's no state variable '${key}' in the state dictionary at index '${index}'`,
        relatedNode,
      );
    },
    updateState: (key, value, relatedNode, index) => {
      if (index === undefined) {
        if (key in state) {
          state[key] = value;
        } else {
          return tools.error(`There's no state variable '${key}'`, relatedNode);
        }
      } else {
        if (index in otherStates && key in otherStates[key]) {
          if (key in otherStates[index]) {
            otherStates[index][key] = value;
          } else {
            return tools.error(
              `There's no state variable '${key}' in the state dictionary at index '${index}'`,
              relatedNode,
            );
          }
        } else {
          // Silently ignore update, as per the spec
        }
      }
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

  return {
    result: handleLogic(parser.parse(logic).topNode, tools),
    finalState: state,
  };
}
