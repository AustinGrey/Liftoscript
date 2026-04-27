import {
  isLogicNodeName,
  type NodeNames_Logic,
  type TypedLogicNode,
} from "@/parsers/guards.ts";
import type {
  EvaluateTools,
  IProgramState,
  IScriptBindings,
  IScriptFnContext,
  IScriptFunctions,
  LogicHandler,
} from "@/logic/evaluators/types.ts";
import type { SyntaxNode } from "@lezer/common";
import { parser } from "@/parsers/logic.ts";
import { LiftoscriptSyntaxError } from "@/evaluators/logic-evaluator.ts";
import type {
  ILiftoscriptEvaluatorUpdate,
  LogicResult,
} from "@/logic/types.ts";
import type { IDynamicWeight, IWeight } from "@/models/weight.ts";
import * as Weight from "@/models/weight.ts";

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
  UnaryExpression: (await import("./node-unary-expression")).handler,
  Unit: (n, t) => t.error("Not implemented", n),
  Variable: (n, t) => t.error("Not implemented", n),
  VariableExpression: (await import("./node-variable-expression")).handler,
  VariableIndex: (n, t) => t.error("Not implemented", n),
  WeightExpression: (await import("./node-weight-expression")).handler,
  Wildcard: (n, t) => t.error("Not implemented", n),
};

function handleLogic(
  node: SyntaxNode,
  tools: EvaluateTools,
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
    recurse: (node) => handleLogic(node, tools, state, globalData),
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
  };

  return {
    result: handleLogic(
      parser.parse(logic).topNode,
      tools,
      initialState,
      globalData,
    ),
    finalState: state,
  };
}

export function Progress_createScriptFunctions(
  settings: ISettings,
): IScriptFunctions {
  function increment(vals: number, context: IScriptFnContext): number;
  function increment(vals: IWeight, context: IScriptFnContext): IWeight;
  function increment(
    vals: IDynamicWeight,
    context: IScriptFnContext,
  ): IDynamicWeight;
  function increment(
    vals: IWeight | IDynamicWeight | number,
    context: IScriptFnContext,
  ): IWeight | IDynamicWeight | number {
    if (typeof vals === "number") {
      const weight = Weight.build(vals, context.unit);
      return Weight.increment(weight, settings, context.exerciseType);
    } else if (Weight.isPct(vals)) {
      return Weight.buildPct(vals.value + 1);
    } else {
      return Weight.increment(vals, settings, context.exerciseType);
    }
  }

  function decrement(vals: number, context: IScriptFnContext): number;
  function decrement(vals: IWeight, context: IScriptFnContext): IWeight;
  function decrement(
    vals: IDynamicWeight,
    context: IScriptFnContext,
  ): IDynamicWeight;
  function decrement(
    vals: IWeight | IDynamicWeight | number,
    context: IScriptFnContext,
  ): IWeight | IDynamicWeight | number {
    if (typeof vals === "number") {
      const weight = Weight.build(vals, context.unit);
      return Weight.decrement(weight, settings, context.exerciseType);
    } else if (Weight.isPct(vals)) {
      return Weight.buildPct(vals.value - 1);
    } else {
      return Weight.decrement(vals, settings, context.exerciseType);
    }
  }

  const fns: IScriptFunctions = {
    roundWeight: (num, context) => {
      if (!Weight.is(num)) {
        num = Weight.build(num, settings.units);
      }
      const unit = Equipment_getUnitForExerciseType(
        settings,
        context?.exerciseType,
      );
      return Weight.round(
        num,
        settings,
        unit ?? settings.units,
        context?.exerciseType,
      );
    },
    roundConvertWeight: (num, context) => {
      if (!Weight.is(num)) {
        num = Weight.build(num, settings.units);
      }
      const unit = Equipment_getUnitForExerciseType(
        settings,
        context?.exerciseType,
      );
      return Weight.roundConvertTo(
        num,
        settings,
        unit ?? settings.units,
        context?.exerciseType,
      );
    },
    calculateTrainingMax: (weight, reps, context) => {
      if (!Weight.is(weight)) {
        weight = Weight.build(weight, settings.units);
      }
      return Weight.getTrainingMax(weight, reps || 0, settings);
    },
    calculate1RM: (weight, reps, context) => {
      if (!Weight_is(weight)) {
        weight = Weight_build(weight, settings.units);
      }
      return Weight.getOneRepMax(weight, reps);
    },
    rpeMultiplier: (repsRaw, rpeRawOrContext, context) => {
      const reps = Weight.is(repsRaw)
        ? repsRaw.value
        : typeof repsRaw === "number"
          ? repsRaw
          : 1;
      const rpe =
        typeof rpeRawOrContext === "number" && context != null
          ? Weight.is(rpeRawOrContext)
            ? rpeRawOrContext.value
            : typeof rpeRawOrContext === "number"
              ? rpeRawOrContext
              : 10
          : 10;
      return Weight.rpeMultiplier(reps, rpe);
    },
    floor,
    ceil,
    round,
    sum,
    min,
    max,
    increment,
    decrement,
    zeroOrGte,
    print: (...fnArgs) => {
      fnArgs.pop();
      const context = fnArgs.pop() as IScriptFnContext;
      const args = [...fnArgs.flat()] as (number | IWeight | IDynamicWeight)[];
      context.prints = context.prints || [];
      context.prints.push(args);
      return args[0];
    },
    sets(
      from: number,
      to: number,
      minReps: number,
      reps: number,
      isAmrap: number,
      weight: IWeight | IDynamicWeight | number,
      timer: number,
      rpe: number,
      logRpe: number,
      context: IScriptFnContext,
      bindings: IScriptBindings,
    ): number {
      for (let i = 0; i < bindings.numberOfSets; i++) {
        if (i >= from - 1 && i < to) {
          const weightValue = Weight.convertToWeight(
            bindings.rm1,
            weight,
            context.unit,
          );
          bindings.minReps[i] = reps !== minReps ? minReps : undefined;
          bindings.reps[i] = reps;
          bindings.originalWeights[i] = weightValue;
          bindings.weights[i] = Weight.round(
            weightValue,
            settings,
            context.unit,
            context.exerciseType,
          );
          bindings.RPE[i] = rpe !== 0 ? rpe : undefined;
          bindings.amraps[i] = isAmrap !== 0 ? 1 : 0;
          bindings.logrpes[i] = logRpe !== 0 ? 1 : 0;
          bindings.timers[i] = timer !== 0 ? timer : undefined;
        }
      }
      return to - from;
    },
  };
  return fns;
}
