import { isQuantity, type LogicResult, type Quantity } from "@/logic/types.ts";
import * as Weight from "@/models/weight.ts";
import {
  type IDynamicWeight,
  type IWeight,
  percentORM,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { is, isNumber } from "@/utils/types.ts";
import type {
  EvaluateTools,
  IScriptFnContext,
  IScriptFunctions,
  ISettings,
} from "@/logic/evaluators/types.ts";
import { Equipment_getUnitForExerciseType } from "@/models/equipment.ts";

export function Progress_createScriptFunctions(
  settings: ISettings,
): IScriptFunctions {
  function increment(vals: number, context: IScriptFnContext): number;
  function increment(vals: IWeight, context: IScriptFnContext): IWeight;
  function increment(
    vals: IDynamicWeight,
    context: IScriptFnContext,
  ): IDynamicWeight;
  function increment(vals: Quantity, context: IScriptFnContext): Quantity {
    if (isNumber(vals)) {
      const weight = Weight.build(vals, context.unit);
      return Weight.increment(weight, settings, context.exerciseType);
    } else if (is(TDynamicWeight, vals)) {
      return percentORM(vals.value + 1);
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
  function decrement(vals: Quantity, context: IScriptFnContext): Quantity {
    if (isNumber(vals)) {
      const weight = Weight.build(vals, context.unit);
      return Weight.decrement(weight, settings, context.exerciseType);
    } else if (is(TDynamicWeight, vals)) {
      return percentORM(vals.value - 1);
    } else {
      return Weight.decrement(vals, settings, context.exerciseType);
    }
  }

  const fns: IScriptFunctions = {
    roundWeight: (num, context) => {
      if (!is(TWeight, num)) {
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
      if (!is(TWeight, num)) {
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
      if (!is(TWeight, weight)) {
        weight = Weight.build(weight, settings.units);
      }
      return Weight.getTrainingMax(weight, reps || 0, settings);
    },
    calculate1RM: (weight, reps, context) => {
      if (!is(TWeight, weight)) {
        weight = Weight.build(weight, settings.units);
      }
      return Weight.getOneRepMax(weight, reps);
    },
    rpeMultiplier: (repsRaw, rpeRawOrContext, context) => {
      const reps = is(TWeight, repsRaw)
        ? repsRaw.value
        : isNumber(repsRaw)
          ? repsRaw
          : 1;
      const rpe =
        isNumber(rpeRawOrContext) && context != null
          ? is(TWeight, rpeRawOrContext)
            ? rpeRawOrContext.value
            : isNumber(rpeRawOrContext)
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
      const args = [...fnArgs.flat()] as Quantity[];
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
      weight: Quantity,
      timer: number,
      rpe: number,
      logRpe: number,
      context: IScriptFnContext,
      t: EvaluateTools,
    ): number {
      for (let i = 0; i < t.getGlobal("numberOfSets"); i++) {
        if (i >= from - 1 && i < to) {
          const weightValue = Weight.convertToWeight(
            t.getGlobal("rm1"),
            weight,
            context.unit,
          );
          t.updateGlobal("minReps", (x) =>
            x.toSpliced(i, 1, reps !== minReps ? minReps : undefined),
          );
          t.updateGlobal("reps", (x) => x.toSpliced(i, 1, reps));
          t.updateGlobal("originalWeights", (x) =>
            x.toSpliced(i, 1, weightValue),
          );
          t.updateGlobal("weights", (x) =>
            x.toSpliced(
              i,
              1,
              Weight.round(
                weightValue,
                settings,
                context.unit,
                context.exerciseType,
              ),
            ),
          );
          t.updateGlobal("RPE", (x) =>
            x.toSpliced(i, 1, rpe !== 0 ? rpe : undefined),
          );
          t.updateGlobal("amraps", (x) =>
            x.toSpliced(i, 1, isAmrap !== 0 ? 1 : 0),
          );
          t.updateGlobal("logrpes", (x) =>
            x.toSpliced(i, 1, logRpe !== 0 ? 1 : 0),
          );
          t.updateGlobal("timers", (x) =>
            x.toSpliced(i, 1, timer !== 0 ? timer : undefined),
          );
        }
      }
      return to - from;
    },
  };
  return fns;
}

function floor(num: number): number;
function floor(num: IWeight): IWeight;
function floor(num: Exclude<LogicResult, number | IWeight>): number;
function floor(num: LogicResult): number | IWeight {
  return isNumber(num)
    ? Math.floor(num)
    : is(TWeight, num)
      ? Weight.build(Math.floor(num.value), num.unit)
      : 0;
}

function ceil(num: number): number;
function ceil(num: IWeight): IWeight;
function ceil(num: Exclude<LogicResult, number | IWeight>): number;
function ceil(num: LogicResult): number | IWeight {
  return isNumber(num)
    ? Math.ceil(num)
    : is(TWeight, num)
      ? Weight.build(Math.ceil(num.value), num.unit)
      : 0;
}

function round(num: number): number;
function round(num: IWeight): IWeight;
function round(num: Exclude<LogicResult, number | IWeight>): number;
function round(num: LogicResult): number | IWeight {
  return isNumber(num)
    ? Math.round(num)
    : is(TWeight, num)
      ? Weight.build(Math.round(num.value), num.unit)
      : 0;
}

function sum(...args: LogicResult[]): Quantity {
  const flat = [...flattenScriptArgs(args)];
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<Quantity>(
    (acc, a) => Weight.op(undefined, acc, a, (x, y) => x + y),
    0,
  );
}

function min(...args: LogicResult[]): Quantity {
  const flat = [...flattenScriptArgs(args)];
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<Quantity>(
    (acc, a) => (Weight.lt(a, acc) ? a : acc),
    flat[0],
  );
}

function max(...args: LogicResult[]): Quantity {
  const flat = [...flattenScriptArgs(args)];
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<Quantity>(
    (acc, a) => (Weight.lt(acc, a) ? a : acc),
    flat[0],
  );
}

function zeroOrGte(a: IWeight[] | number[], b: IWeight[] | number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (
      aVal != null &&
      bVal != null &&
      !Weight.eq(aVal, 0) &&
      Weight.lt(aVal, bVal)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Flattens the list of args and filters out non Quantity values
 * @param args The list of arbitrary args to filter/flatten
 */
function* flattenScriptArgs(args: LogicResult[]): Generator<Quantity> {
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        if (isQuantity(item)) {
          yield item;
        }
      }
    } else if (isQuantity(arg)) {
      yield arg;
    }
  }
}