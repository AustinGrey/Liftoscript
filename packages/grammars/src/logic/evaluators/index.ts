import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/parsers/guards.ts";
import type {
  IProgramState,
  IScriptBindings,
  LogicHandler,
  SourceTools,
} from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import { parser } from "@/parsers/logic.ts";
import { LiftoscriptSyntaxError } from "@/evaluators/logic-evaluator.ts";
import type {
  ILiftoscriptEvaluatorUpdate,
  LogicResult,
} from "@/logic/types.ts";

/**
 * Dictionary of evaluation methods for different logic nodes.
 */
const handlers: {
  [Key in NodeNames_Logic]: LogicHandler<Key>;
} = {
  AndOr: (n, t) => t.error("Not implemented", n),
  AssignmentExpression: (await import("./node-assignment-expression")).handler,
  BinaryExpression: (await import("./node-binary-expression")).handler,
  BlockExpression: (await import("./node-block-expression")).handler,
  BuiltinFunctionExpression: (n, t) => t.error("Not implemented", n),
  Cmp: (n, t) => t.error("Not implemented", n),
  ForExpression: (n, t) => t.error("Not implemented", n),
  ForInExpression: (n, t) => t.error("Not implemented", n),
  IfExpression: (await import("./node-if-expression")).handler,
  IncAssignment: (n, t) => t.error("Not implemented", n),
  IncAssignmentExpression: (n, t) => t.error("Not implemented", n),
  Keyword: (n, t) => t.error("Not implemented", n),
  LineComment: (await import("./node-line-comment")).handler,
  Not: (n, t) => t.error("Not implemented", n),
  Number: (n, t) => t.error("Not implemented", n),
  NumberExpression: (await import("./node-number-expression")).handler,
  ParenthesisExpression: (await import("./node-parenthesis-expression"))
    .handler,
  Percentage: (await import("./node-percentage")).handler,
  Plus: (n, t) => t.error("Not implemented", n),
  Program: (await import("./node-program")).handler,
  StateKeyword: (n, t) => t.error("Not implemented", n),
  StateVariable: (await import("./node-state-variable")).handler,
  StateVariableIndex: (n, t) => t.error("Not implemented", n),
  Ternary: (await import("./node-ternary")).handler,
  Times: (n, t) => t.error("Not implemented", n),
  UnaryExpression: (n, t) => t.error("Not implemented", n),
  Unit: (n, t) => t.error("Not implemented", n),
  Variable: (n, t) => t.error("Not implemented", n),
  VariableExpression: (await import("./node-variable-expression")).handler,
  VariableIndex: (n, t) => t.error("Not implemented", n),
  WeightExpression: (await import("./node-weight-expression")).handler,
  Wildcard: (n, t) => t.error("Not implemented", n),
};

function handleLogic(
  node: SyntaxNode,
  tools: SourceTools,
  initialState: Readonly<IProgramState>,
  globalData: IScriptBindings,
): LogicResult {
  const handler: LogicHandler<NodeNames_Logic> | undefined = isLogicNodeName(
    node.name,
  )
    ? (handlers[node.name] as LogicHandler<NodeNames_Logic>)
    : undefined;
  if (!handler) {
    return tools.error(`No handler for node type: ${node.type}`, node);
  }
  const state: IProgramState = { ...initialState };
  const updates: ILiftoscriptEvaluatorUpdate[] = [];
  return handler(node as TypedLogicNode<NodeNames_Logic>, {
    ...tools,
    recurse: (node) => handleLogic(node, tools, state, globalData),
    getState: (key, relatedNode) => {
      if (key in state) {
        return state[key];
      }
      return tools.error(`There's no state variable '${key}'`, relatedNode);
    },
    updateState: (key, value, relatedNode) => {
      if (key in state) {
        state[key] = value;
      } else {
        return tools.error(`There's no state variable '${key}'`, relatedNode);
      }
    },
    upsertState: (key, value) => {
      state[key] = value;
    },
    getGlobal: (key) => globalData[key],
    updateGlobal: (key, value) => {
      globalData[key] = value;
    },
    requestUpdate: (type, value) => {
      updates.push({
        type: type,
        value: value,
      });
    },
  });
}

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
export function run(
  logic: string,
  initialState: Readonly<IProgramState>,
  globalData: IScriptBindings,
): LogicResult {
  return handleLogic(
    parser.parse(logic).topNode,
    {
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
    },
    initialState,
    globalData,
  );
}
