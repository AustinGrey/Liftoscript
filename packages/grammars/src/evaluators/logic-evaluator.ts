import { type SyntaxNode } from "@lezer/common";
import {
  CollectionUtils_compact,
  CollectionUtils_sort,
  CollectionUtils_compressArray,
  CollectionUtils_concatBy,
  CollectionUtils_flat,
} from "@/utils/collection";
import {
  MathUtils_applyOp,
  MathUtils_round,
  MathUtils_clamp,
  MathUtils_roundFloat,
  n,
  MathUtils_roundTo005,
  MathUtils_roundTo000005,
} from "@/utils/math";
import { parser as LiftoscriptParser } from "@/parsers/logic";
import { z as t } from "zod";
import {
  ObjectUtils_keys,
  ObjectUtils_values,
  ObjectUtils_filter,
} from "@/utils/object";
import {
  Muscle_getScreenMusclesFromMuscle,
  Muscle_getMusclesFromScreenMuscle,
  Muscle_getAvailableMuscleGroups,
  Muscle_getMuscleGroupName,
} from "./muscle";
import {
  StringUtils_fuzzySearch,
  StringUtils_dashcase,
  StringUtils_uncamelCase,
  StringUtils_camelCase,
  StringUtils_undashcase,
  StringUtils_capitalize,
} from "@/utils/string";
import { UidFactory_generateUid } from "@/utils/generator";
import { ExerciseImageUtils_exists } from "./exerciseImage";
import { IDispatch } from "../ducks/types";
import { Program_changeExerciseName } from "./program";
import { EditProgram_updateProgram } from "./editProgram";
import { lb } from "lens-shmens";
import { updateSettings } from "./state";

export const TEquipment = t.string();
export type IEquipment = t.infer<typeof TEquipment>;

export const TExerciseId = t.string();
export type IExerciseId = t.infer<typeof TExerciseId>;

export const TExerciseType = t
  .object({
    id: TExerciseId,
    equipment: TEquipment.optional(),
  })
  .strict();

export type IExerciseType = t.infer<typeof TExerciseType>;

export const units = ["kg", "lb"] as const;

export const TUnit = t.enum(units);
export type IUnit = t.infer<typeof TUnit>;

export const percentageUnits = ["%"] as const;

export const TPercentageUnit = t.enum(percentageUnits);
export type IPercentageUnit = t.infer<typeof TPercentageUnit>;

export const TPercentage = t.object({
  value: t.number(),
  unit: TPercentageUnit,
});
export type IPercentage = t.infer<typeof TPercentage>;
export const TWeight = t.object({
  value: t.number(),
  unit: TUnit,
});
export type IWeight = t.infer<typeof TWeight>;

export const TSettingsTimers = t
  .object({
    warmup: t.union([t.number(), t.undefined(), t.null()]),
    workout: t.union([t.number(), t.undefined(), t.null()]),
    reminder: t.number().optional(),
    superset: t.number().optional(),
  })
  .strict();

export type ISettingsTimers = t.infer<typeof TSettingsTimers>;

export const TEquipmentData = t
  .object({
    vtype: t.literal("equipment_data"),
    bar: t
      .object({
        lb: TWeight,
        kg: TWeight,
      })
      .strict(),
    multiplier: t.number(),
    plates: t.array(
      t
        .object({
          weight: TWeight,
          num: t.number(),
        })
        .strict(),
    ),
    fixed: t.array(TWeight),
    isFixed: t.boolean(),

    unit: TUnit.optional(),
    name: t.string().optional(),
    similarTo: t.string().optional(),
    isDeleted: t.boolean().optional(),
    useBodyweightForBar: t.boolean().optional(),
    isAssisting: t.boolean().optional(),
    notes: t.string().optional(),
  })
  .strict();

export type IEquipmentData = t.infer<typeof TEquipmentData>;
export type IAllEquipment = Partial<Record<string, IEquipmentData>>;

export const TGym = t
  .object({
    vtype: t.literal("gym"),
    id: t.string(),
    name: t.string(),
    equipment: t.record(TEquipment, TEquipmentData),
  })
  .strict();

export type IGym = t.infer<typeof TGym>;

export const lengthUnits = ["in", "cm"] as const;

export const TLengthUnit = t.enum(lengthUnits);
export type ILengthUnit = t.infer<typeof TLengthUnit>;

export const TLength = t.object({
  value: t.number(),
  unit: TLengthUnit,
});
export type ILength = t.infer<typeof TLength>;

export const TStatsWeightValue = t
  .object({
    vtype: t.literal("stat"),
    value: TWeight,
    timestamp: t.number(),
    updatedAt: t.number().optional(),
    appleUuid: t.string().optional(),
  })
  .strict();
export type IStatsWeightValue = t.infer<typeof TStatsWeightValue>;

export const statsWeightDef = {
  weight: t.array(TStatsWeightValue),
};
export const TStatsWeight = t.object(statsWeightDef).partial().strict();
export type IStatsWeight = t.infer<typeof TStatsWeight>;

export const TStatsLengthValue = t
  .object({
    vtype: t.literal("stat"),
    value: TLength,
    timestamp: t.number(),
    updatedAt: t.number().optional(),
    appleUuid: t.string().optional(),
  })
  .strict();
export type IStatsLengthValue = t.infer<typeof TStatsLengthValue>;

export const statsLengthDef = {
  neck: t.array(TStatsLengthValue),
  shoulders: t.array(TStatsLengthValue),
  bicepLeft: t.array(TStatsLengthValue),
  bicepRight: t.array(TStatsLengthValue),
  forearmLeft: t.array(TStatsLengthValue),
  forearmRight: t.array(TStatsLengthValue),
  chest: t.array(TStatsLengthValue),
  waist: t.array(TStatsLengthValue),
  hips: t.array(TStatsLengthValue),
  thighLeft: t.array(TStatsLengthValue),
  thighRight: t.array(TStatsLengthValue),
  calfLeft: t.array(TStatsLengthValue),
  calfRight: t.array(TStatsLengthValue),
};
export const TStatsLength = t.object(statsLengthDef).partial().strict();
export type IStatsLength = t.infer<typeof TStatsLength>;

export const TStatsPercentageValue = t
  .object({
    vtype: t.literal("stat"),
    value: TPercentage,
    timestamp: t.number(),
    updatedAt: t.number().optional(),
    appleUuid: t.string().optional(),
  })
  .strict();
export type IStatsPercentageValue = t.infer<typeof TStatsPercentageValue>;

export const statsPercentageDef = {
  bodyfat: t.array(TStatsPercentageValue),
};
export const TStatsPercentage = t.object(statsPercentageDef).partial().strict();
export type IStatsPercentage = t.infer<typeof TStatsPercentage>;

export const TGraph = t.discriminatedUnion("type", [
  t
    .object({
      vtype: t.literal("graph"),
      type: t.literal("exercise"),
      id: TExerciseId,
    })
    .strict(),
  t
    .object({
      vtype: t.literal("graph"),
      type: t.literal("statsWeight"),
      id: t.enum(
        Object.keys(statsWeightDef) as [
          keyof typeof statsWeightDef & string,
          ...(keyof typeof statsWeightDef & string)[],
        ],
      ),
    })
    .strict(),
  t
    .object({
      vtype: t.literal("graph"),
      type: t.literal("statsLength"),
      id: t.enum(
        Object.keys(statsLengthDef) as [
          keyof typeof statsLengthDef & string,
          ...(keyof typeof statsLengthDef & string)[],
        ],
      ),
    })
    .strict(),
  t
    .object({
      vtype: t.literal("graph"),
      type: t.literal("statsPercentage"),
      id: t.enum(
        Object.keys(statsPercentageDef) as [
          keyof typeof statsPercentageDef & string,
          ...(keyof typeof statsPercentageDef & string)[],
        ],
      ),
    })
    .strict(),
  t
    .object({
      vtype: t.literal("graph"),
      type: t.literal("muscleGroup"),
      id: t.string(),
    })
    .strict(),
]);

export type IGraph = t.infer<typeof TGraph>;

export const TGraphs = t.object({
  vtype: t.literal("graphs"),
  graphs: t.array(TGraph),
});

export const TStatsWeightEnabled = t
  .object({
    weight: t.boolean(),
  })
  .partial()
  .strict();

export type IStatsWeightEnabled = t.infer<typeof TStatsWeightEnabled>;
export const TStatsLengthEnabled = t
  .object({
    neck: t.boolean(),
    shoulders: t.boolean(),
    bicepLeft: t.boolean(),
    bicepRight: t.boolean(),
    forearmLeft: t.boolean(),
    forearmRight: t.boolean(),
    chest: t.boolean(),
    waist: t.boolean(),
    hips: t.boolean(),
    thighLeft: t.boolean(),
    thighRight: t.boolean(),
    calfLeft: t.boolean(),
    calfRight: t.boolean(),
  })
  .partial()
  .strict();
export type IStatsLengthEnabled = t.infer<typeof TStatsLengthEnabled>;

export const TStatsPercentageEnabled = t
  .object({
    bodyfat: t.boolean(),
  })
  .partial()
  .strict();

export const TStatsEnabled = t
  .object({
    weight: TStatsWeightEnabled,
    length: TStatsLengthEnabled,
    percentage: TStatsPercentageEnabled,
  })
  .strict();

export type IStatsEnabled = Readonly<t.infer<typeof TStatsEnabled>>;

export const TSettings = t
  .object({
    timers: TSettingsTimers,
    gyms: t.array(TGym),
    deletedGyms: t.array(t.string()),
    graphs: TGraphs,
    graphOptions: t.record(t.string(), TGraphOptions),
    graphsSettings: t
      .object({
        isSameXAxis: t.boolean().optional(),
        isWithBodyweight: t.boolean().optional(),
        isWithOneRm: t.boolean().optional(),
        isWithProgramLines: t.boolean().optional(),
        defaultType: TGraphExerciseSelectedType.optional(),
        defaultMuscleGroupType: TGraphMuscleGroupSelectedType.optional(),
      })
      .optional(),
    exerciseStatsSettings: t
      .object({
        ascendingSort: t.boolean().optional(),
        hideWithoutWorkoutNotes: t.boolean().optional(),
        hideWithoutExerciseNotes: t.boolean().optional(),
      })
      .optional(),
    exercises: t.record(t.string(), TCustomExercise),
    statsEnabled: TStatsEnabled,
    units: TUnit,
    lengthUnits: TLengthUnit,
    volume: t.number(),
    exerciseData: t.record(t.string(), TExerciseDataValue),
    planner: TPlannerSettings,
    workoutSettings: TWorkoutSettings,
    muscleGroups: TMuscleGroupsSettings,

    appleHealthSyncWorkout: t.boolean().optional(),
    appleHealthSyncMeasurements: t.boolean().optional(),
    appleHealthAnchor: t.string().optional(),
    googleHealthSyncWorkout: t.boolean().optional(),
    googleHealthSyncMeasurements: t.boolean().optional(),
    googleHealthAnchor: t.string().optional(),
    healthConfirmation: t.boolean().optional(),
    ignoreDoNotDisturb: t.boolean().optional(),
    currentGymId: t.string().optional(),
    isPublicProfile: t.boolean().optional(),
    nickname: t.string().optional(),
    alwaysOnDisplay: t.boolean().optional(),
    vibration: t.boolean().optional(),
    startWeekFromMonday: t.boolean().optional(),
    textSize: t.number().optional(),
    starredExercises: t.record(TExerciseId, t.boolean()).optional(),
    theme: t.enum(["dark", "light"]).optional(),
    currentBodyweight: TWeight.optional(),
    affiliateEnabled: t.boolean().optional(),
  })
  .strict();

export type ISettings = t.infer<typeof TSettings>;

export const TPlate = t.object({
  weight: TWeight,
  num: t.number(),
});
export type IPlate = t.infer<typeof TPlate>;

export const TProgramState = t.record(
  t.string(),
  t.union([t.number(), TWeight, TPercentage]),
);
export type IProgramState = t.infer<typeof TProgramState>;
export type IProgramMode = "planner" | "update";

export interface IScriptBindings {
  day: number;
  week: number;
  dayInWeek: number;
  originalWeights: (IWeight | IPercentage)[];
  weights: (IWeight | undefined)[];
  completedWeights: (IWeight | undefined)[];
  rm1: IWeight;
  reps: (number | undefined)[];
  minReps: (number | undefined)[];
  amraps: (number | undefined)[];
  askweights: (number | undefined)[];
  logrpes: (number | undefined)[];
  timers: (number | undefined)[];
  RPE: (number | undefined)[];
  completedRPE: (number | undefined)[];
  completedReps: (number | undefined)[];
  completedRepsLeft: (number | undefined)[];
  isCompleted: (0 | 1)[];
  w: (IWeight | undefined)[];
  r: (number | undefined)[];
  mr: (number | undefined)[];
  cr: (number | undefined)[];
  cw: (IWeight | undefined)[];
  ns: number;
  programNumberOfSets: number;
  numberOfSets: number;
  completedNumberOfSets: number;
  setVariationIndex: number;
  bodyweight: IWeight;
  descriptionIndex: number;
  setIndex: number;
}

export interface IScriptFnContext {
  prints: (number | IWeight | IPercentage)[][];
  unit: IUnit;
  exerciseType?: IExerciseType;
}

export interface IScriptFunctions {
  roundWeight: (num: IWeight, context: IScriptFnContext) => IWeight;
  roundConvertWeight: (num: IWeight, context: IScriptFnContext) => IWeight;
  calculateTrainingMax: (
    weight: IWeight,
    reps: number,
    context: IScriptFnContext,
  ) => IWeight;
  calculate1RM: (
    weight: IWeight,
    reps: number,
    context: IScriptFnContext,
  ) => IWeight;
  rpeMultiplier: (
    reps: number,
    rpe: number,
    context: IScriptFnContext,
  ) => number;
  floor(num: number): number;
  floor(num: IWeight): IWeight;
  ceil(num: number): number;
  ceil(num: IWeight): IWeight;
  round(num: number): number;
  round(num: IWeight): IWeight;
  sum(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IPercentage
      | IPercentage[]
    )[]
  ): number | IWeight | IPercentage;
  min(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IPercentage
      | IPercentage[]
    )[]
  ): number | IWeight | IPercentage;
  max(
    ...vals: (
      | number
      | number[]
      | IWeight
      | IWeight[]
      | IPercentage
      | IPercentage[]
    )[]
  ): number | IWeight | IPercentage;
  zeroOrGte(a: number[] | IWeight[], b: number[] | IWeight[]): boolean;
  print(...args: unknown[]): (typeof args)[0];
  increment(val: IWeight, context: IScriptFnContext): IWeight;
  increment(val: IPercentage, context: IScriptFnContext): IPercentage;
  increment(val: number, context: IScriptFnContext): number;
  decrement(val: IWeight, context: IScriptFnContext): IWeight;
  decrement(val: IPercentage, context: IScriptFnContext): IPercentage;
  decrement(val: number, context: IScriptFnContext): number;
  sets(
    from: number,
    to: number,
    minReps: number,
    reps: number,
    isAmrap: number,
    weight: IWeight | IPercentage | number,
    timer: number,
    rpe: number,
    logRpe: number,
    context: IScriptFnContext,
    bindings: IScriptBindings,
  ): number;
}

export enum NodeName {
  LineComment = "LineComment",
  Program = "Program",
  BinaryExpression = "BinaryExpression",
  Plus = "Plus",
  Times = "Times",
  Cmp = "Cmp",
  AndOr = "AndOr",
  NumberExpression = "NumberExpression",
  Number = "Number",
  Percentage = "Percentage",
  WeightExpression = "WeightExpression",
  ParenthesisExpression = "ParenthesisExpression",
  BlockExpression = "BlockExpression",
  Ternary = "Ternary",
  IfExpression = "IfExpression",
  ForExpression = "ForExpression",
  ForInExpression = "ForInExpression",
  If = "If",
  Else = "Else",
  AssignmentExpression = "AssignmentExpression",
  IncAssignmentExpression = "IncAssignmentExpression",
  StateVariable = "StateVariable",
  StateVariableIndex = "StateVariableIndex",
  Variable = "Variable",
  BuiltinFunctionExpression = "BuiltinFunctionExpression",
  Keyword = "Keyword",
  VariableExpression = "VariableExpression",
  VariableIndex = "VariableIndex",
  Current = "Current",
  Wildcard = "Wildcard",
  UnaryExpression = "UnaryExpression",
  Not = "Not",
  Unit = "Unit",
}

export type IAssignmentOp = "+=" | "-=" | "*=" | "/=" | "=";

export class LiftoscriptSyntaxError extends SyntaxError {
  public readonly line: number;
  public readonly offset: number;
  public readonly from: number;
  public readonly to: number;

  constructor(
    message: string,
    line: number,
    offset: number,
    from: number,
    to: number,
  ) {
    super(message);
    this.line = line;
    this.offset = offset;
    this.from = from;
    this.to = to;
  }
}

function getChildren(node: SyntaxNode): SyntaxNode[] {
  const cur = node.cursor();
  const result: SyntaxNode[] = [];
  if (!cur.firstChild()) {
    return result;
  }
  do {
    result.push(cur.node);
  } while (cur.nextSibling());
  return result;
}

function comparing(
  left:
    | number
    | IWeight
    | IPercentage
    | (number | IWeight | IPercentage | undefined)[],
  right:
    | number
    | IWeight
    | IPercentage
    | (number | IWeight | IPercentage | undefined)[],
  operator: ">" | "<" | ">=" | "<=" | "==" | "!=",
): boolean {
  function comparator(
    l: number | IWeight | IPercentage,
    r: number | IWeight | IPercentage,
  ): boolean {
    switch (operator) {
      case ">":
        return Weight_gt(l, r);
      case "<":
        return Weight_lt(l, r);
      case ">=":
        return Weight_gte(l, r);
      case "<=":
        return Weight_lte(l, r);
      case "==":
        return Weight_eq(l, r);
      case "!=":
        return !Weight_eq(l, r);
    }
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.every((l, i) => comparator(l ?? 0, right[i] ?? 0));
  } else if (Array.isArray(left) && !Array.isArray(right)) {
    return left.every((l, i) => comparator(l ?? 0, right ?? 0));
  } else if (!Array.isArray(left) && Array.isArray(right)) {
    return right.every((r, i) => comparator(left ?? 0, r ?? 0));
  } else if (!Array.isArray(left) && !Array.isArray(right)) {
    return comparator(left ?? 0, right ?? 0);
  } else {
    throw new Error("Impossible case");
  }
}

function assert(name: string): never {
  throw new SyntaxError(
    `Missing required nodes for ${name}, this should never happen`,
  );
}

export interface ILiftoscriptVariableValue<T> {
  value: T;
  op: IAssignmentOp;
  target: ("*" | "_" | number)[];
}

export type ILiftoscriptEvaluatorUpdate =
  | { type: "setVariationIndex"; value: ILiftoscriptVariableValue<number> }
  | { type: "descriptionIndex"; value: ILiftoscriptVariableValue<number> }
  | { type: "reps"; value: ILiftoscriptVariableValue<number> }
  | { type: "minReps"; value: ILiftoscriptVariableValue<number> }
  | {
      type: "weights";
      value: ILiftoscriptVariableValue<number | IPercentage | IWeight>;
    }
  | { type: "timers"; value: ILiftoscriptVariableValue<number> }
  | { type: "RPE"; value: ILiftoscriptVariableValue<number> }
  | { type: "logrpes"; value: ILiftoscriptVariableValue<number> }
  | { type: "amraps"; value: ILiftoscriptVariableValue<number> }
  | { type: "askweights"; value: ILiftoscriptVariableValue<number> }
  | { type: "numberOfSets"; value: ILiftoscriptVariableValue<number> };

export class LiftoscriptEvaluator {
  private readonly script: string;
  private readonly state: IProgramState;
  private readonly otherStates: Record<number, IProgramState>;
  private readonly bindings: IScriptBindings;
  private readonly fns: IScriptFunctions;
  private readonly fnContext: IScriptFnContext;
  private readonly unit: IUnit;
  private readonly mode: IProgramMode;
  private readonly vars: IProgramState = {};
  public readonly updates: ILiftoscriptEvaluatorUpdate[] = [];

  constructor(
    script: string,
    state: IProgramState,
    otherStates: Record<number, IProgramState>,
    bindings: IScriptBindings,
    fns: IScriptFunctions,
    fnContext: IScriptFnContext,
    unit: IUnit,
    mode: IProgramMode,
  ) {
    this.script = script;
    this.state = state;
    this.otherStates = otherStates;
    this.bindings = bindings;
    this.fns = fns;
    this.fnContext = fnContext;
    this.unit = unit;
    this.mode = mode;
  }

  public static getValueRaw(script: string, node: SyntaxNode): string {
    return script.slice(node.from, node.to);
  }

  public static getValue(script: string, node: SyntaxNode): string {
    return this.getValueRaw(script, node)
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  private getValue(node: SyntaxNode): string {
    return LiftoscriptEvaluator.getValue(this.script, node);
  }

  private error(message: string, node: SyntaxNode): never {
    const [line, offset] = this.getLineAndOffset(node);
    throw new LiftoscriptSyntaxError(
      `${message} (${line}:${offset})`,
      line,
      offset,
      node.from,
      node.to,
    );
  }

  private getLineAndOffset(node: SyntaxNode): [number, number] {
    const linesLengths = this.script.split("\n").map((l) => l.length + 1);
    let offset = 0;
    for (let i = 0; i < linesLengths.length; i++) {
      const lineLength = linesLengths[i];
      if (node.from > offset && node.from < offset + lineLength) {
        return [i + 1, node.from - offset];
      }
      offset += lineLength;
    }
    return [linesLengths.length, linesLengths[linesLengths.length - 1]];
  }

  public hasKeyword(expr: SyntaxNode, name: string): boolean {
    const cursor = expr.cursor();
    do {
      if (cursor.node.type.name === NodeName.Keyword) {
        if (this.getValue(cursor.node) === name) {
          return true;
        }
      }
    } while (cursor.next());
    return false;
  }

  private getWeight(expr?: SyntaxNode | null): IWeight | undefined {
    if (expr?.type.name === NodeName.WeightExpression) {
      const numberNode = expr.getChild(NodeName.NumberExpression);
      const unitNode = expr.getChild(NodeName.Unit);
      if (numberNode == null || unitNode == null) {
        assert(NodeName.WeightExpression);
      }
      const num = this.evaluate(numberNode);
      if (typeof num !== "number") {
        this.error("WeightExpression must contain a number", numberNode);
      }
      return Weight_build(num, this.getValue(unitNode) as IUnit);
    } else {
      return undefined;
    }
  }

  public switchWeightsToUnit(programNode: SyntaxNode, toUnit: IUnit): string {
    const cursor = programNode.cursor();
    let script = this.script;
    let shift = 0;
    do {
      if (cursor.node.type.name === NodeName.WeightExpression) {
        const weight = this.getWeight(cursor.node);
        if (weight != null) {
          if (weight.unit !== toUnit) {
            const from = cursor.node.from;
            const to = cursor.node.to;
            const oldWeightStr = Weight_print(weight);
            const newWeightStr = Weight_print(
              Weight_smartConvert(weight, toUnit),
            );
            script =
              script.substring(0, from + shift) +
              newWeightStr +
              script.substring(to + shift);
            shift = shift + newWeightStr.length - oldWeightStr.length;
          }
        }
      }
    } while (cursor.next());
    return script;
  }

  public getStateVariableKeys(expr: SyntaxNode): Set<string> {
    const cursor = expr.cursor();
    const stateKeys: Set<string> = new Set();
    do {
      if (cursor.node.type.name === NodeName.StateVariable) {
        const stateKey = this.getStateKey(cursor.node);
        if (stateKey != null) {
          stateKeys.add(stateKey);
        }
      }
    } while (cursor.next());
    return stateKeys;
  }

  private getStateKey(expr: SyntaxNode): string | undefined {
    const index = expr.getChild(NodeName.StateVariableIndex);
    if (index == null) {
      const stateKeyNode = expr.getChild(NodeName.Keyword);
      if (stateKeyNode != null) {
        const stateKey = this.getValue(stateKeyNode);
        return stateKey;
      }
    }
    return undefined;
  }

  public parse(expr: SyntaxNode): void {
    const cursor = expr.cursor();
    const vars: IProgramState = {};
    do {
      if (cursor.node.type.isError) {
        this.error("Syntax error", cursor.node);
      } else if (cursor.node.type.name === NodeName.BuiltinFunctionExpression) {
        const [keyword, ...fnArgs] = getChildren(cursor.node);
        if (keyword == null || keyword.type.name !== NodeName.Keyword) {
          assert(NodeName.BuiltinFunctionExpression);
        }
        const name = this.getValue(keyword);
        if (!(name in this.fns)) {
          this.error(`Unknown function '${name}'`, keyword);
        }
        if (name === "sets" && fnArgs.length !== 9) {
          this.error(`'sets' function should have 9 arguments`, keyword);
        }
      } else if (cursor.node.type.name === NodeName.ForExpression) {
        const variableNode = cursor.node.getChild(NodeName.Variable);
        if (variableNode != null) {
          vars[this.getValue(variableNode)] = 1;
        }
      } else if (cursor.node.type.name === NodeName.AssignmentExpression) {
        const [variableNode] = getChildren(cursor.node);
        if (variableNode.type.name === NodeName.Variable) {
          vars[this.getValue(variableNode)] = 1;
        } else if (variableNode.type.name === NodeName.VariableExpression) {
          const nameNode = variableNode.getChild(NodeName.Keyword);
          if (nameNode != null) {
            const name = this.getValue(nameNode);
            if (this.mode === "update") {
              if (
                [
                  "reps",
                  "weights",
                  "RPE",
                  "minReps",
                  "numberOfSets",
                  "timers",
                  "askweights",
                  "amraps",
                  "logrpes",
                ].indexOf(name) === -1
              ) {
                this.error(`Cannot assign to '${name}'`, variableNode);
              }
              const indexExprs = variableNode.getChildren(
                NodeName.VariableIndex,
              );
              if (name === "numberOfSets" && indexExprs.length > 0) {
                this.error(`${name} is not an array`, variableNode);
              } else if (indexExprs.length > 1) {
                this.error(
                  `Can't assign to set variations, weeks or days here`,
                  variableNode,
                );
              }
            }
          }
        }
      } else if (cursor.node.type.name === NodeName.StateVariable) {
        const stateKey = this.getStateKey(cursor.node);
        if (stateKey != null && !(stateKey in this.state)) {
          this.error(`There's no state variable '${stateKey}'`, cursor.node);
        }
      } else if (cursor.node.type.name === NodeName.Variable) {
        const variableKey = this.getValue(cursor.node);
        if (!(variableKey in vars)) {
          this.error(`There's no variable '${variableKey}'`, cursor.node);
        }
      } else if (cursor.node.type.name === NodeName.VariableExpression) {
        const [nameNode, indexExpr] = getChildren(cursor.node);
        if (nameNode == null) {
          assert(NodeName.VariableExpression);
        }
        const name = this.getValue(nameNode);
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
          if (validNames.indexOf(name as keyof IScriptBindings) === -1) {
            this.error(`${name} is not an array variable`, nameNode);
          }
        } else if (!(name in this.bindings)) {
          this.error(`${name} is not a valid variable`, nameNode);
        }
      }
    } while (cursor.next());
  }

  public static changeWeightsToCompleteWeights(oldScript: string): string {
    const node = LiftoscriptParser.parse(oldScript);
    const cursor = node.cursor();
    let script = oldScript;
    let shift = 0;
    do {
      if (cursor.node.type.name === NodeName.VariableExpression) {
        const keywordNode = cursor.node.getChild(NodeName.Keyword);
        if (keywordNode) {
          const keyword = LiftoscriptEvaluator.getValue(oldScript, keywordNode);
          if (keyword === "weights") {
            const parent = cursor.node.parent;
            if (
              parent != null &&
              !(
                (parent.type.name === NodeName.AssignmentExpression ||
                  parent.type.name === NodeName.IncAssignmentExpression) &&
                parent.firstChild?.from === cursor.node.from &&
                parent.firstChild?.to === cursor.node.to
              )
            ) {
              const from = keywordNode.from;
              const to = keywordNode.to;
              const oldWeightStr = keyword;
              const newWeightStr = "completedWeights";
              script =
                script.substring(0, from + shift) +
                newWeightStr +
                script.substring(to + shift);
              shift = shift + newWeightStr.length - oldWeightStr.length;
            }
          }
        }
      }
    } while (cursor.next());
    return script;
  }

  private evaluateToNumber(expr: SyntaxNode): number {
    const v = this.evaluate(expr);
    const v1 = Array.isArray(v) ? v[0] : v;
    return Weight_is(v1) ? v1.value : typeof v1 === "number" ? v1 : v1 ? 1 : 0;
  }

  private evaluateToNumberOrWeightOrPercentage(
    expr: SyntaxNode,
  ): number | IWeight | IPercentage {
    const v = this.evaluate(expr);
    const v1 = Array.isArray(v) ? v[0] : v;
    return Weight_is(v1) || Weight_isPct(v1)
      ? v1
      : typeof v1 === "number"
        ? v1
        : v1
          ? 1
          : 0;
  }

  private changeNumberOfSets(
    expression: SyntaxNode,
    op: IAssignmentOp,
  ): number | IWeight | IPercentage {
    const oldNumberOfSets = this.bindings.weights.length;
    const evaluatedValue = MathUtils_applyOp(
      this.bindings.numberOfSets,
      this.evaluateToNumber(expression),
      op,
    );

    this.bindings.weights = this.bindings.weights.slice(0, evaluatedValue);
    this.bindings.originalWeights = this.bindings.originalWeights.slice(
      0,
      evaluatedValue,
    );
    this.bindings.reps = this.bindings.reps.slice(0, evaluatedValue);
    this.bindings.minReps = this.bindings.minReps.slice(0, evaluatedValue);
    this.bindings.RPE = this.bindings.RPE.slice(0, evaluatedValue);
    this.bindings.w = this.bindings.weights.slice(0, evaluatedValue);
    this.bindings.r = this.bindings.reps.slice(0, evaluatedValue);
    this.bindings.mr = this.bindings.minReps.slice(0, evaluatedValue);
    this.bindings.timers = this.bindings.timers.slice(0, evaluatedValue);
    this.bindings.amraps = this.bindings.amraps.slice(0, evaluatedValue);
    this.bindings.logrpes = this.bindings.logrpes.slice(0, evaluatedValue);
    this.bindings.askweights = this.bindings.askweights.slice(
      0,
      evaluatedValue,
    );
    this.bindings.completedReps = this.bindings.completedReps.slice(
      0,
      evaluatedValue,
    );
    this.bindings.completedRepsLeft = this.bindings.completedRepsLeft.slice(
      0,
      evaluatedValue,
    );
    this.bindings.cr = this.bindings.cr.slice(0, evaluatedValue);
    this.bindings.cw = this.bindings.cw.slice(0, evaluatedValue);
    this.bindings.completedWeights = this.bindings.completedWeights.slice(
      0,
      evaluatedValue,
    );
    this.bindings.completedRPE = this.bindings.completedRPE.slice(
      0,
      evaluatedValue,
    );
    this.bindings.isCompleted = this.bindings.isCompleted.slice(
      0,
      evaluatedValue,
    );

    const ns = oldNumberOfSets - 1;
    for (let i = 0; i < evaluatedValue; i += 1) {
      if (i > ns) {
        this.bindings.weights[i] = Weight_build(
          this.bindings.weights[ns]?.value ?? 0,
          this.bindings.weights[ns]?.unit || "lb",
        );
        this.bindings.originalWeights[i] = Weight_buildAny(
          this.bindings.originalWeights[ns]?.value ?? 0,
          this.bindings.originalWeights[ns]?.unit || "lb",
        );
        this.bindings.reps[i] = this.bindings.reps[ns] ?? 0;
        this.bindings.timers[i] = this.bindings.timers[ns];
        this.bindings.amraps[i] = this.bindings.amraps[ns];
        this.bindings.logrpes[i] = this.bindings.logrpes[ns];
        this.bindings.askweights[i] = this.bindings.askweights[ns];
        this.bindings.minReps[i] = this.bindings.minReps[ns];
        this.bindings.RPE[i] = this.bindings.RPE[ns];
        this.bindings.w[i] = this.bindings.weights[i];
        this.bindings.r[i] = this.bindings.reps[i];
        this.bindings.mr[i] = this.bindings.minReps[i];
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

  private changeBinding(
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
  ): number | IWeight | IPercentage {
    const indexes = indexExprs.map((ie) => getChildren(ie)[0]);
    const maxTargetLength = 1;
    if (indexes.length > maxTargetLength) {
      this.error(`${key} can only have 1 value inside []`, expression);
    }
    const indexValues = this.calculateIndexValues(indexes);
    const normalizedIndexValues = this.normalizeTarget(
      indexValues,
      maxTargetLength,
    );
    const [setIndex] = normalizedIndexValues;
    let value: number | IWeight | IPercentage = 0;
    if (key === "weights") {
      for (let i = 0; i < this.bindings.weights.length; i += 1) {
        if (
          !this.bindings.isCompleted[i] &&
          (setIndex === "*" || setIndex === i + 1)
        ) {
          const evalutedValue =
            this.evaluateToNumberOrWeightOrPercentage(expression);
          const newValue = Weight_applyOp(
            this.bindings.rm1,
            this.bindings.weights[i] ?? Weight_build(0, this.unit),
            evalutedValue,
            op,
          );
          value = Weight_convertToWeight(
            this.bindings.rm1,
            newValue,
            this.unit,
          );
          this.bindings.originalWeights[i] = value;
          this.bindings.weights[i] = this.fns.roundWeight(
            value,
            this.fnContext,
          );
        }
      }
    } else {
      for (let i = 0; i < this.bindings[key].length; i += 1) {
        if (
          !this.bindings.isCompleted[i] &&
          (setIndex === "*" || setIndex === i + 1)
        ) {
          const evaluatedValue = this.evaluateToNumber(expression);
          value = MathUtils_applyOp(
            this.bindings[key][i] ?? 0,
            evaluatedValue,
            op,
          );
          if (key === "RPE") {
            value = MathUtils_round(MathUtils_clamp(value, 0, 10), 0.5);
          }
          if (key === "amraps" || key === "logrpes" || key === "askweights") {
            value = Math.round(MathUtils_clamp(value, 0, 1));
          }
          this.bindings[key][i] = value;
        }
      }
    }
    return value;
  }

  private recordVariableUpdate(
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
  ): number | IWeight | IPercentage {
    const indexes = indexExprs.map((ie) => getChildren(ie)[0]);
    const maxTargetLength =
      key === "setVariationIndex" || key === "descriptionIndex"
        ? 2
        : key === "numberOfSets"
          ? 3
          : 4;
    if (key === "setVariationIndex") {
      if (indexes.length > maxTargetLength) {
        this.error(
          `setVariationIndex can only have 2 values inside [*:*]`,
          expression,
        );
      }
    } else if (key === "descriptionIndex") {
      if (indexes.length > maxTargetLength) {
        this.error(
          `descriptionIndex can only have 2 values inside [*:*]`,
          expression,
        );
      }
    } else if (key === "numberOfSets") {
      if (indexes.length > maxTargetLength) {
        this.error(
          `numberOfSets can only have 3 values inside [*:*:*]`,
          expression,
        );
      }
    } else if (indexes.length > maxTargetLength) {
      this.error(`${key} can only have 4 values inside [*:*:*:*]`, expression);
    }
    const indexValues = this.calculateIndexValues(indexes);
    const normalizedIndexValues = this.normalizeTarget(
      indexValues,
      maxTargetLength,
    );
    let result: number | IWeight | IPercentage;
    if (key === "weights") {
      result = this.evaluateToNumberOrWeightOrPercentage(expression);
      this.updates.push({
        type: key,
        value: { value: result, op, target: normalizedIndexValues },
      });
    } else {
      result = this.evaluateToNumber(expression);
      this.updates.push({
        type: key,
        value: { value: result, op, target: normalizedIndexValues },
      });
      if (key === "setVariationIndex") {
        const [week, day] = normalizedIndexValues;
        if (
          (week === "*" || week === this.bindings.week) &&
          (day === "*" || day === this.bindings.day)
        ) {
          this.bindings.setVariationIndex = result;
        }
      } else if (key === "descriptionIndex") {
        const [week, day] = normalizedIndexValues;
        if (
          (week === "*" || week === this.bindings.week) &&
          (day === "*" || day === this.bindings.day)
        ) {
          this.bindings.descriptionIndex = result;
        }
      } else if (key === "numberOfSets") {
        const [week, day, setVariationIndex] = normalizedIndexValues;
        if (
          (week === "*" || week === this.bindings.week) &&
          (day === "*" || day === this.bindings.day) &&
          (setVariationIndex === "*" ||
            setVariationIndex === this.bindings.setVariationIndex)
        ) {
          this.bindings.numberOfSets = result;
          this.bindings.ns = result;
        }
      }
    }

    return result;
  }

  private calculateIndexValues(indexes: SyntaxNode[]): (number | "*")[] {
    return CollectionUtils_compact(indexes).map((ie) => {
      if (ie.type.name === NodeName.Wildcard) {
        return "*" as const;
      } else {
        const v = this.evaluate(ie);
        const v1 = Array.isArray(v) ? v[0] : v;
        return Weight_is(v1)
          ? v1.value
          : typeof v1 === "number"
            ? v1
            : v1
              ? 1
              : 0;
      }
    });
  }

  private normalizeTarget(
    target: (number | "*")[],
    length: number,
  ): (number | "*")[] {
    const newTarget = [...target];
    for (let i = 0; i < length - target.length; i += 1) {
      newTarget.unshift("*");
    }
    return newTarget;
  }

  private toNumber(
    value:
      | number
      | boolean
      | IWeight
      | IPercentage
      | (IWeight | IPercentage | number | undefined)[],
  ): number {
    if (typeof value === "number") {
      return value;
    } else if (typeof value === "boolean") {
      return 0;
    } else if (Weight_is(value)) {
      return value.value;
    } else if (Weight_isPct(value)) {
      return value.value;
    } else if (Array.isArray(value)) {
      return this.toNumber(value[0] ?? 0);
    } else {
      return 0;
    }
  }

  public evaluate(
    expr: SyntaxNode,
  ):
    | number
    | boolean
    | IWeight
    | IPercentage
    | (IWeight | IPercentage | number | undefined)[] {
    if (
      expr.type.name === NodeName.Program ||
      expr.type.name === NodeName.BlockExpression
    ) {
      let result:
        | number
        | boolean
        | IWeight
        | (IWeight | IPercentage | number | undefined)[]
        | IPercentage = 0;
      for (const child of getChildren(expr)) {
        if (!child.type.isSkipped) {
          result = this.evaluate(child);
        }
      }
      return result;
    } else if (expr.type.name === NodeName.BinaryExpression) {
      const [left, operator, right] = getChildren(expr);
      const evalLeft = this.evaluate(left);
      const evalRight = this.evaluate(right);
      const op = this.getValue(operator);
      if (typeof evalLeft === "boolean" || typeof evalRight === "boolean") {
        if (op === "&&") {
          return evalLeft && evalRight;
        } else if (op === "||") {
          return evalLeft || evalRight;
        } else {
          this.error(`Unknown operator ${op}`, operator);
        }
      } else {
        if (op === ">") {
          return comparing(evalLeft, evalRight, op);
        } else if (op === "<") {
          return comparing(evalLeft, evalRight, op);
        } else if (op === ">=") {
          return comparing(evalLeft, evalRight, op);
        } else if (op === "<=") {
          return comparing(evalLeft, evalRight, op);
        } else if (op === "==") {
          return comparing(evalLeft, evalRight, op);
        } else if (op === "!=") {
          return comparing(evalLeft, evalRight, op);
        } else {
          if (Array.isArray(evalLeft) || Array.isArray(evalRight)) {
            this.error(`You cannot apply ${op} to arrays`, operator);
          }
          if (op === "+") {
            return this.add(evalLeft, evalRight);
          } else if (op === "-") {
            return this.subtract(evalLeft, evalRight);
          } else if (op === "*") {
            return this.multiply(evalLeft, evalRight);
          } else if (op === "/") {
            return this.divide(evalLeft, evalRight);
          } else if (op === "%") {
            return this.modulo(evalLeft, evalRight);
          } else {
            this.error(
              `Unknown operator ${op} between ${evalLeft} and ${evalRight}`,
              operator,
            );
          }
        }
      }
    } else if (expr.type.name === NodeName.NumberExpression) {
      const numberNode = expr.getChild(NodeName.Number);
      if (numberNode == null) {
        assert(NodeName.NumberExpression);
      }
      const value = parseFloat(this.getValue(numberNode));
      const plusNode = expr.getChild(NodeName.Plus);
      const sign = plusNode ? this.getValue(plusNode) : undefined;
      return sign === "-" ? -value : value;
    } else if (expr.type.name === NodeName.Percentage) {
      const value = MathUtils_roundFloat(parseFloat(this.getValue(expr)), 2);
      return Weight_buildPct(value);
    } else if (expr.type.name === NodeName.Ternary) {
      const [condition, then, or] = getChildren(expr);
      return this.evaluate(condition) ? this.evaluate(then) : this.evaluate(or);
    } else if (expr.type.name === NodeName.ForExpression) {
      const variableNode = expr.getChild(NodeName.Variable);
      const forInExpression = expr.getChild(NodeName.ForInExpression);
      const blockNode = expr.getChild(NodeName.BlockExpression);
      if (variableNode == null) {
        assert(NodeName.ForExpression);
      }
      if (forInExpression == null) {
        assert(NodeName.ForInExpression);
      }
      if (blockNode == null) {
        assert(NodeName.BlockExpression);
      }
      const forIn = this.evaluate(forInExpression);
      if (!Array.isArray(forIn)) {
        this.error(`for in expression should return an array`, forInExpression);
      }
      const varKey = this.getValue(variableNode).replace("var.", "");
      for (let i = 1; i <= forIn.length; i += 1) {
        this.vars[varKey] = i;
        this.evaluate(blockNode);
      }
      return forIn.length;
    } else if (expr.type.name === NodeName.IfExpression) {
      const parenthesisNodes = expr.getChildren(NodeName.ParenthesisExpression);
      const blockNodes = expr.getChildren(NodeName.BlockExpression);
      while (parenthesisNodes.length > 0) {
        const parenthesisNode = parenthesisNodes.shift()!;
        const blockNode = blockNodes.shift()!;
        const condition = this.evaluate(parenthesisNode);
        if (condition) {
          return this.evaluate(blockNode);
        }
      }
      const lastBlock = blockNodes.shift();
      if (lastBlock != null) {
        return this.evaluate(lastBlock);
      } else {
        return 0;
      }
    } else if (expr.type.name === NodeName.ParenthesisExpression) {
      const [node] = getChildren(expr);
      if (node == null) {
        assert(NodeName.ParenthesisExpression);
      }
      return this.evaluate(node);
    } else if (expr.type.name === NodeName.StateVariableIndex) {
      const [expression] = getChildren(expr);
      return this.evaluate(expression);
    } else if (expr.type.name === NodeName.AssignmentExpression) {
      const [variableNode, expression] = getChildren(expr);
      if (
        variableNode == null ||
        (variableNode.type.name !== NodeName.StateVariable &&
          variableNode.type.name !== NodeName.VariableExpression &&
          variableNode.type.name !== NodeName.Variable) ||
        expression == null
      ) {
        assert(NodeName.AssignmentExpression);
      }
      if (variableNode.type.name === NodeName.VariableExpression) {
        const nameNode = variableNode.getChild(NodeName.Keyword);
        if (nameNode == null) {
          this.error(`Missing variable name`, variableNode);
        }
        const indexExprs = variableNode.getChildren(NodeName.VariableIndex);
        const variable = this.getValue(nameNode);
        if (variable === "rm1") {
          if (indexExprs.length > 0) {
            this.error(`rm1 is not an array`, expr);
          }
          const evaluatedValue = this.evaluate(expression);
          let value = Array.isArray(evaluatedValue)
            ? evaluatedValue[0]
            : evaluatedValue;
          value = value ?? 0;
          value = value === true ? 1 : value === false ? 0 : value;
          value = Weight_convertToWeight(this.bindings.rm1, value, this.unit);
          this.bindings.rm1 = value;
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
          return this.recordVariableUpdate(
            variable,
            expression,
            indexExprs,
            "=",
          );
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
          this.error(`Unknown variable '${variable}'`, variableNode);
        }
      } else if (variableNode.type.name === NodeName.Variable) {
        const varKey = this.getValue(variableNode).replace("var.", "");
        const value = this.evaluate(expression);
        if (
          Weight_is(value) ||
          Weight_isPct(value) ||
          typeof value === "number"
        ) {
          this.vars[varKey] = value;
        } else {
          this.vars[varKey] = value ? 1 : 0;
        }
        return this.vars[varKey];
      } else {
        const indexNode = variableNode.getChild(NodeName.StateVariableIndex);
        const stateKeyNode = variableNode.getChild(NodeName.Keyword);
        if (stateKeyNode != null) {
          const stateKey = this.getValue(stateKeyNode);
          let state: IProgramState | undefined;
          if (indexNode == null) {
            if (stateKey in this.state) {
              state = this.state;
            } else {
              this.error(
                `There's no state variable '${stateKey}'`,
                variableNode,
              );
            }
          } else {
            const indexEval = this.evaluate(indexNode);
            const index = this.toNumber(indexEval);
            state = this.otherStates[index];
          }
          const value = this.evaluate(expression);
          if (state != null) {
            if (
              Weight_is(value) ||
              Weight_isPct(value) ||
              typeof value === "number"
            ) {
              state[stateKey] = value;
            } else {
              state[stateKey] = value ? 1 : 0;
            }
          }
          return value;
        } else {
          return 0;
        }
      }
    } else if (expr.type.name === NodeName.IncAssignmentExpression) {
      const [stateVar, incAssignmentExpr, expression] = getChildren(expr);
      if (
        stateVar == null ||
        (stateVar.type.name !== NodeName.StateVariable &&
          stateVar.type.name !== NodeName.VariableExpression &&
          stateVar.type.name !== NodeName.Variable) ||
        expression == null ||
        incAssignmentExpr == null
      ) {
        assert(NodeName.IncAssignmentExpression);
      }
      if (stateVar.type.name === NodeName.VariableExpression) {
        const nameNode = stateVar.getChild(NodeName.Keyword);
        if (nameNode == null) {
          this.error(`Missing variable name`, stateVar);
        }
        const indexExprs = stateVar.getChildren(NodeName.VariableIndex);
        const variable = this.getValue(nameNode);
        if (variable === "rm1") {
          if (indexExprs.length > 0) {
            this.error(`rm1 is not an array`, expr);
          }
          const evaluatedValue = this.evaluate(expression);
          let value = Array.isArray(evaluatedValue)
            ? evaluatedValue[0]
            : evaluatedValue;
          value = value ?? 0;
          value = value === true ? 1 : value === false ? 0 : value;

          const op = this.getValue(incAssignmentExpr);
          if (op === "+=") {
            this.bindings.rm1 = Weight_convertToWeight(
              this.bindings.rm1,
              this.add(this.bindings.rm1, value),
              this.unit,
            );
          } else if (op === "-=") {
            this.bindings.rm1 = Weight_convertToWeight(
              this.bindings.rm1,
              this.subtract(this.bindings.rm1, value),
              this.unit,
            );
          } else if (op === "*=") {
            this.bindings.rm1 = Weight_convertToWeight(
              this.bindings.rm1,
              this.multiply(this.bindings.rm1, value),
              this.unit,
            );
          } else if (op === "/=") {
            this.bindings.rm1 = Weight_convertToWeight(
              this.bindings.rm1,
              this.divide(this.bindings.rm1, value),
              this.unit,
            );
          } else {
            this.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
          }
          return this.bindings.rm1;
        } else if (
          this.mode === "planner" &&
          (variable === "reps" ||
            variable === "weights" ||
            variable === "RPE" ||
            variable === "minReps" ||
            variable === "timers" ||
            variable === "setVariationIndex" ||
            variable === "descriptionIndex" ||
            variable === "numberOfSets")
        ) {
          const op = this.getValue(incAssignmentExpr);
          if (
            op !== "=" &&
            op !== "+=" &&
            op !== "-=" &&
            op !== "*=" &&
            op !== "/="
          ) {
            this.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
          }
          return this.recordVariableUpdate(
            variable,
            expression,
            indexExprs,
            op,
          );
        } else if (this.mode === "update" && variable === "numberOfSets") {
          const op = this.getValue(incAssignmentExpr);
          if (
            op !== "=" &&
            op !== "+=" &&
            op !== "-=" &&
            op !== "*=" &&
            op !== "/="
          ) {
            this.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
          }
          return this.changeNumberOfSets(expression, op);
        } else if (
          this.mode === "update" &&
          (variable === "reps" ||
            variable === "weights" ||
            variable === "RPE" ||
            variable === "minReps" ||
            variable === "timers")
        ) {
          const op = this.getValue(incAssignmentExpr);
          if (
            op !== "=" &&
            op !== "+=" &&
            op !== "-=" &&
            op !== "*=" &&
            op !== "/="
          ) {
            this.error(
              `Unknown operator ${op} after ${variable}`,
              incAssignmentExpr,
            );
          }
          return this.changeBinding(variable, expression, indexExprs, op);
        } else {
          this.error(`Unknown variable '${variable}'`, stateVar);
        }
      } else if (stateVar.type.name === NodeName.Variable) {
        const varKey = this.getValue(stateVar).replace("var.", "");
        let value = this.evaluate(expression);
        if (
          !(
            Weight_is(value) ||
            Weight_isPct(value) ||
            typeof value === "number"
          )
        ) {
          value = value ? 1 : 0;
        }
        const op = this.getValue(incAssignmentExpr);
        if (
          op !== "=" &&
          op !== "+=" &&
          op !== "-=" &&
          op !== "*=" &&
          op !== "/="
        ) {
          this.error(
            `Unknown operator ${op} after ${varKey}`,
            incAssignmentExpr,
          );
        }
        const currentValue = this.vars[varKey];
        if (op === "+=") {
          this.vars[varKey] = this.add(currentValue, value);
        } else if (op === "-=") {
          this.vars[varKey] = this.subtract(currentValue, value);
        } else if (op === "*=") {
          this.vars[varKey] = this.multiply(currentValue, value);
        } else if (op === "/=") {
          this.vars[varKey] = this.divide(currentValue, value);
        } else {
          this.error(
            `Unknown operator ${op} after ${varKey}`,
            incAssignmentExpr,
          );
        }
        return this.vars[varKey];
      } else {
        const indexNode = stateVar.getChild(NodeName.StateVariableIndex);
        const stateKeyNode = stateVar.getChild(NodeName.Keyword);
        if (stateKeyNode != null) {
          const stateKey = this.getValue(stateKeyNode);
          let state: IProgramState | undefined;
          if (indexNode == null) {
            if (stateKey in this.state) {
              state = this.state;
            } else {
              this.error(`There's no state variable '${stateKey}'`, stateVar);
            }
          } else {
            const indexEval = this.evaluate(indexNode);
            const index = this.toNumber(indexEval);
            state = this.otherStates[index];
          }

          let value = this.evaluate(expression);
          if (state != null) {
            if (
              !(
                Weight_is(value) ||
                Weight_isPct(value) ||
                typeof value === "number"
              )
            ) {
              value = value ? 1 : 0;
            }
            const op = this.getValue(incAssignmentExpr);
            const currentValue = state[stateKey] ?? 0;
            if (op === "+=") {
              state[stateKey] = this.add(currentValue, value);
            } else if (op === "-=") {
              state[stateKey] = this.subtract(currentValue, value);
            } else if (op === "*=") {
              state[stateKey] = this.multiply(currentValue, value);
            } else if (op === "/=") {
              state[stateKey] = this.divide(currentValue, value);
            } else {
              this.error(
                `Unknown operator ${op} after state.${stateKey}`,
                incAssignmentExpr,
              );
            }
            return state[stateKey];
          } else {
            return value;
          }
        } else {
          return 0;
        }
      }
    } else if (expr.type.name === NodeName.BuiltinFunctionExpression) {
      const fns = this.fns;
      const [keyword, ...args] = getChildren(expr);
      if (keyword == null || keyword.type.name !== NodeName.Keyword) {
        assert(NodeName.BuiltinFunctionExpression);
      }
      const name = this.getValue(keyword) as keyof typeof fns;
      if (name != null && this.fns[name] != null) {
        const argValues = args.map((a) => this.evaluate(a));
        const fn = this.fns[name];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (fn as any).apply(undefined, [
          ...argValues,
          this.fnContext,
          this.bindings,
        ]);
      } else {
        this.error(`Unknown function '${name}'`, keyword);
      }
    } else if (expr.type.name === NodeName.UnaryExpression) {
      const [, expression] = getChildren(expr);
      if (expression == null) {
        assert(NodeName.UnaryExpression);
      }
      const evaluated = this.evaluate(expression);
      return !evaluated;
    } else if (expr.type.name === NodeName.WeightExpression) {
      return this.getWeight(expr) ?? Weight_build(0, this.unit);
    } else if (expr.type.name === NodeName.VariableExpression) {
      const [nameNode, ...indexExprs] = getChildren(expr);
      if (nameNode == null) {
        assert(NodeName.VariableExpression);
      }
      const name = this.getValue(nameNode) as keyof IScriptBindings;
      if (indexExprs.some((e) => e.type.name !== NodeName.VariableIndex)) {
        assert(NodeName.VariableIndex);
      }
      if (indexExprs.length === 0) {
        let value = this.bindings[name];
        if (Array.isArray(value) && name === "minReps") {
          value = value.map((v, i) => (v as number) ?? this.bindings.reps[i]);
        }
        return value;
      } else if (indexExprs.length === 1) {
        const indexExpr = indexExprs[0];
        const indexNode = getChildren(indexExpr)[0];
        if (
          indexNode.type.name === NodeName.Wildcard ||
          indexNode.type.name === NodeName.Current
        ) {
          this.error(
            `Can't use '*' or '_' as an index when reading from variables`,
            indexNode,
          );
        }
        const indexEval = this.evaluate(indexNode);
        let index: number;
        if (Weight_is(indexEval) || Weight_isPct(indexEval)) {
          index = indexEval.value;
        } else if (typeof indexEval === "number") {
          index = indexEval;
        } else {
          index = indexEval ? 1 : 0;
        }
        index -= 1;
        const binding = this.bindings[name];
        if (!Array.isArray(binding)) {
          this.error(`Variable ${name} should be an array`, nameNode);
        }
        if (index >= binding.length) {
          this.error(
            `Out of bounds index ${index + 1} for array ${name}`,
            nameNode,
          );
        }
        let value = binding[index];
        if (value == null) {
          value = name === "minReps" ? (this.bindings.reps[index] ?? 0) : 0;
        }
        return value;
      } else {
        this.error(
          `Can't use [1:1] syntax when reading from the ${name} variable`,
          expr,
        );
      }
    } else if (expr.type.name === NodeName.StateVariable) {
      const stateKey = this.getStateKey(expr);
      if (stateKey == null) {
        this.error(
          `You cannot read from other exercises states, you can only write to them`,
          expr,
        );
      }
      if (stateKey in this.state) {
        return this.state[stateKey];
      } else {
        this.error(`There's no state variable '${stateKey}'`, expr);
      }
    } else if (expr.type.name === NodeName.Variable) {
      const varKey = this.getValue(expr).replace("var.", "");
      if (varKey in this.vars) {
        return this.vars[varKey];
      } else {
        this.error(`There's no variable '${varKey}'`, expr);
      }
    } else if (expr.type.name === NodeName.ForInExpression) {
      const child = getChildren(expr)[0];
      return this.evaluate(child);
    } else {
      this.error(`Unknown node type ${expr.node.type.name}`, expr);
    }
  }

  private add(
    one: IWeight | number | IPercentage,
    two: IWeight | number | IPercentage,
  ): IWeight | number | IPercentage {
    return this.operation(this.bindings.rm1, one, two, (a, b) => a + b);
  }

  private subtract(
    one: IWeight | number | IPercentage,
    two: IWeight | number | IPercentage,
  ): IWeight | number | IPercentage {
    return this.operation(this.bindings.rm1, one, two, (a, b) => a - b);
  }

  private multiply(
    one: IWeight | number | IPercentage,
    two: IWeight | number | IPercentage,
  ): IWeight | number | IPercentage {
    return this.operation(this.bindings.rm1, one, two, (a, b) => a * b);
  }

  private divide(
    one: IWeight | number | IPercentage,
    two: IWeight | number | IPercentage,
  ): IWeight | number | IPercentage {
    return this.operation(this.bindings.rm1, one, two, (a, b) => a / b);
  }

  private modulo(
    one: IWeight | number | IPercentage,
    two: IWeight | number | IPercentage,
  ): IWeight | number | IPercentage {
    return this.operation(undefined, one, two, (a, b) => a % b);
  }

  private operation(
    onerm: IWeight | undefined,
    a: IWeight | number | IPercentage,
    b: IWeight | number | IPercentage,
    op: (x: number, y: number) => number,
  ): IWeight | number | IPercentage {
    try {
      return Weight_op(onerm, a, b, op);
    } catch (error) {
      const e = error as Error;
      throw new LiftoscriptSyntaxError(e.message, 0, 0, 0, 0);
    }
  }
}

// import {
//   Equipment_getUnitOrDefaultForExerciseType,
//   Equipment_getEquipmentDataForExerciseType,
//   Equipment_smallestPlate,
// } from "./equipment";
// import {
//   Exercise_get,
//   Exercise_onerm,
//   Exercise_defaultRounding,
// } from "./exercise";

const prebuiltWeights: Partial<Record<string, IWeight>> = {};

export function Weight_display(
  weight: IWeight | IPercentage | number,
  withUnit: boolean = true,
): string {
  if (typeof weight === "number") {
    return `${weight}`;
  } else if (Weight_isPct(weight)) {
    return `${weight.value}${withUnit ? "%" : ""}`;
  } else {
    return `${parseFloat(weight.value.toFixed(2)).toString()}${withUnit ? ` ${weight.unit}` : ""}`;
  }
}

export function Weight_rpePct(reps: number, rpe: number): IPercentage {
  return Weight_buildPct(
    MathUtils_roundTo005(Weight_rpeMultiplier(reps, rpe) * 100),
  );
}

export function Weight_smartConvert(weight: IWeight, toUnit: IUnit): IWeight {
  if (weight.unit === toUnit) {
    return weight;
  }
  const value = weight.value;
  if (weight.unit === "kg") {
    if (value < 15) {
      return Weight_build(value * 2, toUnit);
    } else {
      return Weight_build(MathUtils_round(value * 2.25, 5), toUnit);
    }
  } else {
    if (value < 15) {
      return Weight_build(MathUtils_round(value / 2, 0.25), toUnit);
    } else {
      return Weight_build(MathUtils_round(value / 2.25, 2.5), toUnit);
    }
  }
}

export function Weight_oppositeUnit(unit: IUnit): IUnit {
  return unit === "kg" ? "lb" : "kg";
}

export function Weight_print(weight: IWeight | IPercentage | number): string {
  if (typeof weight === "number") {
    return `${n(weight)}`;
  } else {
    return `${n(weight.value)}${weight.unit}`;
  }
}

export function Weight_printNull(
  weight: IWeight | IPercentage | number | undefined,
): string {
  if (weight == null) {
    return "";
  } else if (typeof weight === "number") {
    return `${n(weight)}`;
  } else {
    return `${n(weight.value)}${weight.unit}`;
  }
}

export function Weight_parsePct(
  str?: string,
): IPercentage | IWeight | undefined {
  if (str == null) {
    return undefined;
  }
  const match = str.match(/^([\-+]?[0-9.]+)%$/);
  if (match) {
    return Weight_buildPct(MathUtils_roundFloat(parseFloat(match[1]), 2));
  } else {
    return Weight_parse(str);
  }
}

export function Weight_parse(str: string): IWeight | undefined {
  const match = str.match(/^([\-+]?[0-9.]+)\s*(kg|lb)$/);
  if (match) {
    return Weight_build(
      MathUtils_roundFloat(parseFloat(match[1]), 2),
      match[2] as IUnit,
    );
  } else {
    return undefined;
  }
}

export function Weight_printOrNumber(
  weight: IWeight | IPercentage | number,
): string {
  return typeof weight === "number" ? `${weight}` : Weight_print(weight);
}

export function Weight_buildPct(value: number): IPercentage {
  return { value, unit: "%" };
}

export function Weight_buildAny(
  value: number,
  unit: IUnit | "%",
): IWeight | IPercentage {
  if (unit === "%") {
    return Weight_buildPct(value);
  } else {
    return Weight_build(value, unit);
  }
}

export function Weight_build(value: number, unit: IUnit): IWeight {
  const key = `${value}_${unit}`;
  const prebuiltWeight = prebuiltWeights[key];
  if (prebuiltWeight != null) {
    return prebuiltWeight;
  } else {
    const v = {
      value: typeof value === "string" ? parseFloat(value) : value,
      unit,
    };
    prebuiltWeights[`${value}_${unit}`] = v;
    return v;
  }
}

export function Weight_clone(value: IWeight): IWeight {
  return Weight_build(value.value, value.unit);
}

export function Weight_isOrPct(
  object: unknown,
): object is IWeight | IPercentage {
  const objWeight = object as IWeight | IPercentage;
  return (
    objWeight &&
    typeof objWeight === "object" &&
    "unit" in objWeight &&
    "value" in objWeight &&
    (objWeight.unit === "kg" ||
      objWeight.unit === "lb" ||
      objWeight.unit === "%")
  );
}

export function Weight_is(object: unknown): object is IWeight {
  const objWeight = object as IWeight;
  return (
    objWeight &&
    typeof objWeight === "object" &&
    "unit" in objWeight &&
    "value" in objWeight &&
    (objWeight.unit === "kg" || objWeight.unit === "lb")
  );
}

export function Weight_isPct(object: unknown): object is IPercentage {
  const objWeight = object as IPercentage;
  return (
    objWeight &&
    typeof objWeight === "object" &&
    "unit" in objWeight &&
    "value" in objWeight &&
    objWeight.unit === "%"
  );
}

export function Weight_round(
  weight: IWeight,
  settings: ISettings,
  unit: IUnit,
  exerciseType?: IExerciseType,
): IWeight {
  if (exerciseType == null) {
    return Weight_roundTo005(weight);
  }
  return Weight_calculatePlates(weight, settings, unit, exerciseType)
    .totalWeight;
}

export function Weight_increment(
  weight: IWeight,
  settings: ISettings,
  exerciseType?: IExerciseType,
): IWeight {
  const equipmentData = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  if (equipmentData) {
    const unit = equipmentData.unit ?? weight.unit;
    const roundWeight = Weight_round(weight, settings, unit, exerciseType);
    if (equipmentData.isFixed) {
      const items = CollectionUtils_sort(
        equipmentData.fixed.filter((e) => e.unit === unit),
        (a, b) => Weight_compare(a, b),
      );
      const item = items.find((i) => Weight_gt(i, roundWeight));
      return item ?? items[items.length - 1] ?? roundWeight;
    } else {
      const smallestPlate = Weight_multiply(
        Equipment_smallestPlate(equipmentData, unit),
        equipmentData.multiplier,
      );
      let newWeight = roundWeight;
      let attempt = 0;
      do {
        newWeight = Weight_add(newWeight, smallestPlate);
        attempt += 1;
      } while (
        attempt < 20 &&
        Weight_eq(
          Weight_round(newWeight, settings, unit, exerciseType),
          roundWeight,
        )
      );
      return newWeight;
    }
  } else {
    const roundWeight = Weight_round(
      weight,
      settings,
      weight.unit,
      exerciseType,
    );
    const rounding = exerciseType
      ? Exercise_defaultRounding(exerciseType, settings)
      : 1;
    return Weight_build(roundWeight.value + rounding, roundWeight.unit);
  }
}

export function Weight_decrement(
  weight: IWeight,
  settings: ISettings,
  exerciseType?: IExerciseType,
): IWeight {
  const equipmentData = exerciseType
    ? Equipment_getEquipmentDataForExerciseType(settings, exerciseType)
    : undefined;
  if (equipmentData) {
    const unit = equipmentData.unit ?? weight.unit;
    const roundWeight = Weight_round(weight, settings, unit, exerciseType);
    if (equipmentData.isFixed) {
      const items = CollectionUtils_sort(
        equipmentData.fixed.filter((e) => e.unit === unit),
        (a, b) => Weight_compareReverse(a, b),
      );
      const item = items.find((i) => Weight_lt(i, roundWeight));
      return item ?? items[items.length - 1] ?? roundWeight;
    } else {
      const smallestPlate = Weight_multiply(
        Equipment_smallestPlate(equipmentData, unit),
        equipmentData.multiplier,
      );
      const subtracted = Weight_subtract(roundWeight, smallestPlate);
      const newWeight = Weight_round(subtracted, settings, unit, exerciseType);
      return Weight_build(newWeight.value, newWeight.unit);
    }
  } else {
    const roundWeight = Weight_round(
      weight,
      settings,
      weight.unit,
      exerciseType,
    );
    const rounding = exerciseType
      ? Exercise_defaultRounding(exerciseType, settings)
      : 1;
    return Weight_build(roundWeight.value - rounding, roundWeight.unit);
  }
}

export function Weight_getOneRepMax(
  weight: IWeight,
  reps: number,
  rpe?: number,
): IWeight {
  if (reps === 0) {
    return Weight_build(0, weight.unit);
  } else if (reps === 1) {
    return weight;
  } else {
    return Weight_roundTo005(
      Weight_divide(weight, Weight_rpeMultiplier(reps, rpe ?? 10)),
    );
  }
}

export function Weight_getNRepMax(oneRepMax: IWeight, reps: number): IWeight {
  if (reps === 0) {
    return Weight_build(0, oneRepMax.unit);
  } else if (reps === 1) {
    return oneRepMax;
  } else {
    return Weight_roundTo005(
      Weight_multiply(oneRepMax, Weight_rpeMultiplier(reps, 10)),
    );
  }
}

export function Weight_getTrainingMax(
  weight: IWeight,
  reps: number,
  settings: ISettings,
): IWeight {
  return Weight_round(
    Weight_multiply(Weight_getOneRepMax(weight, reps), 0.9),
    settings,
    weight.unit,
  );
}

export function Weight_platesWeight(plates: IPlate[]): IWeight {
  const unit = plates[0]?.weight.unit || "lb";
  return plates.reduce(
    (memo, plate) => Weight_add(memo, Weight_multiply(plate.weight, plate.num)),
    Weight_build(0, unit),
  );
}

export function Weight_formatOneSide(
  settings: ISettings,
  platesArr: IPlate[],
  exerciseType: IExerciseType,
): string {
  const equipmentSettings = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  const plates: IPlate[] = JSON.parse(JSON.stringify(platesArr));
  plates.sort((a, b) => Weight_compareReverse(a.weight, b.weight));
  const arr: number[] = [];
  const multiplier = equipmentSettings?.multiplier ?? 1;
  while (true) {
    const plate = plates.find((p) => p.num >= multiplier);
    if (plate != null) {
      arr.push(plate.weight.value);
      plate.num -= multiplier;
    } else {
      break;
    }
  }

  return CollectionUtils_compressArray(arr, 3).join("/");
}

export function Weight_roundTo005(weight: IWeight): IWeight {
  return Weight_build(MathUtils_roundTo005(weight.value), weight.unit);
}

export function Weight_roundTo000005(weight: IWeight): IWeight {
  return Weight_build(MathUtils_roundTo000005(weight.value), weight.unit);
}

export function Weight_calculatePlates(
  allWeight: IWeight,
  settings: ISettings,
  units: IUnit,
  exerciseType: IExerciseType,
): { plates: IPlate[]; platesWeight: IWeight; totalWeight: IWeight } {
  const equipmentData = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  if (equipmentData == null) {
    const rounding = Exercise_defaultRounding(exerciseType, settings);
    allWeight = Weight_build(
      MathUtils_round(allWeight.value, rounding),
      allWeight.unit,
    );
    return { plates: [], platesWeight: allWeight, totalWeight: allWeight };
  }

  const absAllWeight = Weight_abs(allWeight);
  const inverted = allWeight.value < 0;
  if (equipmentData.isFixed) {
    const fixed = CollectionUtils_sort(
      equipmentData.fixed.filter(
        (w) => w.unit === (equipmentData.unit ?? units),
      ),
      (a, b) => b.value - a.value,
    );
    const weight =
      fixed.find((w) => Weight_lte(w, absAllWeight)) ||
      fixed[fixed.length - 1] ||
      absAllWeight;
    let roundedWeight = Weight_roundTo005(weight);
    roundedWeight = inverted ? Weight_invert(roundedWeight) : roundedWeight;
    return {
      plates: [],
      platesWeight: roundedWeight,
      totalWeight: roundedWeight,
    };
  }
  const availablePlatesArr = equipmentData.plates.filter(
    (p) => p.weight.unit === units,
  );
  const barWeight =
    equipmentData.useBodyweightForBar && settings.currentBodyweight
      ? settings.currentBodyweight
      : equipmentData.bar[units];
  const multiplier = equipmentData.multiplier || 1;
  const isAssisting = equipmentData.isAssisting || false;
  const weight = Weight_roundTo000005(Weight_subtract(absAllWeight, barWeight));
  const availablePlates: IPlate[] = JSON.parse(
    JSON.stringify(availablePlatesArr),
  );
  availablePlates.sort((a, b) => Weight_compareReverse(a.weight, b.weight));
  const plates: IPlate[] = calculatePlatesInternalFast(
    weight,
    availablePlates,
    multiplier,
    isAssisting,
  );
  const total = plates.reduce(
    (memo, plate) => {
      const weightToAdd = Weight_multiply(plate.weight, plate.num);
      return isAssisting
        ? Weight_subtract(memo, weightToAdd)
        : Weight_add(memo, weightToAdd);
    },
    Weight_build(0, allWeight.unit),
  );
  const totalWeight = Weight_roundTo000005(
    inverted
      ? Weight_invert(Weight_add(total, barWeight))
      : Weight_add(total, barWeight),
  );
  const thePlatesWeight = inverted ? Weight_invert(total) : total;
  return { plates, platesWeight: thePlatesWeight, totalWeight };
}

export function Weight_abs(weight: IWeight): IWeight {
  return Weight_build(Math.abs(weight.value), weight.unit);
}

export function Weight_invert(weight: IWeight): IWeight {
  return Weight_build(-weight.value, weight.unit);
}

function calculatePlatesInternalFast(
  weight: IWeight,
  availablePlates: IPlate[],
  multiplier: number,
  isAssisting: boolean,
): IPlate[] {
  const targetValue = isAssisting ? -weight.value : weight.value;
  if (targetValue <= 0) {
    return [];
  }

  const plateTypes: {
    weight: IWeight;
    unitWeight: number;
    maxUnits: number;
  }[] = [];
  for (const p of availablePlates) {
    if (p.num >= multiplier) {
      plateTypes.push({
        weight: p.weight,
        unitWeight: p.weight.value * multiplier,
        maxUnits: Math.floor(p.num / multiplier),
      });
    }
  }
  if (plateTypes.length === 0) {
    return [];
  }

  // Convert to integers for exact arithmetic
  const allValues = [targetValue, ...plateTypes.map((p) => p.unitWeight)];
  let maxDecimals = 0;
  for (const v of allValues) {
    const s = v.toString();
    const dot = s.indexOf(".");
    if (dot >= 0) {
      maxDecimals = Math.max(maxDecimals, s.length - dot - 1);
    }
  }
  const precision = Math.pow(10, Math.min(maxDecimals, 6));
  const intTarget = Math.round(targetValue * precision);
  const intWeights = plateTypes.map((p) =>
    Math.round(p.unitWeight * precision),
  );

  // Max contribution from plates at index i and beyond (for pruning)
  const maxFrom = new Array(plateTypes.length + 1).fill(0);
  for (let i = plateTypes.length - 1; i >= 0; i--) {
    maxFrom[i] = maxFrom[i + 1] + intWeights[i] * plateTypes[i].maxUnits;
  }

  const best = new Array(plateTypes.length).fill(0);
  const current = new Array(plateTypes.length).fill(0);
  let bestRemaining = intTarget + 1;
  let iterations = 0;

  function search(index: number, remaining: number): void {
    if (bestRemaining === 0 || iterations >= 10000) {
      return;
    }
    if (remaining === 0 || index >= plateTypes.length) {
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        for (let i = 0; i < index; i++) {
          best[i] = current[i];
        }
        for (let i = index; i < plateTypes.length; i++) {
          best[i] = 0;
        }
      }
      return;
    }

    iterations += 1;
    const w = intWeights[index];
    const maxCount = Math.min(
      plateTypes[index].maxUnits,
      w > 0 ? Math.floor(remaining / w) : 0,
    );

    for (let count = maxCount; count >= 0; count--) {
      const newRemaining = remaining - count * w;
      if (newRemaining - maxFrom[index + 1] >= bestRemaining) {
        continue;
      }
      current[index] = count;
      search(index + 1, newRemaining);
      if (bestRemaining === 0) {
        return;
      }
    }
  }

  search(0, intTarget);

  const plates: IPlate[] = [];
  for (let i = 0; i < plateTypes.length; i++) {
    if (best[i] > 0) {
      plates.push({ weight: plateTypes[i].weight, num: best[i] * multiplier });
    }
  }
  return plates;
}

export function Weight_add(weight: IWeight, value: IWeight | number): IWeight {
  return Weight_operation(weight, value, (a, b) => a + b);
}

export function Weight_subtract(
  weight: IWeight,
  value: IWeight | number,
): IWeight {
  return Weight_operation(weight, value, (a, b) => a - b);
}

export function Weight_multiply(
  weight: IWeight,
  value: IWeight | number,
): IWeight {
  return Weight_operation(weight, value, (a, b) => a * b);
}

export function Weight_divide(
  weight: IWeight,
  value: IWeight | number,
): IWeight {
  return Weight_operation(weight, value, (a, b) => a / b);
}

export function Weight_gt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a > b);
}

export function Weight_lt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a < b);
}

export function Weight_gte(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a >= b);
}

export function Weight_lte(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a <= b);
}

export function Weight_eqNull(
  weight: IWeight | number | IPercentage | undefined,
  value: IWeight | number | IPercentage | undefined,
): boolean {
  if (weight == null && value == null) {
    return true;
  } else if (weight == null && value != null) {
    return false;
  } else if (weight != null && value == null) {
    return false;
  } else {
    return comparison(weight!, value!, (a, b) => a === b);
  }
}

export function Weight_eq(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a === b);
}

export function Weight_eqeq(weight: IWeight, value: IWeight): boolean {
  return weight.value === value.value && weight.unit === value.unit;
}

export function Weight_max(weights: IWeight[]): IWeight | undefined {
  return CollectionUtils_sort(weights, Weight_compareReverse)[0];
}

export function Weight_roundConvertTo(
  weight: IWeight,
  settings: ISettings,
  unit: IUnit,
  exerciseType?: IExerciseType,
): IWeight {
  return Weight_round(
    Weight_convertTo(weight, unit),
    settings,
    unit,
    exerciseType,
  );
}

export function Weight_type(
  value: number | IWeight | IPercentage,
): "weight" | "percentage" | "number" {
  if (typeof value === "number") {
    return "number";
  } else if (Weight_isPct(value)) {
    return "percentage";
  } else {
    return "weight";
  }
}

export function Weight_convertTo(weight: IWeight, unit: IUnit): IWeight;
export function Weight_convertTo(
  weight: IPercentage,
  unit: "%" | IUnit,
): IPercentage;
export function Weight_convertTo(weight: number, unit: IUnit): number;
export function Weight_convertTo(
  weight: IWeight | number | IPercentage,
  unit: IUnit | "%",
): IWeight | number | IPercentage {
  if (typeof weight === "number") {
    return weight;
  } else if (weight.unit === "%" || unit === "%") {
    return weight;
  } else {
    if (weight.unit === unit) {
      return weight;
    } else if (weight.unit === "kg" && unit === "lb") {
      return Weight_build(Math.round((weight.value * 2.205) / 0.5) * 0.5, unit);
    } else {
      return Weight_build(Math.round(weight.value / 2.205 / 0.5) * 0.5, unit);
    }
  }
}

export function Weight_compare(a: IWeight, b: IWeight): number {
  return a.value - Weight_convertTo(b, a.unit).value;
}

export function Weight_compareReverse(a: IWeight, b: IWeight): number {
  return Weight_convertTo(b, a.unit).value - a.value;
}

function comparison(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
  o: (a: number, b: number) => boolean,
): boolean {
  if (typeof weight === "number" && typeof value === "number") {
    return o(weight, value);
  } else if (typeof weight === "number" && typeof value !== "number") {
    return o(weight, value.value);
  } else if (typeof weight !== "number" && typeof value === "number") {
    return o(weight.value, value);
  } else if (typeof weight !== "number" && typeof value !== "number") {
    if (weight.unit === "%" && value.unit === "%") {
      return o(weight.value, value.value);
    } else if (Weight_is(weight) && Weight_is(value)) {
      return o(weight.value, Weight_convertTo(value, weight.unit).value);
    } else {
      return false;
    }
  } else {
    return false;
  }
}

export function Weight_applyOp(
  onerm: IWeight | undefined,
  oldValue: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
  opr: "+=" | "-=" | "*=" | "/=" | "=",
): IWeight | number | IPercentage {
  if (opr === "=") {
    return value;
  } else if (opr === "+=") {
    return Weight_op(onerm, oldValue, value, (a, b) => a + b);
  } else if (opr === "-=") {
    return Weight_op(onerm, oldValue, value, (a, b) => a - b);
  } else if (opr === "*=") {
    return Weight_op(onerm, oldValue, value, (a, b) =>
      MathUtils_roundTo005(a * b),
    );
  } else {
    return Weight_op(onerm, oldValue, value, (a, b) =>
      MathUtils_roundTo005(a / b),
    );
  }
}

export function Weight_op(
  onerm: IWeight | undefined,
  a: IWeight | number | IPercentage,
  b: IWeight | number | IPercentage,
  o: (x: number, y: number) => number,
): IWeight | number | IPercentage {
  if (typeof a === "number" && typeof b === "number") {
    return o(a, b);
  }
  if (typeof a === "number" && Weight_isPct(b)) {
    return Weight_buildPct(o(a, b.value));
  }
  if (typeof a === "number" && Weight_is(b)) {
    return Weight_operation(a, b, o);
  }

  if (Weight_isPct(a) && typeof b === "number") {
    return Weight_buildPct(o(a.value, b));
  }
  if (Weight_isPct(a) && Weight_isPct(b)) {
    return Weight_buildPct(o(a.value, b.value));
  }
  if (Weight_isPct(a) && Weight_is(b)) {
    const aWeight = onerm
      ? Weight_multiply(onerm, a.value / 100)
      : MathUtils_roundFloat(a.value / 100, 4);
    return Weight_operation(aWeight, b, o);
  }

  if (Weight_is(a) && typeof b === "number") {
    return Weight_operation(a, b, o);
  }
  if (Weight_is(a) && Weight_isPct(b)) {
    const bWeight = onerm
      ? Weight_multiply(onerm, b.value / 100)
      : MathUtils_roundFloat(b.value / 100, 4);
    return Weight_operation(a, bWeight, o);
  }
  if (Weight_is(a) && Weight_is(b)) {
    return Weight_operation(a, b, o);
  }

  throw new Error(`Can't apply operation to ${a} and ${b}`);
}

export function Weight_operation(
  weight: IWeight,
  value: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight;
export function Weight_operation(
  weight: IWeight | number,
  value: IWeight,
  o: (a: number, b: number) => number,
): IWeight;
export function Weight_operation(
  weight: IWeight | number,
  value: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight {
  if (typeof weight === "number" && typeof value !== "number") {
    return Weight_build(o(weight, value.value), value.unit);
  } else if (typeof weight !== "number" && typeof value === "number") {
    return Weight_build(o(weight.value, value), weight.unit);
  } else if (typeof weight !== "number" && typeof value !== "number") {
    return Weight_build(
      o(weight.value, Weight_convertTo(value, weight.unit).value),
      weight.unit,
    );
  } else {
    throw new Error("Weight.operation should never work with numbers only");
  }
}

export function Weight_convertToWeight(
  onerm: IWeight,
  value: IWeight | number | IPercentage,
  unit: IUnit,
): IWeight {
  if (typeof value === "number") {
    return Weight_build(value, unit);
  } else if (Weight_isPct(value)) {
    return Weight_convertTo(
      Weight_multiply(onerm, MathUtils_roundFloat(value.value / 100, 4)),
      unit,
    );
  } else {
    return value;
  }
}

export function Weight_calculateRepMax(
  knownReps: number,
  knownRpe: number,
  knownWeight: number,
  targetReps: number,
  targetRpe: number,
): number {
  const knownRpeMultiplier = Weight_rpeMultiplier(knownReps, knownRpe);
  const onerm = knownWeight / knownRpeMultiplier;
  const targetRpeMultiplier = Weight_rpeMultiplier(targetReps, targetRpe);
  return Math.round(onerm * targetRpeMultiplier);
}

export function Weight_rpeMultiplier(reps: number, rpe: number): number {
  if (reps === 1 && rpe === 10) {
    return 1;
  }
  reps = Math.max(Math.min(reps, 24), 1);
  rpe = Math.max(Math.min(rpe, 10), 1);

  const x = 10.0 - rpe + (reps - 1);
  if (x >= 16) {
    return 0.5;
  }
  // The formula is taken from
  // https://gitlab.com/openpowerlifting/plsource/-/blob/ba5194be6daa08d082bb1b7959d6f47b82e7802c/static/rpe-calc/index.html#L224
  const intersection = 2.92;
  if (x <= intersection) {
    const a = 0.347619;
    const b = -4.60714;
    const c = 99.9667;
    return (a * x * x + b * x + c) / 100;
  } else {
    const m = -2.64249;
    const b = 97.0955;
    return (m * x + b) / 100;
  }
}

export const Weight_zero: IWeight = { value: 0, unit: "lb" } as const;

// --- end weight

export function Equipment_build(name: string): IEquipmentData {
  return {
    vtype: "equipment_data",
    name,
    multiplier: 1,
    bar: {
      lb: Weight_build(0, "lb"),
      kg: Weight_build(0, "kg"),
    },
    plates: [
      { weight: Weight_build(10, "lb"), num: 4 },
      { weight: Weight_build(5, "kg"), num: 4 },
    ],
    fixed: [],
    isFixed: false,
  };
}

export function Equipment_getEquipmentOfGym(
  settings: ISettings,
  key?: string,
): IAllEquipment {
  const firstEquipment = settings.gyms[0].equipment;
  if (key != null) {
    return settings.gyms.find((g) => g.id === key)?.equipment ?? firstEquipment;
  } else {
    return firstEquipment;
  }
}

export function Equipment_getGymByIdOrCurrent(
  settings: ISettings,
  gymId?: string,
): IGym {
  return (
    settings.gyms.find((g) => g.id === (gymId ?? settings.currentGymId)) ??
    settings.gyms[0]
  );
}

export function Equipment_getCurrentGym(settings: ISettings): IGym {
  return (
    settings.gyms.find((g) => g.id === settings.currentGymId) ??
    settings.gyms[0]
  );
}

export function Equipment_getEquipmentIdForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
  gymId?: string,
): string | undefined {
  if (exerciseType == null) {
    return undefined;
  }

  const key = Exercise_toKey(exerciseType);
  if (
    !(
      settings.exerciseData[key] &&
      ("equipment" in settings.exerciseData[key] ||
        "rounding" in settings.exerciseData[key])
    )
  ) {
    return exerciseType.equipment;
  }
  const exerciseData = settings.exerciseData[key];
  const exerciseEquipment = exerciseData?.equipment;
  if (exerciseEquipment == null) {
    return undefined;
  }

  const currentGym = Equipment_getGymByIdOrCurrent(settings, gymId);
  return exerciseEquipment[currentGym.id];
}

export function Equipment_getEquipmentNameForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): string | undefined {
  const equipment = Equipment_getEquipmentIdForExerciseType(
    settings,
    exerciseType,
  );
  if (equipment == null) {
    return undefined;
  }
  const currentGym = Equipment_getCurrentGym(settings);
  const gymEquipment = currentGym.equipment[equipment];
  if (gymEquipment == null || gymEquipment.isDeleted) {
    return undefined;
  }
  const name = gymEquipment.name;
  return name || equipmentName(equipment);
}

export function Equipment_getEquipmentDataForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IEquipmentData | undefined {
  const equipment = Equipment_getEquipmentIdForExerciseType(
    settings,
    exerciseType,
  );
  const currentGym = Equipment_getCurrentGym(settings);
  return equipment ? currentGym.equipment[equipment] : undefined;
}

export function Equipment_getUnitOrDefaultForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IUnit {
  const equipment = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  return equipment?.unit ?? settings.units;
}

export function Equipment_getUnitForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IUnit | undefined {
  const equipment = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  const equipmentUnit = equipment?.unit;
  return equipmentUnit == null || equipmentUnit === settings.units
    ? undefined
    : equipmentUnit;
}

export function Equipment_getEquipmentData(
  settings: ISettings,
  key: string,
): IEquipmentData | undefined {
  return Equipment_currentEquipment(settings)?.[key];
}

export function Equipment_currentEquipment(settings: ISettings): IAllEquipment {
  const currentGym =
    settings.gyms.find((g) => g.id === settings.currentGymId) ??
    settings.gyms[0];
  return currentGym?.equipment;
}

export function Equipment_smallestPlate(
  equipmentData: IEquipmentData,
  unit: IUnit,
): IWeight {
  return (
    CollectionUtils_sort(
      equipmentData.plates.filter((p) => p.weight.unit === unit),
      (a, b) => Weight_compare(a.weight, b.weight),
    )[0]?.weight || Weight_build(1, unit)
  );
}

export function Equipment_mergeEquipment(
  oldEquipment: { [key in IEquipment]?: IEquipmentData },
  newEquipment: { [key in IEquipment]?: IEquipmentData },
): { [key in IEquipment]?: IEquipmentData } {
  const newKeys = Array.from(
    new Set([
      ...ObjectUtils_keys(newEquipment),
      ...ObjectUtils_keys(oldEquipment),
    ]),
  );
  return newKeys.reduce<{ [key in IEquipment]?: IEquipmentData }>(
    (acc, name) => {
      const newEquipmentData = newEquipment[name];
      const oldEquipmentData = oldEquipment[name];
      if (newEquipmentData != null && oldEquipmentData == null) {
        acc[name] = newEquipmentData;
      } else if (newEquipmentData == null && oldEquipmentData != null) {
        acc[name] = oldEquipmentData;
      } else if (newEquipmentData != null && oldEquipmentData != null) {
        acc[name] = {
          ...oldEquipmentData,
          bar: newEquipmentData.bar,
          isFixed: newEquipmentData.isFixed,
          plates: CollectionUtils_concatBy(
            oldEquipmentData.plates,
            newEquipmentData.plates,
            (el) => `${el.weight.value}${el.weight.unit}`,
          ),
          multiplier: newEquipmentData.multiplier,
          fixed: CollectionUtils_concatBy(
            oldEquipmentData.fixed,
            newEquipmentData.fixed,
            (el) => `${el.value}${el.unit}`,
          ),
        };
      }
      return acc;
    },
    {},
  );
}

export function Equipment_isBuiltIn(key: string): boolean {
  return (equipments as unknown as string[]).indexOf(key) !== -1;
}

export function Equipment_customEquipment(
  equipmentSettings?: IAllEquipment,
): IAllEquipment {
  return ObjectUtils_filter(
    equipmentSettings || {},
    (key) => !Equipment_isBuiltIn(key),
  );
}

export function Equipment_equipmentKeyByName(
  name: string,
  equipmentSettings?: IAllEquipment,
): string | undefined {
  const builtInEquipmentKey = equipments.find(
    (eq) => eq === name.toLowerCase(),
  );
  if (builtInEquipmentKey) {
    return builtInEquipmentKey;
  }

  const builtInEquipmentName = equipments.find(
    (eq) => equipmentName(eq).toLowerCase() === name.toLowerCase(),
  );
  if (builtInEquipmentName) {
    return builtInEquipmentName;
  }

  const customEquipmentKey = ObjectUtils_keys(equipmentSettings || {}).find(
    (eq) => {
      return equipmentName(eq).toLowerCase() === name.toLowerCase();
    },
  );
  return customEquipmentKey;
}

// -- end equipment

export const allExercisesList: Record<IExerciseId, IExercise> = {
  abWheel: {
    id: "abWheel",
    name: "Ab Wheel",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  arnoldPress: {
    id: "arnoldPress",
    name: "Arnold Press",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  aroundTheWorld: {
    id: "aroundTheWorld",
    name: "Around The World",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["core"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  backExtension: {
    id: "backExtension",
    name: "Back Extension",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "core"],
    startingWeightLb: { value: 50, unit: "lb" },
    startingWeightKg: { value: 22.5, unit: "kg" },
  },
  ballSlams: {
    id: "ballSlams",
    name: "Ball Slams",
    defaultEquipment: "medicineball",
    types: ["core", "upper"],
    startingWeightLb: { value: 10, unit: "lb" },
    startingWeightKg: { value: 4.5, unit: "kg" },
  },
  battleRopes: {
    id: "battleRopes",
    name: "Battle Ropes",
    defaultEquipment: "bodyweight",
    types: ["upper", "core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  behindTheNeckPress: {
    id: "behindTheNeckPress",
    name: "Behind The Neck Press",
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  benchDip: {
    id: "benchDip",
    name: "Bench Dip",
    defaultEquipment: "bodyweight",
    types: ["upper", "push"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  benchPress: {
    id: "benchPress",
    name: "Bench Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 135, unit: "lb" },
    startingWeightKg: { value: 60, unit: "kg" },
  },
  benchPressCloseGrip: {
    id: "benchPressCloseGrip",
    name: "Bench Press Close Grip",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 115, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  benchPressWideGrip: {
    id: "benchPressWideGrip",
    name: "Bench Press Wide Grip",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 135, unit: "lb" },
    startingWeightKg: { value: 60, unit: "kg" },
  },
  bentOverOneArmRow: {
    id: "bentOverOneArmRow",
    name: "Bent Over One Arm Row",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  bentOverRow: {
    id: "bentOverRow",
    name: "Bent Over Row",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  bicepCurl: {
    id: "bicepCurl",
    name: "Bicep Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  bicycleCrunch: {
    id: "bicycleCrunch",
    name: "Bicycle Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  boxJump: {
    id: "boxJump",
    name: "Box Jump",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  boxSquat: {
    id: "boxSquat",
    name: "Box Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 155, unit: "lb" },
    startingWeightKg: { value: 70, unit: "kg" },
  },
  bulgarianSplitSquat: {
    id: "bulgarianSplitSquat",
    name: "Bulgarian Split Squat",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  burpee: {
    id: "burpee",
    name: "Burpee",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "lower", "core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  cableCrossover: {
    id: "cableCrossover",
    name: "Cable Crossover",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  cableCrunch: {
    id: "cableCrunch",
    name: "Cable Crunch",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["core"],
    startingWeightLb: { value: 50, unit: "lb" },
    startingWeightKg: { value: 22.5, unit: "kg" },
  },
  cableKickback: {
    id: "cableKickback",
    name: "Cable Kickback",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "push"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  cablePullThrough: {
    id: "cablePullThrough",
    name: "Cable Pull Through",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["lower", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  cableTwist: {
    id: "cableTwist",
    name: "Cable Twist",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["core"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  calfPressOnLegPress: {
    id: "calfPressOnLegPress",
    name: "Calf Press on Leg Press",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 150, unit: "lb" },
    startingWeightKg: { value: 67.5, unit: "kg" },
  },
  calfPressOnSeatedLegPress: {
    id: "calfPressOnSeatedLegPress",
    name: "Calf Press on Seated Leg Press",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 120, unit: "lb" },
    startingWeightKg: { value: 53.75, unit: "kg" },
  },
  chestDip: {
    id: "chestDip",
    name: "Chest Dip",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "push"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  chestFly: {
    id: "chestFly",
    name: "Chest Fly",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  chestPress: {
    id: "chestPress",
    name: "Chest Press",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  chestSupportedRow: {
    id: "chestSupportedRow",
    name: "Chest-Supported Row",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 85, unit: "lb" },
    startingWeightKg: { value: 37.5, unit: "kg" },
  },
  chinUp: {
    id: "chinUp",
    name: "Chin Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  clean: {
    id: "clean",
    name: "Clean",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "push"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  cleanandJerk: {
    id: "cleanandJerk",
    name: "Clean and Jerk",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "push"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  concentrationCurl: {
    id: "concentrationCurl",
    name: "Concentration Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  crossBodyCrunch: {
    id: "crossBodyCrunch",
    name: "Cross Body Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  crunch: {
    id: "crunch",
    name: "Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  cycling: {
    id: "cycling",
    name: "Cycling",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  deadlift: {
    id: "deadlift",
    name: "Deadlift",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["lower", "pull"],
    startingWeightLb: { value: 185, unit: "lb" },
    startingWeightKg: { value: 82.5, unit: "kg" },
  },
  deadliftHighPull: {
    id: "deadliftHighPull",
    name: "Deadlift High Pull",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 75, unit: "lb" },
    startingWeightKg: { value: 32.5, unit: "kg" },
  },
  declineBenchPress: {
    id: "declineBenchPress",
    name: "Decline Bench Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 125, unit: "lb" },
    startingWeightKg: { value: 55, unit: "kg" },
  },
  declineCrunch: {
    id: "declineCrunch",
    name: "Decline Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  deficitDeadlift: {
    id: "deficitDeadlift",
    name: "Deficit Deadlift",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["lower", "pull"],
    startingWeightLb: { value: 165, unit: "lb" },
    startingWeightKg: { value: 75, unit: "kg" },
  },
  ellipticalMachine: {
    id: "ellipticalMachine",
    name: "Elliptical Machine",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  facePull: {
    id: "facePull",
    name: "Face Pull",
    defaultWarmup: 10,
    defaultEquipment: "band",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  flatKneeRaise: {
    id: "flatKneeRaise",
    name: "Flat Knee Raise",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  flatLegRaise: {
    id: "flatLegRaise",
    name: "Flat Leg Raise",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  frontRaise: {
    id: "frontRaise",
    name: "Front Raise",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  frontSquat: {
    id: "frontSquat",
    name: "Front Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  gobletSquat: {
    id: "gobletSquat",
    name: "Goblet Squat",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 15, unit: "kg" },
  },
  goodMorning: {
    id: "goodMorning",
    name: "Good Morning",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  gluteBridge: {
    id: "gluteBridge",
    name: "Glute Bridge",
    defaultWarmup: 45,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 15, unit: "kg" },
  },
  gluteBridgeMarch: {
    id: "gluteBridgeMarch",
    name: "Glute Bridge March",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  gluteKickback: {
    id: "gluteKickback",
    name: "Glute Kickback",
    defaultWarmup: 45,
    defaultEquipment: "cable",
    types: ["lower", "legs"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 15, unit: "kg" },
  },
  hackSquat: {
    id: "hackSquat",
    name: "Hack Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 115, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  hammerCurl: {
    id: "hammerCurl",
    name: "Hammer Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  handstandPushUp: {
    id: "handstandPushUp",
    name: "Handstand Push Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "push"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  hangClean: {
    id: "hangClean",
    name: "Hang Clean",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 85, unit: "lb" },
    startingWeightKg: { value: 37.5, unit: "kg" },
  },
  hangSnatch: {
    id: "hangSnatch",
    name: "Hang Snatch",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  hangingLegRaise: {
    id: "hangingLegRaise",
    name: "Hanging Leg Raise",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  highKneeSkips: {
    id: "highKneeSkips",
    name: "High Knee Skips",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  highRow: {
    id: "highRow",
    name: "High Row",
    defaultWarmup: 45,
    defaultEquipment: "leverageMachine",
    types: ["upper", "pull"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  hipAbductor: {
    id: "hipAbductor",
    name: "Hip Abductor",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  hipAdductor: {
    id: "hipAdductor",
    name: "Hip Adductor",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  hipThrust: {
    id: "hipThrust",
    name: "Hip Thrust",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  inclineBenchPress: {
    id: "inclineBenchPress",
    name: "Incline Bench Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 115, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  inclineBenchPressWideGrip: {
    id: "inclineBenchPressWideGrip",
    name: "Incline Bench Press Wide Grip",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 110, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  inclineChestFly: {
    id: "inclineChestFly",
    name: "Incline Chest Fly",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  inclineChestPress: {
    id: "inclineChestPress",
    name: "Incline Chest Press",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  inclineCurl: {
    id: "inclineCurl",
    name: "Incline Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  inclineRow: {
    id: "inclineRow",
    name: "Incline Row",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  invertedRow: {
    id: "invertedRow",
    name: "Inverted Row",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  isoLateralChestPress: {
    id: "isoLateralChestPress",
    name: "Iso-Lateral Chest Press",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  isoLateralRow: {
    id: "isoLateralRow",
    name: "Iso-Lateral Row",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  jackknifeSitUp: {
    id: "jackknifeSitUp",
    name: "Jackknife Sit Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  jumpRope: {
    id: "jumpRope",
    name: "Jump Rope",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  jumpSquat: {
    id: "jumpSquat",
    name: "Jump Squat",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  jumpingJack: {
    id: "jumpingJack",
    name: "Jumping Jack",
    defaultWarmup: 10,
    defaultEquipment: undefined,
    types: ["upper", "lower"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  kettlebellSwing: {
    id: "kettlebellSwing",
    name: "Kettlebell Swing",
    defaultWarmup: 10,
    defaultEquipment: "kettlebell",
    types: ["upper", "lower", "core"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 16, unit: "kg" },
  },
  kettlebellTurkishGetUp: {
    id: "kettlebellTurkishGetUp",
    name: "Kettlebell Turkish Get Up",
    defaultWarmup: 10,
    defaultEquipment: "kettlebell",
    types: ["upper", "lower", "core"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 8, unit: "kg" },
  },
  kippingPullUp: {
    id: "kippingPullUp",
    name: "Kipping Pull Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  kneeRaise: {
    id: "kneeRaise",
    name: "Knee Raise",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  kneelingPulldown: {
    id: "kneelingPulldown",
    name: "Kneeling Pulldown",
    defaultWarmup: 10,
    defaultEquipment: "band",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  kneestoElbows: {
    id: "kneestoElbows",
    name: "Knees to Elbows",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  latPulldown: {
    id: "latPulldown",
    name: "Lat Pulldown",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  lateralBoxJump: {
    id: "lateralBoxJump",
    name: "Lateral Box Jump",
    defaultWarmup: 10,
    defaultEquipment: undefined,
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  lateralRaise: {
    id: "lateralRaise",
    name: "Lateral Raise",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  legsUpBenchPress: {
    id: "legsUpBenchPress",
    name: "Legs Up Bench Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 135, unit: "lb" },
    startingWeightKg: { value: 60, unit: "kg" },
  },
  legCurl: {
    id: "legCurl",
    name: "Leg Curl",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  legExtension: {
    id: "legExtension",
    name: "Leg Extension",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  legPress: {
    id: "legPress",
    name: "Leg Press",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 250, unit: "lb" },
    startingWeightKg: { value: 112.5, unit: "kg" },
  },
  lunge: {
    id: "lunge",
    name: "Lunge",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 75, unit: "lb" },
    startingWeightKg: { value: 32.5, unit: "kg" },
  },
  lyingBicepCurl: {
    id: "lyingBicepCurl",
    name: "Lying Bicep Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  lyingLegCurl: {
    id: "lyingLegCurl",
    name: "Lying Leg Curl",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  mountainClimber: {
    id: "mountainClimber",
    name: "Mountain Climber",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core", "lower"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  muscleUp: {
    id: "muscleUp",
    name: "Muscle Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  obliqueCrunch: {
    id: "obliqueCrunch",
    name: "Oblique Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  overheadPress: {
    id: "overheadPress",
    name: "Overhead Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 75, unit: "lb" },
    startingWeightKg: { value: 32.5, unit: "kg" },
  },
  overheadSquat: {
    id: "overheadSquat",
    name: "Overhead Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 55, unit: "lb" },
    startingWeightKg: { value: 25, unit: "kg" },
  },
  pecDeck: {
    id: "pecDeck",
    name: "Pec Deck",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["upper", "push"],
    startingWeightLb: { value: 50, unit: "lb" },
    startingWeightKg: { value: 22.5, unit: "kg" },
  },
  pendlayRow: {
    id: "pendlayRow",
    name: "Pendlay Row",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  pistolSquat: {
    id: "pistolSquat",
    name: "Pistol Squat",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  plank: {
    id: "plank",
    name: "Plank",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  powerClean: {
    id: "powerClean",
    name: "Power Clean",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  powerSnatch: {
    id: "powerSnatch",
    name: "Power Snatch",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  preacherCurl: {
    id: "preacherCurl",
    name: "Preacher Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  pressUnder: {
    id: "pressUnder",
    name: "Press Under",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  pullUp: {
    id: "pullUp",
    name: "Pull Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  pullover: {
    id: "pullover",
    name: "Pullover",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  pushPress: {
    id: "pushPress",
    name: "Push Press",
    defaultWarmup: 45,
    defaultEquipment: "kettlebell",
    types: ["upper", "push"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 16, unit: "kg" },
  },
  pushUp: {
    id: "pushUp",
    name: "Push Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "push"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  reverseCrunch: {
    id: "reverseCrunch",
    name: "Reverse Crunch",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  reverseCurl: {
    id: "reverseCurl",
    name: "Reverse Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  reverseFly: {
    id: "reverseFly",
    name: "Reverse Fly",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  reverseGripConcentrationCurl: {
    id: "reverseGripConcentrationCurl",
    name: "Reverse Grip Concentration Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  reversePlank: {
    id: "reversePlank",
    name: "Reverse Plank",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  reverseLatPulldown: {
    id: "reverseLatPulldown",
    name: "Reverse Lat Pulldown",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  reverseLunge: {
    id: "reverseLunge",
    name: "Reverse Lunge",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  reverseWristCurl: {
    id: "reverseWristCurl",
    name: "Reverse Wrist Curl",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  romanianDeadlift: {
    id: "romanianDeadlift",
    name: "Romanian Deadlift",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 40, unit: "lb" },
    startingWeightKg: { value: 17.5, unit: "kg" },
  },
  reverseHyperextension: {
    id: "reverseHyperextension",
    name: "Reverse Hyperextension",
    defaultWarmup: 45,
    defaultEquipment: "band",
    types: ["core", "lower"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  rowing: {
    id: "rowing",
    name: "Rowing",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  russianTwist: {
    id: "russianTwist",
    name: "Russian Twist",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  safetySquatBarSquat: {
    id: "safetySquatBarSquat",
    name: "Safety Squat Bar Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 145, unit: "lb" },
    startingWeightKg: { value: 65, unit: "kg" },
  },
  seatedCalfRaise: {
    id: "seatedCalfRaise",
    name: "Seated Calf Raise",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 90, unit: "lb" },
    startingWeightKg: { value: 40, unit: "kg" },
  },
  seatedFrontRaise: {
    id: "seatedFrontRaise",
    name: "Seated Front Raise",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  seatedLegCurl: {
    id: "seatedLegCurl",
    name: "Seated Leg Curl",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 60, unit: "lb" },
    startingWeightKg: { value: 26.25, unit: "kg" },
  },
  seatedLegPress: {
    id: "seatedLegPress",
    name: "Seated Leg Press",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["lower", "legs"],
    startingWeightLb: { value: 200, unit: "lb" },
    startingWeightKg: { value: 90, unit: "kg" },
  },
  seatedOverheadPress: {
    id: "seatedOverheadPress",
    name: "Seated Overhead Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 75, unit: "lb" },
    startingWeightKg: { value: 32.5, unit: "kg" },
  },
  seatedPalmsUpWristCurl: {
    id: "seatedPalmsUpWristCurl",
    name: "Seated Palms Up Wrist Curl",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 15, unit: "lb" },
    startingWeightKg: { value: 5, unit: "kg" },
  },
  seatedRow: {
    id: "seatedRow",
    name: "Seated Row",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  seatedWideGripRow: {
    id: "seatedWideGripRow",
    name: "Seated Wide Grip Row",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  shoulderPress: {
    id: "shoulderPress",
    name: "Shoulder Press",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  shoulderPressParallelGrip: {
    id: "shoulderPressParallelGrip",
    name: "Shoulder Press Parallel Grip",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  shrug: {
    id: "shrug",
    name: "Shrug",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 45, unit: "lb" },
    startingWeightKg: { value: 20, unit: "kg" },
  },
  sideBend: {
    id: "sideBend",
    name: "Side Bend",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["core"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  sideCrunch: {
    id: "sideCrunch",
    name: "Side Crunch",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  sideHipAbductor: {
    id: "sideHipAbductor",
    name: "Side Hip Abductor",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  sideLyingClam: {
    id: "sideLyingClam",
    name: "Side Lying Clam",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  sidePlank: {
    id: "sidePlank",
    name: "Side Plank",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  singleLegBridge: {
    id: "singleLegBridge",
    name: "Single Leg Bridge",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  singleLegCalfRaise: {
    id: "singleLegCalfRaise",
    name: "Single Leg Calf Raise",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 85, unit: "lb" },
    startingWeightKg: { value: 37.5, unit: "kg" },
  },
  singleLegDeadlift: {
    id: "singleLegDeadlift",
    name: "Single Leg Deadlift",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  singleLegGluteBridgeBench: {
    id: "singleLegGluteBridgeBench",
    name: "Single Leg Glute Bridge On Bench",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  singleLegGluteBridgeStraight: {
    id: "singleLegGluteBridgeStraight",
    name: "Single Leg Glute Bridge Straight Leg",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  singleLegGluteBridgeBentKnee: {
    id: "singleLegGluteBridgeBentKnee",
    name: "Single Leg Glute Bridge Bent Knee",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  singleLegHipThrust: {
    id: "singleLegHipThrust",
    name: "Single Leg Hip Thrust",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  sissySquat: {
    id: "sissySquat",
    name: "Sissy Squat",
    defaultWarmup: 45,
    defaultEquipment: "bodyweight",
    types: ["lower", "legs"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  sitUp: {
    id: "sitUp",
    name: "Sit Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  skullcrusher: {
    id: "skullcrusher",
    name: "Skullcrusher",
    defaultWarmup: 10,
    defaultEquipment: "ezbar",
    types: ["upper", "push"],
    startingWeightLb: { value: 45, unit: "lb" },
    startingWeightKg: { value: 20, unit: "kg" },
  },
  slingShotBenchPress: {
    id: "slingShotBenchPress",
    name: "Sling Shot Bench Press",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 140, unit: "lb" },
    startingWeightKg: { value: 62.5, unit: "kg" },
  },
  snatch: {
    id: "snatch",
    name: "Snatch",
    defaultWarmup: 45,
    defaultEquipment: "dumbbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  snatchPull: {
    id: "snatchPull",
    name: "Snatch Pull",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 85, unit: "lb" },
    startingWeightKg: { value: 37.5, unit: "kg" },
  },
  splitSquat: {
    id: "splitSquat",
    name: "Split Squat",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  splitJerk: {
    id: "splitJerk",
    name: "Split Jerk",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "push"],
    startingWeightLb: { value: 95, unit: "lb" },
    startingWeightKg: { value: 42.5, unit: "kg" },
  },
  squat: {
    id: "squat",
    name: "Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 135, unit: "lb" },
    startingWeightKg: { value: 60, unit: "kg" },
  },
  squatRow: {
    id: "squatRow",
    name: "Squat Row",
    defaultWarmup: 10,
    defaultEquipment: "band",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  standingCalfRaise: {
    id: "standingCalfRaise",
    name: "Standing Calf Raise",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 35, unit: "lb" },
    startingWeightKg: { value: 15, unit: "kg" },
  },
  standingRow: {
    id: "standingRow",
    name: "Standing Row",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  standingRowCloseGrip: {
    id: "standingRowCloseGrip",
    name: "Standing Row Close Grip",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  standingRowRearDeltWithRope: {
    id: "standingRowRearDeltWithRope",
    name: "Standing Row Rear Delt With Rope",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  standingRowRearHorizontalDeltWithRope: {
    id: "standingRowRearHorizontalDeltWithRope",
    name: "Standing Row Rear Delt, Horizontal, With Rope",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 30, unit: "lb" },
    startingWeightKg: { value: 12.5, unit: "kg" },
  },
  standingRowVBar: {
    id: "standingRowVBar",
    name: "Standing Row V-Bar",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "pull"],
    startingWeightLb: { value: 70, unit: "lb" },
    startingWeightKg: { value: 30, unit: "kg" },
  },
  stepUp: {
    id: "stepUp",
    name: "Step up",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  stiffLegDeadlift: {
    id: "stiffLegDeadlift",
    name: "Stiff Leg Deadlift",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 115, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  straightLegDeadlift: {
    id: "straightLegDeadlift",
    name: "Straight Leg Deadlift",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 110, unit: "lb" },
    startingWeightKg: { value: 50, unit: "kg" },
  },
  sumoDeadlift: {
    id: "sumoDeadlift",
    name: "Sumo Deadlift",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 175, unit: "lb" },
    startingWeightKg: { value: 77.5, unit: "kg" },
  },
  sumoDeadliftHighPull: {
    id: "sumoDeadliftHighPull",
    name: "Sumo Deadlift High Pull",
    defaultWarmup: 95,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "pull"],
    startingWeightLb: { value: 85, unit: "lb" },
    startingWeightKg: { value: 37.5, unit: "kg" },
  },
  superman: {
    id: "superman",
    name: "Superman",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  tBarRow: {
    id: "tBarRow",
    name: "T Bar Row",
    defaultWarmup: 10,
    defaultEquipment: "leverageMachine",
    types: ["upper", "pull"],
    startingWeightLb: { value: 90, unit: "lb" },
    startingWeightKg: { value: 40, unit: "kg" },
  },
  thruster: {
    id: "thruster",
    name: "Thruster",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["upper", "lower", "push"],
    startingWeightLb: { value: 65, unit: "lb" },
    startingWeightKg: { value: 27.5, unit: "kg" },
  },
  toesToBar: {
    id: "toesToBar",
    name: "Toes To Bar",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  torsoRotation: {
    id: "torsoRotation",
    name: "Torso Rotation",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  trapBarDeadlift: {
    id: "trapBarDeadlift",
    name: "Trap Bar Deadlift",
    defaultWarmup: 10,
    defaultEquipment: "trapbar",
    types: ["lower", "legs"],
    startingWeightLb: { value: 185, unit: "lb" },
    startingWeightKg: { value: 82.5, unit: "kg" },
  },
  tricepsDip: {
    id: "tricepsDip",
    name: "Triceps Dip",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "push"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  tricepsExtension: {
    id: "tricepsExtension",
    name: "Triceps Extension",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "push"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  tricepsPushdown: {
    id: "tricepsPushdown",
    name: "Triceps Pushdown",
    defaultWarmup: 10,
    defaultEquipment: "cable",
    types: ["upper", "push"],
    startingWeightLb: { value: 40, unit: "lb" },
    startingWeightKg: { value: 17.5, unit: "kg" },
  },
  uprightRow: {
    id: "uprightRow",
    name: "Upright Row",
    defaultWarmup: 10,
    defaultEquipment: "dumbbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 20, unit: "lb" },
    startingWeightKg: { value: 7.5, unit: "kg" },
  },
  vUp: {
    id: "vUp",
    name: "V Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["core"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  widePullUp: {
    id: "widePullUp",
    name: "Wide Pull Up",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  wristCurl: {
    id: "wristCurl",
    name: "Wrist Curl",
    defaultWarmup: 10,
    defaultEquipment: "barbell",
    types: ["upper", "pull"],
    startingWeightLb: { value: 25, unit: "lb" },
    startingWeightKg: { value: 10, unit: "kg" },
  },
  wristRoller: {
    id: "wristRoller",
    name: "Wrist Roller",
    defaultWarmup: 10,
    defaultEquipment: "bodyweight",
    types: ["upper", "pull"],
    startingWeightLb: { value: 0, unit: "lb" },
    startingWeightKg: { value: 0, unit: "kg" },
  },
  zercherSquat: {
    id: "zercherSquat",
    name: "Zercher Squat",
    defaultWarmup: 45,
    defaultEquipment: "barbell",
    types: ["lower", "legs"],
    startingWeightLb: { value: 105, unit: "lb" },
    startingWeightKg: { value: 47.5, unit: "kg" },
  },
};

const nameToIdMapping = ObjectUtils_keys(allExercisesList).reduce<
  Partial<Record<string, IExerciseId>>
>((acc, key) => {
  acc[allExercisesList[key].name.toLowerCase()] = allExercisesList[key].id;
  return acc;
}, {});

export const metadata: Record<IExerciseId, IMetaExercises> = {
  abWheel: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Deltoid Posterior",
      "Latissimus Dorsi",
      "Pectineous",
      "Pectoralis Major Sternal Head",
      "Sartorius",
      "Serratus Anterior",
      "Tensor Fasciae Latae",
      "Teres Major",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["bodyweight"],
  },
  arnoldPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["dumbbell", "kettlebell"],
  },
  aroundTheWorld: {
    targetMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
    ],
    synergistMuscles: [
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Latissimus Dorsi",
      "Serratus Anterior",
    ],
    bodyParts: ["Chest", "Shoulders"],
    sortedEquipment: ["dumbbell"],
  },
  backExtension: {
    targetMuscles: ["Erector Spinae"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight", "leverageMachine"],
  },
  ballSlams: {
    targetMuscles: [
      "Infraspinatus",
      "Latissimus Dorsi",
      "Teres Major",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Rectus Abdominis",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["medicineball"],
  },
  battleRopes: {
    targetMuscles: ["Deltoid Posterior"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Lateral",
      "Infraspinatus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["bodyweight"],
  },
  behindTheNeckPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell"],
  },
  benchDip: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Latissimus Dorsi",
      "Levator Scapulae",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
      "Serratus Anterior",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["bodyweight"],
  },
  benchPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: [
      "barbell",
      "cable",
      "dumbbell",
      "smith",
      "band",
      "kettlebell",
    ],
  },
  benchPressCloseGrip: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["barbell", "ezbar", "smith"],
  },
  benchPressWideGrip: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell", "smith"],
  },
  bentOverOneArmRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Major",
      "Teres Minor",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["dumbbell"],
  },
  bentOverRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: [
      "barbell",
      "cable",
      "dumbbell",
      "band",
      "leverageMachine",
      "smith",
    ],
  },
  bicepCurl: {
    targetMuscles: ["Biceps Brachii"],
    synergistMuscles: ["Brachialis", "Brachioradialis"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: [
      "barbell",
      "dumbbell",
      "band",
      "leverageMachine",
      "cable",
      "ezbar",
    ],
  },
  bicycleCrunch: {
    targetMuscles: ["Obliques", "Rectus Abdominis"],
    synergistMuscles: ["Gluteus Maximus", "Iliopsoas", "Quadriceps"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  boxJump: {
    targetMuscles: ["Quadriceps", "Gluteus Maximus", "Gastrocnemius", "Soleus"],
    synergistMuscles: [
      "Hamstrings",
      "Adductor Magnus",
      "Erector Spinae",
      "Rectus Abdominis",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  boxSquat: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  bulgarianSplitSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Hips", "Thighs"],
    sortedEquipment: ["dumbbell"],
  },
  burpee: {
    targetMuscles: [
      "Quadriceps",
      "Gluteus Maximus",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
      "Triceps Brachii",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Rectus Abdominis",
    ],
    synergistMuscles: [
      "Hamstrings",
      "Biceps Brachii",
      "Brachialis",
      "Latissimus Dorsi",
      "Obliques",
      "Erector Spinae",
      "Obliques",
      "Soleus",
      "Gastrocnemius",
      "Tibialis Anterior",
    ],
    bodyParts: ["Chest", "Shoulders", "Upper Arms", "Waist", "Thighs"],
    sortedEquipment: ["bodyweight"],
  },
  cableCrossover: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Latissimus Dorsi",
      "Levator Scapulae",
      "Pectoralis Major Clavicular Head",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["cable"],
  },
  cableCrunch: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: ["Obliques"],
    bodyParts: ["Waist"],
    sortedEquipment: ["cable"],
  },
  cableKickback: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["cable"],
  },
  cablePullThrough: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["cable"],
  },
  cableTwist: {
    targetMuscles: ["Obliques"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Adductor Magnus",
      "Erector Spinae",
      "Gluteus Medius",
      "Iliopsoas",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: [
      "barbell",
      "bodyweight",
      "cable",
      "leverageMachine",
      "band",
    ],
  },
  calfPressOnLegPress: {
    targetMuscles: ["Gastrocnemius"],
    synergistMuscles: ["Soleus"],
    bodyParts: ["Calves"],
    sortedEquipment: ["leverageMachine"],
  },
  calfPressOnSeatedLegPress: {
    targetMuscles: ["Gastrocnemius"],
    synergistMuscles: ["Soleus"],
    bodyParts: ["Calves"],
    sortedEquipment: ["leverageMachine"],
  },
  chestDip: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Latissimus Dorsi",
      "Levator Scapulae",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Teres Major",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["bodyweight"],
  },
  chestFly: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Biceps Brachii",
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "leverageMachine"],
  },
  chestPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["leverageMachine", "band"],
  },
  chestSupportedRow: {
    targetMuscles: ["Trapezius Lower Fibers", "Trapezius Middle Fibers"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Latissimus Dorsi",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  chinUp: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Levator Scapulae",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["leverageMachine", "bodyweight"],
  },
  clean: {
    targetMuscles: [
      "Gluteus Maximus",
      "Hamstrings",
      "Quadriceps",
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Deltoid Anterior",
      "Deltoid Lateral",
    ],
    synergistMuscles: [
      "Adductor Magnus",
      "Gastrocnemius",
      "Soleus",
      "Erector Spinae",
      "Biceps Brachii",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
      "Wrist Flexors",
    ],
    bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
    sortedEquipment: ["barbell"],
  },
  cleanandJerk: {
    targetMuscles: [
      "Gluteus Maximus",
      "Hamstrings",
      "Quadriceps",
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Deltoid Anterior",
      "Deltoid Lateral",
    ],
    synergistMuscles: [
      "Adductor Magnus",
      "Gastrocnemius",
      "Soleus",
      "Erector Spinae",
      "Biceps Brachii",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
      "Wrist Flexors",
    ],
    bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
    sortedEquipment: ["barbell"],
  },
  concentrationCurl: {
    targetMuscles: ["Brachialis"],
    synergistMuscles: ["Biceps Brachii", "Brachioradialis"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["barbell", "dumbbell", "band", "cable"],
  },
  crossBodyCrunch: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Iliopsoas", "Rectus Abdominis"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  crunch: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: ["Obliques"],
    bodyParts: ["Waist"],
    sortedEquipment: ["cable", "bodyweight", "leverageMachine"],
  },
  cycling: {
    targetMuscles: [
      "Quadriceps",
      "Hamstrings",
      "Gluteus Maximus",
      "Gastrocnemius",
      "Soleus",
      "Tibialis Anterior",
    ],
    synergistMuscles: [
      "Adductor Magnus",
      "Adductor Longus",
      "Adductor Brevis",
      "Iliopsoas",
      "Erector Spinae",
      "Rectus Abdominis",
      "Obliques",
    ],
    bodyParts: ["Hips", "Thighs", "Calves", "Shins", "Back", "Waist"],
    sortedEquipment: ["bodyweight"],
  },
  deadlift: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Hamstrings", "Quadriceps", "Soleus"],
    bodyParts: ["Hips"],
    sortedEquipment: [
      "barbell",
      "cable",
      "dumbbell",
      "leverageMachine",
      "smith",
      "band",
      "kettlebell",
      "bodyweight",
    ],
  },
  deadliftHighPull: {
    targetMuscles: ["Deltoid Lateral", "Gluteus Maximus", "Quadriceps"],
    synergistMuscles: [
      "Adductor Magnus",
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Anterior",
      "Gastrocnemius",
      "Infraspinatus",
      "Soleus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell"],
  },
  declineBenchPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["dumbbell", "smith"],
  },
  declineCrunch: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: ["Obliques"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  deficitDeadlift: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: [
      "Adductor Magnus",
      "Erector Spinae",
      "Hamstrings",
      "Quadriceps",
      "Soleus",
    ],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "trapbar"],
  },
  ellipticalMachine: {
    targetMuscles: [],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Gluteus Maximus",
      "Hamstrings",
      "Latissimus Dorsi",
      "Levator Scapulae",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
      "Quadriceps",
      "Serratus Anterior",
    ],
    bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
    sortedEquipment: ["leverageMachine"],
  },
  facePull: {
    targetMuscles: ["Deltoid Posterior"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Lateral",
      "Infraspinatus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["band"],
  },
  flatKneeRaise: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Pectineous",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  flatLegRaise: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Pectineous",
      "Quadriceps",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Hips", "Waist"],
    sortedEquipment: ["bodyweight"],
  },
  frontRaise: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "bodyweight", "band"],
  },
  gluteBridge: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Quadriceps"],
    bodyParts: ["Hips"],
    sortedEquipment: ["band", "barbell", "dumbbell"],
  },
  gluteBridgeMarch: {
    targetMuscles: ["Gluteus Maximus", "Rectus Abdominis"],
    synergistMuscles: ["Hamstrings", "Quadriceps", "Sartorius"],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  gluteKickback: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus"],
    bodyParts: ["Glute"],
    sortedEquipment: ["leverageMachine", "bodyweight", "cable", "band"],
  },
  frontSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "kettlebell", "dumbbell", "cable", "smith"],
  },
  gobletSquat: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["kettlebell", "dumbbell"],
  },
  goodMorning: {
    targetMuscles: ["Hamstrings"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "smith", "leverageMachine"],
  },
  hackSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "smith"],
  },
  hammerCurl: {
    targetMuscles: ["Brachioradialis"],
    synergistMuscles: ["Biceps Brachii", "Brachialis"],
    bodyParts: ["Forearms"],
    sortedEquipment: ["cable", "dumbbell", "band"],
  },
  handstandPushUp: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["bodyweight"],
  },
  hangClean: {
    targetMuscles: ["Biceps Brachii", "Brachialis", "Brachioradialis"],
    synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head"],
    bodyParts: ["Forearms"],
    sortedEquipment: ["kettlebell"],
  },
  hangSnatch: {
    targetMuscles: [
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Trapezius Upper Fibers",
      "Quadriceps",
      "Gluteus Maximus",
    ],
    synergistMuscles: [
      "Hamstrings",
      "Erector Spinae",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Latissimus Dorsi",
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Gastrocnemius",
      "Soleus",
      "Obliques",
      "Rectus Abdominis",
    ],
    bodyParts: ["Thighs", "Back", "Shoulders"],
    sortedEquipment: ["barbell"],
  },
  hangingLegRaise: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Pectineous",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "cable"],
  },
  highKneeSkips: {
    targetMuscles: ["Quadriceps", "Hamstrings", "Gluteus Maximus"],
    synergistMuscles: [
      "Iliopsoas",
      "Gastrocnemius",
      "Soleus",
      "Tibialis Anterior",
      "Rectus Abdominis",
      "Obliques",
      "Adductor Magnus",
      "Adductor Brevis",
      "Adductor Longus",
    ],
    bodyParts: ["Thighs", "Hips"],
    sortedEquipment: ["bodyweight"],
  },
  highRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Erector Spinae",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["leverageMachine"],
  },
  hipAbductor: {
    targetMuscles: ["Gluteus Maximus", "Gluteus Medius"],
    synergistMuscles: ["Tensor Fasciae Latae"],
    bodyParts: ["Hips"],
    sortedEquipment: ["leverageMachine", "bodyweight", "cable", "band"],
  },
  hipAdductor: {
    targetMuscles: ["Adductor Brevis", "Adductor Longus", "Adductor Magnus"],
    synergistMuscles: ["Pectineous"],
    bodyParts: ["Hips"],
    sortedEquipment: ["leverageMachine", "cable", "band", "bodyweight"],
  },
  hipThrust: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Quadriceps"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "leverageMachine", "band", "bodyweight"],
  },
  inclineBenchPress: {
    targetMuscles: ["Pectoralis Major Clavicular Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Sternal Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "smith"],
  },
  inclineBenchPressWideGrip: {
    targetMuscles: ["Pectoralis Major Clavicular Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Sternal Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell"],
  },
  inclineChestFly: {
    targetMuscles: ["Pectoralis Major Clavicular Head"],
    synergistMuscles: [
      "Biceps Brachii",
      "Deltoid Anterior",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["cable", "dumbbell"],
  },
  inclineChestPress: {
    targetMuscles: ["Pectoralis Major Clavicular Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Sternal Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["leverageMachine", "band", "dumbbell"],
  },
  inclineCurl: {
    targetMuscles: ["Biceps Brachii"],
    synergistMuscles: ["Brachialis", "Brachioradialis"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["dumbbell"],
  },
  inclineRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  invertedRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Major",
      "Teres Minor",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["bodyweight"],
  },
  isoLateralChestPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["dumbbell"],
  },
  isoLateralRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["dumbbell"],
  },
  jackknifeSitUp: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [
      "Iliopsoas",
      "Obliques",
      "Quadriceps",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  jumpRope: {
    targetMuscles: ["Soleus", "Gastrocnemius", "Quadriceps", "Hamstrings"],
    synergistMuscles: [
      "Gluteus Maximus",
      "Rectus Abdominis",
      "Obliques",
      "Tibialis Anterior",
    ],
    bodyParts: ["Thighs", "Calves"],
    sortedEquipment: ["bodyweight"],
  },
  jumpSquat: {
    targetMuscles: ["Gluteus Maximus", "Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gastrocnemius", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "bodyweight"],
  },
  jumpingJack: {
    targetMuscles: [
      "Gluteus Maximus",
      "Quadriceps",
      "Adductor Brevis",
      "Adductor Longus",
      "Adductor Magnus",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
    ],
    synergistMuscles: [
      "Gastrocnemius",
      "Soleus",
      "Hamstrings",
      "Rectus Abdominis",
      "Obliques",
      "Trapezius Upper Fibers",
      "Serratus Anterior",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["bodyweight"],
  },
  kettlebellSwing: {
    targetMuscles: ["Deltoid Anterior", "Gluteus Maximus"],
    synergistMuscles: [
      "Adductor Magnus",
      "Hamstrings",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Soleus",
    ],
    bodyParts: ["Hips", "Shoulders"],
    sortedEquipment: ["dumbbell", "kettlebell"],
  },
  kettlebellTurkishGetUp: {
    targetMuscles: [
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Quadriceps",
      "Gluteus Maximus",
    ],
    synergistMuscles: [
      "Obliques",
      "Rectus Abdominis",
      "Latissimus Dorsi",
      "Hamstrings",
      "Adductor Brevis",
      "Adductor Longus",
      "Adductor Magnus",
      "Triceps Brachii",
      "Erector Spinae",
      "Serratus Anterior",
    ],
    bodyParts: ["Hips", "Shoulders"],
    sortedEquipment: ["kettlebell"],
  },
  kippingPullUp: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Brachialis",
      "Biceps Brachii",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Deltoid Posterior",
      "Brachioradialis",
      "Pectoralis Major Sternal Head",
      "Rectus Abdominis",
      "Obliques",
      "Iliopsoas",
      "Tensor Fasciae Latae",
      "Adductor Longus",
      "Adductor Brevis",
      "Erector Spinae",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["bodyweight"],
  },
  kneeRaise: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Pectineous",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  kneelingPulldown: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Levator Scapulae",
      "Pectoralis Major Sternal Head",
      "Serratus Anterior",
      "Teres Major",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["band"],
  },
  kneestoElbows: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Iliopsoas",
      "Obliques",
      "Pectineous",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  latPulldown: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Levator Scapulae",
      "Teres Major",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  lateralBoxJump: {
    targetMuscles: ["Gluteus Maximus", "Quadriceps", "Hamstrings"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Adductor Magnus",
      "Gluteus Medius",
      "Tensor Fasciae Latae",
      "Rectus Abdominis",
      "Obliques",
      "Deltoid Anterior",
      "Deltoid Posterior",
      "Deltoid Lateral",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["bodyweight"],
  },
  lateralRaise: {
    targetMuscles: ["Deltoid Lateral"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: [
      "cable",
      "dumbbell",
      "leverageMachine",
      "band",
      "kettlebell",
    ],
  },
  legsUpBenchPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell"],
  },
  legCurl: {
    targetMuscles: ["Hamstrings"],
    synergistMuscles: ["Gastrocnemius", "Sartorius"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["leverageMachine"],
  },
  legExtension: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: [],
    bodyParts: ["Thighs"],
    sortedEquipment: ["leverageMachine", "band"],
  },
  legPress: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["smith", "leverageMachine"],
  },
  lunge: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell", "bodyweight", "cable"],
  },
  lyingBicepCurl: {
    targetMuscles: ["Biceps Brachii"],
    synergistMuscles: ["Brachialis", "Brachioradialis"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: [
      "barbell",
      "dumbbell",
      "band",
      "leverageMachine",
      "cable",
      "ezbar",
    ],
  },
  lyingLegCurl: {
    targetMuscles: ["Hamstrings"],
    synergistMuscles: ["Gastrocnemius", "Sartorius"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["leverageMachine", "band"],
  },
  mountainClimber: {
    targetMuscles: ["Iliopsoas"],
    synergistMuscles: [
      "Adductor Brevis",
      "Adductor Longus",
      "Pectineous",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  muscleUp: {
    targetMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Latissimus Dorsi",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    synergistMuscles: [],
    bodyParts: ["Back"],
    sortedEquipment: ["bodyweight"],
  },
  obliqueCrunch: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Rectus Abdominis"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  overheadPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell", "dumbbell", "ezbar"],
  },
  overheadSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  pecDeck: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: ["Pectoralis Major Clavicular Head", "Serratus Anterior"],
    bodyParts: ["Chest"],
    sortedEquipment: ["leverageMachine"],
  },
  pendlayRow: {
    targetMuscles: [
      "Deltoid Posterior",
      "Infraspinatus",
      "Latissimus Dorsi",
      "Teres Major",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["barbell"],
  },
  pistolSquat: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["kettlebell", "leverageMachine", "bodyweight"],
  },
  plank: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  powerClean: {
    targetMuscles: ["Quadriceps", "Gluteus Maximus", "Deltoid Anterior"],
    synergistMuscles: [
      "Hamstrings",
      "Gastrocnemius",
      "Soleus",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Trapezius Upper Fibers",
      "Latissimus Dorsi",
      "Erector Spinae",
      "Biceps Brachii",
      "Wrist Flexors",
      "Rectus Abdominis",
      "Obliques",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell"],
  },
  powerSnatch: {
    targetMuscles: [
      "Quadriceps",
      "Gluteus Maximus",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
    ],
    synergistMuscles: [
      "Hamstrings",
      "Gastrocnemius",
      "Soleus",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Trapezius Upper Fibers",
      "Latissimus Dorsi",
      "Erector Spinae",
      "Biceps Brachii",
      "Wrist Flexors",
      "Rectus Abdominis",
      "Obliques",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell"],
  },
  preacherCurl: {
    targetMuscles: ["Brachialis"],
    synergistMuscles: ["Biceps Brachii", "Brachioradialis"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["barbell", "dumbbell", "ezbar", "leverageMachine"],
  },
  pressUnder: {
    targetMuscles: [
      "Quadriceps",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
    ],
    synergistMuscles: [
      "Gluteus Maximus",
      "Hamstrings",
      "Erector Spinae",
      "Rectus Abdominis",
      "Obliques",
      "Triceps Brachii",
      "Biceps Brachii",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell"],
  },
  pullUp: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Levator Scapulae",
      "Teres Major",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["leverageMachine", "bodyweight", "band"],
  },
  pullover: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Deltoid Posterior",
      "Levator Scapulae",
      "Pectoralis Major Sternal Head",
      "Serratus Anterior",
      "Teres Major",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  pushPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["bodyweight", "kettlebell"],
  },
  pushUp: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["bodyweight", "band"],
  },
  reverseCrunch: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: ["Iliopsoas", "Obliques"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "cable"],
  },
  reverseCurl: {
    targetMuscles: ["Brachioradialis"],
    synergistMuscles: ["Biceps Brachii", "Brachialis"],
    bodyParts: ["Forearms"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "band"],
  },
  reverseFly: {
    targetMuscles: ["Deltoid Posterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Infraspinatus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["dumbbell", "leverageMachine", "band"],
  },
  reverseGripConcentrationCurl: {
    targetMuscles: ["Brachialis", "Brachioradialis"],
    synergistMuscles: ["Biceps Brachii", "Wrist Flexors"],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["dumbbell"],
  },
  reverseLatPulldown: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Levator Scapulae",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  reverseLunge: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Soleus", "Gluteus Maximus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell", "bodyweight", "cable"],
  },
  reverseWristCurl: {
    targetMuscles: ["Wrist Extensors"],
    synergistMuscles: [],
    bodyParts: ["Forearms"],
    sortedEquipment: ["barbell"],
  },
  reversePlank: {
    targetMuscles: ["Gluteus Maximus", "Rectus Abdominis", "Erector Spinae"],
    synergistMuscles: [
      "Hamstrings",
      "Quadriceps",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Triceps Brachii",
      "Latissimus Dorsi",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  romanianDeadlift: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Erector Spinae", "Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  reverseHyperextension: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["band", "leverageMachine"],
  },
  rowing: {
    targetMuscles: ["Quadriceps", "Latissimus Dorsi", "Erector Spinae"],
    synergistMuscles: [
      "Hamstrings",
      "Gluteus Maximus",
      "Biceps Brachii",
      "Deltoid Anterior",
      "Deltoid Lateral",
      "Deltoid Posterior",
      "Wrist Flexors",
      "Rectus Abdominis",
      "Obliques",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Thighs"],
    sortedEquipment: ["cable"],
  },
  russianTwist: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Erector Spinae", "Iliopsoas"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "dumbbell", "cable"],
  },
  safetySquatBarSquat: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell"],
  },
  seatedCalfRaise: {
    targetMuscles: ["Soleus"],
    synergistMuscles: ["Gastrocnemius"],
    bodyParts: ["Calves"],
    sortedEquipment: ["barbell", "dumbbell", "leverageMachine"],
  },
  seatedFrontRaise: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell", "dumbbell"],
  },
  seatedLegCurl: {
    targetMuscles: ["Hamstrings"],
    synergistMuscles: ["Gastrocnemius", "Sartorius"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["leverageMachine"],
  },
  seatedLegPress: {
    targetMuscles: ["Gluteus Maximus", "Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Soleus"],
    bodyParts: ["Hips", "Thighs"],
    sortedEquipment: ["leverageMachine"],
  },
  seatedOverheadPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell"],
  },
  seatedPalmsUpWristCurl: {
    targetMuscles: ["Wrist Flexors"],
    synergistMuscles: [],
    bodyParts: ["Forearms"],
    sortedEquipment: ["dumbbell"],
  },
  seatedRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Erector Spinae",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable", "band", "leverageMachine"],
  },
  seatedWideGripRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Erector Spinae",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  shoulderPress: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["cable", "dumbbell", "leverageMachine", "band", "smith"],
  },
  shoulderPressParallelGrip: {
    targetMuscles: ["Deltoid Anterior"],
    synergistMuscles: [
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["dumbbell"],
  },
  shrug: {
    targetMuscles: ["Trapezius Upper Fibers"],
    synergistMuscles: ["Levator Scapulae", "Trapezius Middle Fibers"],
    bodyParts: ["Back"],
    sortedEquipment: [
      "barbell",
      "cable",
      "dumbbell",
      "leverageMachine",
      "band",
      "smith",
    ],
  },
  sideBend: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Erector Spinae", "Iliopsoas"],
    bodyParts: ["Waist"],
    sortedEquipment: ["cable", "dumbbell", "band"],
  },
  sideCrunch: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Rectus Abdominis"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "band", "cable"],
  },
  sideHipAbductor: {
    targetMuscles: ["Gluteus Medius", "Tensor Fasciae Latae"],
    synergistMuscles: [],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight", "barbell", "leverageMachine"],
  },
  sideLyingClam: {
    targetMuscles: ["Gluteus Medius"],
    synergistMuscles: ["Tensor Fasciae Latae"],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  sidePlank: {
    targetMuscles: ["Obliques"],
    synergistMuscles: [],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  singleLegBridge: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  singleLegCalfRaise: {
    targetMuscles: ["Gastrocnemius"],
    synergistMuscles: ["Soleus"],
    bodyParts: ["Calves"],
    sortedEquipment: [
      "barbell",
      "dumbbell",
      "leverageMachine",
      "bodyweight",
      "cable",
    ],
  },
  singleLegDeadlift: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["dumbbell", "bodyweight"],
  },
  singleLegGluteBridgeBench: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: [],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  singleLegGluteBridgeStraight: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: [],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  singleLegGluteBridgeBentKnee: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: [],
    bodyParts: ["Hips"],
    sortedEquipment: ["bodyweight"],
  },
  singleLegHipThrust: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Quadriceps"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "bodyweight", "leverageMachine"],
  },
  sissySquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["bodyweight"],
  },
  sitUp: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [
      "Iliopsoas",
      "Obliques",
      "Quadriceps",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "kettlebell"],
  },
  slingShotBenchPress: {
    targetMuscles: ["Pectoralis Major Sternal Head"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Pectoralis Major Clavicular Head",
      "Triceps Brachii",
    ],
    bodyParts: ["Chest"],
    sortedEquipment: ["barbell"],
  },
  skullcrusher: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "ezbar"],
  },
  snatch: {
    targetMuscles: [
      "Deltoid Anterior",
      "Erector Spinae",
      "Gluteus Maximus",
      "Quadriceps",
    ],
    synergistMuscles: [
      "Adductor Magnus",
      "Deltoid Lateral",
      "Gastrocnemius",
      "Serratus Anterior",
      "Soleus",
      "Triceps Brachii",
    ],
    bodyParts: ["Hips", "Shoulders", "Thighs"],
    sortedEquipment: ["dumbbell"],
  },
  snatchPull: {
    targetMuscles: [
      "Erector Spinae",
      "Gluteus Maximus",
      "Hamstrings",
      "Quadriceps",
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Trapezius Upper Fibers",
    ],
    synergistMuscles: [
      "Adductor Magnus",
      "Deltoid Anterior",
      "Deltoid Posterior",
      "Deltoid Lateral",
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Triceps Brachii",
      "Wrist Flexors",
      "Wrist Extensors",
    ],
    bodyParts: ["Back", "Hips", "Thighs"],
    sortedEquipment: ["barbell"],
  },
  splitSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Hips", "Thighs"],
    sortedEquipment: ["dumbbell"],
  },
  splitJerk: {
    targetMuscles: [
      "Deltoid Anterior",
      "Deltoid Posterior",
      "Deltoid Lateral",
      "Triceps Brachii",
      "Quadriceps",
      "Gluteus Maximus",
      "Erector Spinae",
    ],
    synergistMuscles: [
      "Pectoralis Major Sternal Head",
      "Pectoralis Major Clavicular Head",
      "Latissimus Dorsi",
      "Hamstrings",
      "Obliques",
      "Rectus Abdominis",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
      "Trapezius Upper Fibers",
      "Adductor Magnus",
      "Tensor Fasciae Latae",
      "Wrist Extensors",
      "Wrist Flexors",
    ],
    bodyParts: ["Hips", "Shoulders", "Thighs"],
    sortedEquipment: ["barbell"],
  },
  squat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: [
      "barbell",
      "dumbbell",
      "bodyweight",
      "smith",
      "leverageMachine",
    ],
  },
  squatRow: {
    targetMuscles: [
      "Gluteus Maximus",
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Major",
      "Teres Minor",
      "Adductor Magnus",
      "Deltoid Posterior",
      "Pectoralis Major Sternal Head",
      "Quadriceps",
      "Soleus",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["band"],
  },
  standingCalfRaise: {
    targetMuscles: ["Gastrocnemius"],
    synergistMuscles: ["Soleus"],
    bodyParts: ["Calves"],
    sortedEquipment: [
      "barbell",
      "dumbbell",
      "leverageMachine",
      "bodyweight",
      "cable",
    ],
  },
  standingRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  standingRowCloseGrip: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Upper Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Major",
      "Teres Minor",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  standingRowRearDeltWithRope: {
    targetMuscles: ["Deltoid Posterior"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Lateral",
      "Infraspinatus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["cable"],
  },
  standingRowRearHorizontalDeltWithRope: {
    targetMuscles: ["Deltoid Posterior"],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["cable"],
  },
  standingRowVBar: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Infraspinatus",
      "Teres Major",
      "Teres Minor",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["cable"],
  },
  stepUp: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell", "bodyweight", "band"],
  },
  stiffLegDeadlift: {
    targetMuscles: ["Erector Spinae"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Hamstrings"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell", "dumbbell", "band"],
  },
  straightLegDeadlift: {
    targetMuscles: ["Hamstrings"],
    synergistMuscles: ["Adductor Magnus", "Erector Spinae", "Gluteus Maximus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["barbell", "dumbbell", "band", "kettlebell"],
  },
  sumoDeadlift: {
    targetMuscles: ["Erector Spinae"],
    synergistMuscles: [
      "Adductor Magnus",
      "Gluteus Maximus",
      "Quadriceps",
      "Soleus",
    ],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell"],
  },
  sumoDeadliftHighPull: {
    targetMuscles: ["Deltoid Lateral", "Gluteus Maximus", "Quadriceps"],
    synergistMuscles: [
      "Adductor Magnus",
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Anterior",
      "Gastrocnemius",
      "Infraspinatus",
      "Soleus",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell"],
  },
  superman: {
    targetMuscles: ["Erector Spinae"],
    synergistMuscles: ["Gluteus Maximus", "Hamstrings"],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "dumbbell"],
  },
  tBarRow: {
    targetMuscles: [
      "Latissimus Dorsi",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Pectoralis Major Sternal Head",
      "Teres Major",
      "Teres Minor",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["leverageMachine"],
  },
  thruster: {
    targetMuscles: ["Deltoid Anterior", "Gluteus Maximus", "Quadriceps"],
    synergistMuscles: [
      "Adductor Magnus",
      "Deltoid Lateral",
      "Pectoralis Major Clavicular Head",
      "Serratus Anterior",
      "Soleus",
      "Triceps Brachii",
    ],
    bodyParts: ["Shoulders", "Thighs"],
    sortedEquipment: ["barbell"],
  },
  toesToBar: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [
      "Iliopsoas",
      "Obliques",
      "Quadriceps",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight"],
  },
  torsoRotation: {
    targetMuscles: ["Obliques"],
    synergistMuscles: ["Erector Spinae"],
    bodyParts: ["Waist"],
    sortedEquipment: ["cable"],
  },
  trapBarDeadlift: {
    targetMuscles: ["Gluteus Maximus"],
    synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
    bodyParts: ["Thighs"],
    sortedEquipment: ["trapbar"],
  },
  tricepsDip: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [
      "Deltoid Anterior",
      "Latissimus Dorsi",
      "Levator Scapulae",
      "Pectoralis Major Clavicular Head",
      "Pectoralis Major Sternal Head",
    ],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["bodyweight", "leverageMachine"],
  },
  tricepsExtension: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["barbell", "cable", "band", "dumbbell"],
  },
  tricepsPushdown: {
    targetMuscles: ["Triceps Brachii"],
    synergistMuscles: [],
    bodyParts: ["Upper Arms"],
    sortedEquipment: ["cable"],
  },
  uprightRow: {
    targetMuscles: ["Deltoid Lateral"],
    synergistMuscles: [
      "Biceps Brachii",
      "Brachialis",
      "Brachioradialis",
      "Deltoid Anterior",
      "Infraspinatus",
      "Serratus Anterior",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Shoulders"],
    sortedEquipment: ["barbell", "cable", "dumbbell", "band"],
  },
  vUp: {
    targetMuscles: ["Rectus Abdominis"],
    synergistMuscles: [
      "Iliopsoas",
      "Obliques",
      "Pectineous",
      "Quadriceps",
      "Sartorius",
      "Tensor Fasciae Latae",
    ],
    bodyParts: ["Waist"],
    sortedEquipment: ["bodyweight", "band", "dumbbell"],
  },
  widePullUp: {
    targetMuscles: ["Latissimus Dorsi"],
    synergistMuscles: [
      "Brachialis",
      "Brachioradialis",
      "Deltoid Posterior",
      "Infraspinatus",
      "Levator Scapulae",
      "Serratus Anterior",
      "Teres Major",
      "Teres Minor",
      "Trapezius Lower Fibers",
      "Trapezius Middle Fibers",
    ],
    bodyParts: ["Back"],
    sortedEquipment: ["bodyweight"],
  },
  wristCurl: {
    targetMuscles: ["Wrist Flexors"],
    synergistMuscles: [],
    bodyParts: ["Forearms"],
    sortedEquipment: ["barbell"],
  },
  wristRoller: {
    targetMuscles: ["Wrist Extensors", "Wrist Flexors"],
    synergistMuscles: [],
    bodyParts: ["Forearms"],
    sortedEquipment: ["bodyweight"],
  },
  zercherSquat: {
    targetMuscles: ["Quadriceps"],
    synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
    bodyParts: ["Hips"],
    sortedEquipment: ["barbell"],
  },
};

export function equipmentToBarKey(equipment?: IEquipment): IBarKey | undefined {
  switch (equipment) {
    case "barbell":
      return "barbell";
    case "dumbbell":
      return "dumbbell";
    case "ezbar":
      return "ezbar";
    default:
      return undefined;
  }
}

export function equipmentName(
  equipment: IEquipment | undefined,
  equipmentSettings?: IAllEquipment,
): string {
  const equipmentData =
    equipment && equipmentSettings ? equipmentSettings[equipment] : undefined;
  if (equipmentData?.name) {
    return equipmentData.name.trim();
  }
  switch (equipment) {
    case "barbell":
      return "Barbell";
    case "cable":
      return "Cable";
    case "dumbbell":
      return "Dumbbell";
    case "smith":
      return "Smith Machine";
    case "band":
      return "Band";
    case "kettlebell":
      return "Kettlebell";
    case "bodyweight":
      return "Bodyweight";
    case "leverageMachine":
      return "Leverage Machine";
    case "medicineball":
      return "Medicine Ball";
    case "ezbar":
      return "EZ Bar";
    case "trapbar":
      return "Trap Bar";
    default:
      return "";
  }
}

export type IExerciseKind =
  | "core"
  | "pull"
  | "push"
  | "legs"
  | "upper"
  | "lower";

export type IExercise = {
  id: IExerciseId;
  name: string;
  defaultWarmup?: number;
  equipment?: IEquipment;
  defaultEquipment?: IEquipment;
  types: IExerciseKind[];
  onerm?: number;
  startingWeightLb: IWeight;
  startingWeightKg: IWeight;
};

export function warmupValues(
  units: IUnit,
): Partial<Record<number, IProgramExerciseWarmupSet[]>> {
  return {
    10: [
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(60, "lb") : Weight_build(30, "kg"),
        value: 0.3,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(30, "lb") : Weight_build(15, "kg"),
        value: 0.5,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(10, "lb") : Weight_build(5, "kg"),
        value: 0.8,
      },
    ],
    45: [
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(120, "lb") : Weight_build(60, "kg"),
        value: 0.3,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(90, "lb") : Weight_build(45, "kg"),
        value: 0.5,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(45, "lb") : Weight_build(20, "kg"),
        value: 0.8,
      },
    ],
    95: [
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(150, "lb") : Weight_build(70, "kg"),
        value: 0.3,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(125, "lb") : Weight_build(60, "kg"),
        value: 0.5,
      },
      {
        reps: 5,
        threshold:
          units === "lb" ? Weight_build(95, "lb") : Weight_build(40, "kg"),
        value: 0.8,
      },
    ],
  };
}

function warmup45(
  weight: IWeight | undefined,
  settings: ISettings,
  exerciseType?: IExerciseType,
): ISet[] {
  return warmup(warmupValues(settings.units)[45] || [])(
    weight,
    settings,
    exerciseType,
  );
}

function warmup95(
  weight: IWeight | undefined,
  settings: ISettings,
  exerciseType?: IExerciseType,
): ISet[] {
  return warmup(warmupValues(settings.units)[95] || [])(
    weight,
    settings,
    exerciseType,
  );
}

function warmup10(
  weight: IWeight | undefined,
  settings: ISettings,
  exerciseType?: IExerciseType,
): ISet[] {
  return warmup(warmupValues(settings.units)[10] || [])(
    weight,
    settings,
    exerciseType,
  );
}

function warmup(
  programExerciseWarmupSets: IProgramExerciseWarmupSet[],
  shouldSkipThreshold: boolean = false,
): (
  weight: IWeight | undefined,
  settings: ISettings,
  exerciseType?: IExerciseType,
) => ISet[] {
  return (
    weight: IWeight | undefined,
    settings: ISettings,
    exerciseType?: IExerciseType,
  ): ISet[] => {
    let index = 0;
    return programExerciseWarmupSets.reduce<ISet[]>(
      (memo, programExerciseWarmupSet) => {
        if (
          shouldSkipThreshold ||
          (weight != null &&
            Weight_gt(weight, programExerciseWarmupSet.threshold))
        ) {
          const value = programExerciseWarmupSet.value;
          const unit = Equipment_getUnitOrDefaultForExerciseType(
            settings,
            exerciseType,
          );
          if (typeof value !== "number" || weight != null) {
            const warmupWeight =
              typeof value === "number"
                ? Weight_multiply(weight!, value)
                : value;
            const roundedWeight = Weight_roundConvertTo(
              warmupWeight,
              settings,
              unit,
              exerciseType,
            );
            memo.push({
              vtype: "set",
              index,
              id: UidFactory_generateUid(6),
              reps: programExerciseWarmupSet.reps,
              isUnilateral: exerciseType
                ? Exercise_getIsUnilateral(exerciseType, settings)
                : false,
              weight: roundedWeight,
              originalWeight: warmupWeight,
              isCompleted: false,
            });
            index += 1;
          }
        }
        return memo;
      },
      [],
    );
  };
}

function warmupEmpty(weight: IWeight | undefined): ISet[] {
  return [];
}

function maybeGetExercise(
  id: IExerciseId,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  const custom = customExercises[id];
  return custom != null
    ? {
        ...custom,
        defaultWarmup: 45,
        types: custom.types || [],
        startingWeightKg: Weight_build(0, "kg"),
        startingWeightLb: Weight_build(0, "lb"),
      }
    : allExercisesList[id];
}

function getExercise(
  id: IExerciseId,
  customExercises: IAllCustomExercises,
): IExercise {
  const exercise = maybeGetExercise(id, customExercises);
  return exercise != null ? exercise : allExercisesList.squat;
}

export function Exercise_getMetadata(id: IExerciseId): IMetaExercises {
  return metadata[id] || {};
}

export function Exercise_exists(
  name: string,
  customExercises: IAllCustomExercises,
): boolean {
  let exercise = ObjectUtils_keys(allExercisesList).filter(
    (k) => allExercisesList[k].name === name,
  )[0];
  if (exercise == null) {
    exercise = ObjectUtils_keys(customExercises).filter(
      (k) =>
        !customExercises[k]!.isDeleted && customExercises[k]!.name === name,
    )[0];
  }
  return !!exercise;
}

export function Exercise_isCustom(
  id: string,
  customExercises: IAllCustomExercises,
): boolean {
  return customExercises[id] != null;
}

export function Exercise_fullName(
  exercise: IExercise,
  settings: ISettings,
  label?: string,
): string {
  let str: string;
  if (exercise.equipment && exercise.defaultEquipment !== exercise.equipment) {
    const allEquipment = Equipment_currentEquipment(settings);
    const equipment = equipmentName(exercise.equipment, allEquipment);
    str = `${exercise.name}, ${equipment}`;
  } else {
    str = exercise.name;
  }
  if (label) {
    str = `${label}: ${str}`;
  }
  return str;
}

export function Exercise_reverseName(
  exercise: IExercise,
  settings?: ISettings,
): string {
  if (exercise.equipment) {
    const allEquipment = settings ? Equipment_currentEquipment(settings) : {};
    const equipment = equipmentName(exercise.equipment, allEquipment);
    return `${equipment} ${exercise.name}`;
  } else {
    return exercise.name;
  }
}

export function Exercise_nameWithEquipment(
  exercise: IExercise,
  settings?: ISettings,
): string {
  if (exercise.equipment) {
    const allEquipment = settings ? Equipment_currentEquipment(settings) : {};
    const equipment = equipmentName(exercise.equipment, allEquipment);
    return `${exercise.name}, ${equipment}`;
  } else {
    return exercise.name;
  }
}

export function Exercise_searchNames(
  query: string,
  customExercises: IAllCustomExercises,
): string[] {
  const allExercises = Exercise_allExpanded({});
  const exerciseNames = allExercises
    .filter((e) =>
      StringUtils_fuzzySearch(
        query.toLowerCase(),
        `${e.name}${e.equipment ? `, ${equipmentName(e.equipment)}` : ""}`.toLowerCase(),
      ),
    )
    .map(
      (e) => `${e.name}${e.equipment ? `, ${equipmentName(e.equipment)}` : ""}`,
    );
  const customExerciseNames = ObjectUtils_values(customExercises)
    .filter((ce) =>
      ce
        ? StringUtils_fuzzySearch(query.toLowerCase(), ce.name.toLowerCase())
        : false,
    )
    .map((e) => e!.name);
  const names = [...exerciseNames, ...customExerciseNames];
  names.sort();
  return names;
}

export function Exercise_findById(
  id: IExerciseId,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  return maybeGetExercise(id, customExercises);
}

export function Exercise_findIdByName(
  name: string,
  customExercises: IAllCustomExercises,
): IExerciseId | undefined {
  const lowercaseName = name.toLowerCase();
  return (
    nameToIdMapping[lowercaseName] ||
    ObjectUtils_values(customExercises).find((ce) => {
      const thisLowercaseName = ce?.name?.toLowerCase() || "";
      return (
        thisLowercaseName === lowercaseName ||
        thisLowercaseName.replace(/\s*,\s*/g, ",") ===
          lowercaseName.replace(/\s*,\s*/g, ",")
      );
    })?.id
  );
}

export function Exercise_get(
  type: IExerciseType,
  customExercises: IAllCustomExercises,
): IExercise {
  const exercise = getExercise(type.id, customExercises);
  return { ...exercise, equipment: type.equipment };
}

export function Exercise_getNotes(
  type: IExerciseType,
  settings: ISettings,
): string | undefined {
  return settings.exerciseData[Exercise_toKey(type)]?.notes;
}

export function Exercise_onerm(
  type: IExerciseType,
  settings: ISettings,
): IWeight {
  const rm = settings.exerciseData[Exercise_toKey(type)]?.rm1;
  if (rm) {
    return Weight_convertTo(rm, settings.units);
  }
  const exercise = Exercise_get(type, settings.exercises);
  return settings.units === "kg"
    ? exercise.startingWeightKg
    : exercise.startingWeightLb;
}

export function Exercise_defaultRounding(
  type: IExerciseType,
  settings: ISettings,
): number {
  const units = Equipment_getUnitOrDefaultForExerciseType(settings, type);
  return Math.max(
    0.1,
    settings.exerciseData[Exercise_toKey(type)]?.rounding ??
      (units === "kg" ? 2.5 : 5),
  );
}

export function Exercise_find(
  type: IExerciseType,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  const exercise = maybeGetExercise(type.id, customExercises);
  return exercise ? { ...exercise, equipment: type.equipment } : undefined;
}

export function Exercise_getById(
  id: IExerciseId,
  customExercises: IAllCustomExercises,
): IExercise {
  const exercise = getExercise(id, customExercises);
  return { ...exercise, equipment: exercise.defaultEquipment };
}

export function Exercise_findByNameEquipment(
  customExercises: IAllCustomExercises,
  name: string,
  equipment?: string,
): IExercise | undefined {
  const exerciseId = Exercise_findIdByName(name, customExercises);
  const exercise = exerciseId
    ? Exercise_findById(exerciseId, customExercises)
    : undefined;
  if (exercise == null) {
    return undefined;
  }
  return { ...exercise, equipment };
}

export function Exercise_findByNameAndEquipment(
  nameAndEquipment: string,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  const parts = nameAndEquipment.split(",").map((p) => p.trim());
  let name: string | undefined;
  let equipment: IEquipment | undefined | null;
  if (parts.length > 1) {
    const foundEquipment = equipments.filter(
      (e) =>
        equipmentName(e).toLowerCase() ===
        parts[parts.length - 1].toLowerCase(),
    )[0];
    if (foundEquipment != null) {
      equipment = foundEquipment;
      name = parts.slice(0, parts.length - 1).join(", ");
    } else {
      equipment = null;
    }
  }
  if (name == null) {
    name = nameAndEquipment;
  }
  let exerciseId = Exercise_findIdByName(name, {});
  if (exerciseId != null && equipment !== null) {
    const exercise = Exercise_findById(exerciseId, {});
    if (exercise != null) {
      return { ...exercise, equipment: equipment || exercise.defaultEquipment };
    }
  } else {
    exerciseId = Exercise_findIdByName(nameAndEquipment, customExercises);
    if (exerciseId != null) {
      const exercise = Exercise_findById(exerciseId, customExercises);
      if (exercise != null) {
        return { ...exercise };
      }
    }
  }
  return undefined;
}

export function Exercise_getIsUnilateral(
  exerciseType: IExerciseType,
  settings: ISettings,
): boolean {
  const key = Exercise_toKey(exerciseType);
  const exerciseData = settings.exerciseData[key];
  if (exerciseData?.isUnilateral !== undefined) {
    return exerciseData.isUnilateral;
  }

  switch (exerciseType.id) {
    case "bulgarianSplitSquat":
    case "concentrationCurl":
    case "reverseGripConcentrationCurl":
    case "bentOverOneArmRow":
    case "cableKickback":
    case "cableTwist":
    case "russianTwist":
    case "lunge":
    case "reverseLunge":
    case "splitSquat":
    case "stepUp":
    case "pistolSquat":
    case "singleLegBridge":
    case "singleLegDeadlift":
    case "sideBend":
    case "sideCrunch":
    case "sideHipAbductor":
    case "sideLyingClam":
    case "sidePlank":
    case "singleLegBridge":
    case "singleLegCalfRaise":
    case "singleLegDeadlift":
    case "singleLegGluteBridgeBench":
    case "singleLegGluteBridgeStraight":
    case "singleLegGluteBridgeBentKnee":
    case "singleLegHipThrust":
      return true;
    case "bicepCurl":
    case "wristCurl":
    case "reverseWristCurl":
    case "seatedPalmsUpWristCurl":
    case "hammerCurl":
    case "preacherCurl":
    case "reverseCurl":
    case "lyingBicepCurl":
    case "inclineCurl":
      return exerciseType.equipment === "dumbbell";
    default:
      return false;
  }
}

export function Exercise_findByName(
  name: string,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  const exerciseId = Exercise_findIdByName(name.trim(), customExercises);
  if (exerciseId != null) {
    const exercise = Exercise_findById(exerciseId, customExercises);
    if (exercise != null) {
      return { ...exercise, equipment: exercise.defaultEquipment };
    }
  }
  return undefined;
}

export function Exercise_getByIds(
  ids: IExerciseId[],
  customExercises: IAllCustomExercises,
): IExercise[] {
  return ids.map((id) => {
    const exercise = getExercise(id, customExercises);
    return { ...exercise, equipment: exercise.defaultEquipment };
  });
}

export function Exercise_all(
  customExercises: IAllCustomExercises,
): IExercise[] {
  return ObjectUtils_keys(customExercises)
    .map((id) => getExercise(id, customExercises))
    .concat(
      ObjectUtils_keys(allExercisesList).map((k) => ({
        ...allExercisesList[k],
        equipment: allExercisesList[k].defaultEquipment,
      })),
    );
}

export function Exercise_allExpanded(
  customExercises: IAllCustomExercises,
): IExercise[] {
  return ObjectUtils_keys(customExercises)
    .map((id) => getExercise(id, customExercises))
    .concat(
      ObjectUtils_keys(allExercisesList).flatMap((k) => {
        return CollectionUtils_compact(
          equipments.map((equipment) => {
            const exerciseType = { id: k, equipment };
            return ExerciseImageUtils_exists(exerciseType, "small")
              ? { ...allExercisesList[k], equipment }
              : undefined;
          }),
        );
      }),
    );
}

export function Exercise_toExternalUrl(type: IExerciseType): string {
  return `/exercises/${Exercise_toUrlSlug(type)}`;
}

export function Exercise_toUrlSlug(type: IExerciseType): string {
  const possibleEquipments: Record<string, IEquipment> = {
    barbell: "barbell",
    cable: "cable",
    dumbbell: "dumbbell",
    smith: "smith",
    band: "band",
    kettlebell: "kettlebell",
    bodyweight: "bodyweight",
    leverageMachine: "leverage-machine",
    medicineball: "medicine-ball",
    ezbar: "ez-bar",
    trapbar: "trap-bar",
  };

  const equipment = type.equipment
    ? possibleEquipments[type.equipment]
    : undefined;
  const equipmentSlug = equipment ? `${equipment}-` : "";
  return `${equipmentSlug}${StringUtils_dashcase(StringUtils_uncamelCase(type.id))}`;
}

export function Exercise_fromUrlSlug(slug: string): IExerciseType | undefined {
  // slug looks like leverage-machine-squat or barbell-bench-press
  const possibleEquipments: Record<string, IEquipment> = {
    barbell: "barbell",
    cable: "cable",
    dumbbell: "dumbbell",
    smith: "smith",
    band: "band",
    kettlebell: "kettlebell",
    bodyweight: "bodyweight",
    "leverage-machine": "leverageMachine",
    "medicine-ball": "medicineball",
    "ez-bar": "ezbar",
    "trap-bar": "trapbar",
  };
  let equipment: IEquipment | undefined = undefined;
  const equipmentKey = ObjectUtils_keys(possibleEquipments).find((e) =>
    slug.startsWith(e),
  );
  if (equipmentKey != null) {
    equipment = possibleEquipments[equipmentKey];
    slug = slug.slice(equipmentKey.length + 1);
  }
  const exerciseId = StringUtils_camelCase(StringUtils_undashcase(slug));
  if (allExercisesList[exerciseId]) {
    return { id: exerciseId as IExerciseId, equipment };
  } else {
    return undefined;
  }
}

export function Exercise_eq(a: IExerciseType, b: IExerciseType): boolean {
  return a.id === b.id && a.equipment === b.equipment;
}

export function Exercise_filterExercisesByNameAndType(
  settings: ISettings,
  filter: string,
  filterTypes: string[],
  isSubstitute: boolean,
  exerciseType?: IExerciseType,
  length?: number,
): IExercise[] {
  let allExercises = Exercise_allExpanded({});
  if (filter) {
    allExercises = Exercise_filterExercises(allExercises, filter);
  }
  if (filterTypes && filterTypes.length > 0) {
    allExercises = Exercise_filterExercisesByType(
      allExercises,
      filterTypes,
      settings,
    );
  }
  allExercises = Exercise_sortExercises(
    allExercises,
    isSubstitute,
    settings,
    filterTypes,
    exerciseType,
  );
  if (length != null) {
    allExercises = allExercises.slice(0, length);
  }
  return allExercises;
}

export function Exercise_getWarmupSets(
  exercise: IExerciseType,
  weight: IWeight | undefined,
  settings: ISettings,
  programExerciseWarmupSets?: IProgramExerciseWarmupSet[],
): ISet[] {
  const ex = Exercise_get(exercise, settings.exercises);
  if (programExerciseWarmupSets != null) {
    return warmup(programExerciseWarmupSets, true)(weight, settings, exercise);
  } else {
    let warmupSets = warmupEmpty(weight);
    if (ex.defaultWarmup === 10) {
      warmupSets = warmup10(weight, settings, exercise);
    } else if (ex.defaultWarmup === 45) {
      warmupSets = warmup45(weight, settings, exercise);
    } else if (ex.defaultWarmup === 95) {
      warmupSets = warmup95(weight, settings, exercise);
    }
    return warmupSets;
  }
}

export function Exercise_defaultTargetMuscles(
  type: IExerciseType,
  settings: ISettings,
): IMuscle[] {
  const customExercise = settings.exercises[type.id];
  if (customExercise) {
    return customExercise.meta.targetMuscles;
  } else {
    const meta = Exercise_getMetadata(type.id);
    return meta?.targetMuscles != null ? meta.targetMuscles : [];
  }
}

export function Exercise_targetMuscles(
  type: IExerciseType,
  settings: ISettings,
): IMuscle[] {
  const muscleMultipliers =
    settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
  if (muscleMultipliers) {
    return ObjectUtils_keys(muscleMultipliers).filter(
      (m) => muscleMultipliers[m] === 1,
    );
  } else {
    return Exercise_defaultTargetMuscles(type, settings);
  }
}

export function Exercise_defaultTargetMusclesGroups(
  type: IExerciseType,
  settings: ISettings,
): IScreenMuscle[] {
  const muscles = Exercise_defaultTargetMuscles(type, settings);
  const allMuscleGroups = new Set<IScreenMuscle>();
  for (const muscle of muscles) {
    const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
    for (const muscleGroup of muscleGroups) {
      allMuscleGroups.add(muscleGroup);
    }
  }
  return Array.from(allMuscleGroups);
}

export function Exercise_targetMusclesGroups(
  type: IExerciseType,
  settings: ISettings,
): IScreenMuscle[] {
  const muscles = Exercise_targetMuscles(type, settings);
  const allMuscleGroups = new Set<IScreenMuscle>();
  for (const muscle of muscles) {
    const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
    for (const muscleGroup of muscleGroups) {
      allMuscleGroups.add(muscleGroup);
    }
  }
  return Array.from(allMuscleGroups);
}

export function Exercise_defaultSynergistMuscleMultipliers(
  type: IExerciseType,
  settings: ISettings,
): IMuscleMultiplier[] {
  const customExercise = settings.exercises[type.id];
  if (customExercise) {
    return customExercise.meta.synergistMuscles.map((m) => ({
      muscle: m,
      multiplier: settings.planner.synergistMultiplier,
    }));
  } else {
    const meta = Exercise_getMetadata(type.id);
    return meta?.synergistMuscles != null
      ? meta.synergistMuscles.map((m) => {
          return {
            muscle: m,
            multiplier: settings.planner.synergistMultiplier,
          };
        })
      : [];
  }
}

export function Exercise_defaultSynergistMuscles(
  type: IExerciseType,
  settings: ISettings,
): IMuscle[] {
  return Exercise_defaultSynergistMuscleMultipliers(type, settings).map(
    (m) => m.muscle,
  );
}

export function Exercise_synergistMuscleMultipliers(
  type: IExerciseType,
  settings: ISettings,
): IMuscleMultiplier[] {
  const muscleMultipliers =
    settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
  if (muscleMultipliers) {
    return ObjectUtils_keys(muscleMultipliers)
      .filter((m) => (muscleMultipliers[m] ?? 0) < 1)
      .map((m) => ({ muscle: m, multiplier: muscleMultipliers[m] ?? 0 }));
  } else {
    return Exercise_defaultSynergistMuscleMultipliers(type, settings);
  }
}

export function Exercise_synergistMuscles(
  type: IExerciseType,
  settings: ISettings,
): IMuscle[] {
  const muscleMultipliers =
    settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
  if (muscleMultipliers) {
    return ObjectUtils_keys(muscleMultipliers).filter(
      (m) => (muscleMultipliers[m] ?? 0) < 1,
    );
  } else {
    return Exercise_defaultSynergistMuscles(type, settings);
  }
}

export function Exercise_defaultSynergistMusclesGroups(
  type: IExerciseType,
  settings: ISettings,
): IScreenMuscle[] {
  const muscles = Exercise_defaultSynergistMuscles(type, settings);
  const allMuscleGroups = new Set<IScreenMuscle>();
  for (const muscle of muscles) {
    const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
    for (const muscleGroup of muscleGroups) {
      allMuscleGroups.add(muscleGroup);
    }
  }
  return Array.from(allMuscleGroups);
}

export function Exercise_synergistMusclesGroupMultipliers(
  type: IExerciseType,
  settings: ISettings,
): Partial<Record<IScreenMuscle, number>> {
  return Exercise_synergistMuscleMultipliers(type, settings).reduce<
    Partial<Record<IScreenMuscle, number>>
  >((memo, m) => {
    for (const muscleGroup of Muscle_getScreenMusclesFromMuscle(
      m.muscle,
      settings,
    )) {
      if (memo[muscleGroup] == null || memo[muscleGroup] < m.multiplier) {
        memo[muscleGroup] = m.multiplier;
      }
    }
    return memo;
  }, {});
}

export function Exercise_synergistMusclesGroups(
  type: IExerciseType,
  settings: ISettings,
): IScreenMuscle[] {
  const muscles = Exercise_synergistMuscles(type, settings);
  const allMuscleGroups = new Set<IScreenMuscle>();
  for (const muscle of muscles) {
    const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
    for (const muscleGroup of muscleGroups) {
      allMuscleGroups.add(muscleGroup);
    }
  }
  return Array.from(allMuscleGroups);
}

export function Exercise_toKey(type: IExerciseType): string {
  return `${type.id}${type.equipment ? `_${type.equipment}` : ""}`;
}

export function Exercise_fromKey(type: string): IExerciseType {
  const [id, equipment] = type.split("_");
  return { id: id as IExerciseId, equipment: equipment };
}

export function Exercise_defaultEquipment(
  type: IExerciseId,
  customExercises: IAllCustomExercises,
): IEquipment | undefined {
  const priorities: Record<IEquipment, IEquipment[]> = {
    barbell: ["ezbar", "trapbar", "dumbbell", "kettlebell"],
    cable: ["band", "leverageMachine"],
    dumbbell: ["barbell", "kettlebell", "bodyweight"],
    smith: ["leverageMachine", "dumbbell", "barbell", "kettlebell", "cable"],
    band: ["cable", "bodyweight", "leverageMachine", "smith"],
    kettlebell: ["dumbbell", "barbell", "cable"],
    bodyweight: ["cable", "dumbbell", "barbell", "band"],
    leverageMachine: ["smith", "cable", "dumbbell", "barbell", "kettlebell"],
    medicineball: ["bodyweight", "cable"],
    ezbar: ["barbell", "dumbbell", "cable"],
    trapbar: ["barbell", "dumbbell", "cable"],
  };

  const exercise = Exercise_getById(type, customExercises);
  const bar = exercise.defaultEquipment || "bodyweight";
  const sortedEquipment = Exercise_getMetadata(type).sortedEquipment || [];
  let equipment: IEquipment | undefined = sortedEquipment.find(
    (b) => b === bar,
  );
  equipment =
    equipment ||
    (priorities[bar] || []).find((eqp) => sortedEquipment.indexOf(eqp) !== -1);
  equipment = equipment || sortedEquipment[0];
  return equipment;
}

export function Exercise_similarRating(
  current: IExerciseType,
  e: IExercise,
  settings: ISettings,
): number {
  const tm = Exercise_targetMuscles(current, settings);
  const sm = Exercise_synergistMuscles(current, settings);
  const etm = Exercise_targetMuscles(e, settings);
  const esm = Exercise_synergistMuscles(e, settings);
  let rating = 0;
  if (e.id === current.id || (etm.length === 0 && esm.length === 0)) {
    rating = -Infinity;
  } else {
    for (const muscle of etm) {
      if (tm.indexOf(muscle) !== -1) {
        rating += 60;
      } else {
        rating -= 30;
      }
      if (sm.indexOf(muscle) !== -1) {
        rating += 20;
      }
    }
    for (const muscle of tm) {
      if (etm.indexOf(muscle) === -1) {
        rating -= 30;
      }
    }
    for (const muscle of esm) {
      if (sm.indexOf(muscle) !== -1) {
        rating += 30;
      } else {
        rating -= 15;
      }
      if (tm.indexOf(muscle) !== -1) {
        rating += 10;
      }
    }
    for (const muscle of sm) {
      if (esm.indexOf(muscle) === -1) {
        rating -= 15;
      }
    }
    if (
      e.defaultEquipment === "cable" ||
      e.defaultEquipment === "leverageMachine"
    ) {
      rating -= 20;
    }
  }
  return rating;
}

export function Exercise_similar(
  type: IExerciseType,
  settings: ISettings,
): [IExercise, number][] {
  const tm = Exercise_targetMuscles(type, settings);
  const sm = Exercise_synergistMuscles(type, settings);
  if (tm.length === 0 && sm.length === 0) {
    return [];
  }
  const rated = Exercise_all(settings.exercises).map<[IExercise, number]>(
    (e) => {
      const rating = Exercise_similarRating(type, e, settings);
      return [e, rating];
    },
  );
  rated.sort((a, b) => b[1] - a[1]);
  return rated.filter(([, r]) => r > 0);
}

export function Exercise_sortedByScreenMuscle(
  muscle: IScreenMuscle,
  settings: ISettings,
): [IExercise, number][] {
  const muscles = Muscle_getMusclesFromScreenMuscle(muscle, settings);

  const rated = Exercise_all(settings.exercises).map<[IExercise, number]>(
    (e) => {
      let rating = 0;
      const tm = Exercise_targetMuscles(e, settings);
      const sm = Exercise_synergistMuscles(e, settings);
      for (const m of tm) {
        if (muscles.indexOf(m) !== -1) {
          rating += 100;
        }
      }
      for (const m of sm) {
        if (muscles.indexOf(m) !== -1) {
          rating += 10;
        }
      }
      return [e, rating];
    },
  );
  rated.sort((a, b) => b[1] - a[1]);
  return rated.filter(([, r]) => r > 0);
}

export function Exercise_createCustomExercise(
  name: string,
  tMuscles: IMuscle[],
  sMuscles: IMuscle[],
  types: IExerciseKind[],
  smallImageUrl?: string,
  largeImageUrl?: string,
): ICustomExercise {
  const id = UidFactory_generateUid(8);
  const newExercise: ICustomExercise = {
    vtype: "custom_exercise",
    id,
    name,
    isDeleted: false,
    types,
    smallImageUrl,
    largeImageUrl,
    meta: {
      targetMuscles: tMuscles,
      synergistMuscles: sMuscles,
      bodyParts: [],
      sortedEquipment: [],
    },
  };
  return newExercise;
}

export function Exercise_editCustomExercise(
  exercise: ICustomExercise,
  name: string,
  tMuscles: IMuscle[],
  sMuscles: IMuscle[],
  types: IExerciseKind[],
  smallImageUrl?: string,
  largeImageUrl?: string,
): ICustomExercise {
  const newExercise: ICustomExercise = {
    ...exercise,
    name,
    types,
    smallImageUrl,
    largeImageUrl,
    meta: {
      ...exercise.meta,
      targetMuscles: tMuscles,
      synergistMuscles: sMuscles,
    },
  };
  return newExercise;
}

export function Exercise_deleteCustomExercise(
  allExercises: IAllCustomExercises,
  exerciseId: IExerciseId,
): IAllCustomExercises {
  const existingExercise = allExercises[exerciseId];
  if (existingExercise) {
    return {
      ...allExercises,
      [exerciseId]: { ...existingExercise, isDeleted: true },
    };
  }
  return allExercises;
}

export function Exercise_upsertCustomExercise(
  allExercises: IAllCustomExercises,
  exercise: ICustomExercise,
): IAllCustomExercises {
  exercise = { ...exercise, name: exercise.name.trim() };
  const existingExercise = allExercises[exercise.id];
  if (existingExercise) {
    return {
      ...allExercises,
      [exercise.id]: { ...existingExercise, ...exercise, isDeleted: false },
    };
  } else {
    const sameNameDeletedExercise = ObjectUtils_values(allExercises).find(
      (e) => e?.name === exercise.name && e.isDeleted,
    );
    if (sameNameDeletedExercise) {
      return {
        ...allExercises,
        [sameNameDeletedExercise.id]: {
          ...sameNameDeletedExercise,
          ...exercise,
          id: sameNameDeletedExercise.id,
          isDeleted: false,
        },
      };
    } else {
      return { ...allExercises, [exercise.id]: exercise };
    }
  }
}

export function Exercise_handleCustomExerciseChange(
  dispatch: IDispatch,
  action: "upsert" | "delete",
  exercise: ICustomExercise,
  notes: string | undefined,
  settings: ISettings,
  program?: IProgram,
): void {
  const oldExercise = settings.exercises[exercise.id];
  const ex =
    action === "upsert"
      ? Exercise_upsertCustomExercise(settings.exercises, exercise)
      : Exercise_deleteCustomExercise(settings.exercises, exercise.id);
  updateSettings(
    dispatch,
    lb<ISettings>().p("exercises").record(ex),
    "Create custom exercise",
  );
  updateSettings(
    dispatch,
    lb<ISettings>().p("exerciseData").pi(exercise.id).p("notes").record(notes),
    "Update notes",
  );
  if (program && oldExercise && oldExercise.name !== exercise.name) {
    const newProgram = Program_changeExerciseName(
      oldExercise.name,
      exercise.name,
      program,
      {
        ...settings,
        exercises: ex,
      },
    );
    EditProgram_updateProgram(dispatch, newProgram);
  }
}

export function Exercise_createOrUpdateCustomExercise(
  allExercises: IAllCustomExercises,
  name: string,
  tMuscles: IMuscle[],
  sMuscles: IMuscle[],
  types: IExerciseKind[],
  smallImageUrl?: string,
  largeImageUrl?: string,
  exercise?: ICustomExercise,
): IAllCustomExercises {
  if (exercise != null) {
    const newExercise = Exercise_editCustomExercise(
      exercise,
      name,
      tMuscles,
      sMuscles,
      types,
      smallImageUrl,
      largeImageUrl,
    );
    return { ...allExercises, [newExercise.id]: newExercise };
  } else {
    const deletedExerciseKey = ObjectUtils_keys(allExercises).find(
      (k) => allExercises[k]?.isDeleted && allExercises[k]?.name === name,
    );
    const deletedExercise =
      deletedExerciseKey != null ? allExercises[deletedExerciseKey] : undefined;
    if (deletedExercise) {
      return {
        ...allExercises,
        [deletedExercise.id]: {
          ...deletedExercise,
          name,
          types,
          smallImageUrl,
          largeImageUrl,
          isDeleted: false,
          meta: {
            targetMuscles: tMuscles,
            bodyParts: [],
            synergistMuscles: sMuscles,
          },
        },
      };
    } else {
      const newExercise = Exercise_createCustomExercise(
        name,
        tMuscles,
        sMuscles,
        types,
        smallImageUrl,
        largeImageUrl,
      );
      return { ...allExercises, [newExercise.id]: newExercise };
    }
  }
}

export function Exercise_filterExercises<T extends { name: string }>(
  allExercises: T[],
  filter: string,
): T[] {
  return allExercises.filter((e) =>
    StringUtils_fuzzySearch(filter.toLowerCase(), e.name.toLowerCase()),
  );
}

export function Exercise_sortExercises(
  allExercises: IExercise[],
  isSubstitute: boolean,
  settings: ISettings,
  filterTypes?: string[],
  currentExerciseType?: IExerciseType,
): IExercise[] {
  return CollectionUtils_sort(allExercises, (a, b) => {
    const exerciseType = currentExerciseType;
    if (isSubstitute && exerciseType) {
      const aRating = Exercise_similarRating(exerciseType, a, settings);
      const bRating = Exercise_similarRating(exerciseType, b, settings);
      return bRating - aRating;
    } else if (
      filterTypes &&
      Muscle_getAvailableMuscleGroups(settings)
        .map((m) => m.toLowerCase())
        .some(
          (t) => filterTypes.map((ft) => ft.toLowerCase()).indexOf(t) !== -1,
        )
    ) {
      const lowercaseFilterTypes = filterTypes.map((t) => t.toLowerCase());
      const aTargetMuscleGroups = Exercise_targetMusclesGroups(a, settings);
      const bTargetMuscleGroups = Exercise_targetMusclesGroups(b, settings);
      if (
        aTargetMuscleGroups.some(
          (m) => lowercaseFilterTypes.indexOf(m) !== -1,
        ) &&
        bTargetMuscleGroups.every((m) => lowercaseFilterTypes.indexOf(m) === -1)
      ) {
        return -1;
      } else if (
        bTargetMuscleGroups.some(
          (m) => lowercaseFilterTypes.indexOf(m) !== -1,
        ) &&
        aTargetMuscleGroups.every((m) => lowercaseFilterTypes.indexOf(m) === -1)
      ) {
        return 1;
      } else {
        return a.name.localeCompare(b.name);
      }
    } else {
      return a.name.localeCompare(b.name);
    }
  });
}

export function Exercise_filterExercisesByType<T extends IExerciseType>(
  allExercises: T[],
  filterTypes: string[],
  settings: ISettings,
): T[] {
  return allExercises.filter((e) => {
    const exercise = Exercise_get(e, settings.exercises);
    const targetMuscleGroups = Exercise_targetMusclesGroups(e, settings).map(
      (m) => m.toLowerCase(),
    );
    const synergistMuscleGroups = Exercise_synergistMusclesGroups(
      e,
      settings,
    ).map((m) => m.toLowerCase());
    return filterTypes
      .map((ft) => ft.toLowerCase())
      .every((ft) => {
        return (
          targetMuscleGroups.indexOf(ft) !== -1 ||
          synergistMuscleGroups.indexOf(ft) !== -1 ||
          exercise.types.map((t) => t.toLowerCase()).indexOf(ft) !== -1 ||
          equipmentName(e.equipment).toLowerCase() === ft
        );
      });
  });
}

export function Exercise_filterCustomExercises(
  customExercises: IAllCustomExercises,
  filter: string,
): IAllCustomExercises {
  return ObjectUtils_filter(customExercises, (e, v) =>
    v
      ? StringUtils_fuzzySearch(filter.toLowerCase(), v.name.toLowerCase())
      : true,
  );
}

export function Exercise_filterCustomExercisesByType(
  filterTypes: string[],
  settings: ISettings,
): IAllCustomExercises {
  return ObjectUtils_filter(settings.exercises, (_id, exercise) => {
    if (!exercise) {
      return false;
    }
    const targetMuscleGroups = Array.from(
      new Set(
        CollectionUtils_flat(
          exercise.meta.targetMuscles.map((m) =>
            Muscle_getScreenMusclesFromMuscle(m, settings),
          ),
        ),
      ),
    ).map((m) => Muscle_getMuscleGroupName(m, settings));
    const synergistMuscleGroups = Array.from(
      new Set(
        CollectionUtils_flat(
          exercise.meta.synergistMuscles.map((m) =>
            Muscle_getScreenMusclesFromMuscle(m, settings),
          ),
        ),
      ),
    ).map((m) => Muscle_getMuscleGroupName(m, settings));
    return filterTypes.every((ft) => {
      return (
        targetMuscleGroups.indexOf(ft) !== -1 ||
        synergistMuscleGroups.indexOf(ft) !== -1 ||
        (exercise.types || []).map(StringUtils_capitalize).indexOf(ft) !== -1
      );
    });
  });
}
