import { PlannerNodeName, type PlanNodes } from "@/planner/parsing/guards.ts";
import {
  Exercise_findByNameAndEquipment,
  type IAllCustomExercises,
} from "@/exercises";
import {
  nodeError,
  parseBound,
  SourcedSyntaxError,
  type SourcedSyntaxNode,
} from "@/utils/lezer.ts";
import { generateUid } from "@/utils/uid.ts";
import { equipmentName } from "@/equipment";
import { type IEither, isEnumValue } from "@/utils/types.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";
import { throwError } from "@/utils/errors";
import {
  IProgramMode,
  type IScriptBindings,
} from "@/logic/evaluators/types.ts";
import { validate as validateLp } from "@/planner/progression-formulas/lp.ts";
import { validate as validateDp } from "@/planner/progression-formulas/dp.ts";
import { validate as validateSum } from "@/planner/progression-formulas/sum.ts";
import { validate as validateCustom } from "@/planner/progression-formulas/custom.ts";
import { validate as validateNone } from "@/planner/progression-formulas/none.ts";
import { queryChild, queryChildren, queryTree } from "@/utils/grammars.ts";
import { parsePct, w } from "@/quantities/weight.ts";
import type {
  IProgramState,
  IRepRange,
  IScriptFunctions,
} from "@/common-types.ts";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";
//#region Forbidden imports - these imports come from higher layers or dead imports, so they should be extracted somewhere else more common to avoid circular dependencies
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import {
  errorPlannerSyntax,
  extractNameParts,
  fnArgsToStateVars,
  getIsNotUsed,
  getNodeSourceEscapedWhiteSpace,
  getOrder,
  getRepeat,
  getWeight,
  type IDayData,
  type IPlannerProgramExercise,
  type IPlannerProgramExerciseSet,
  type IPlannerProgramExerciseSetVariation,
  type IPlannerProgramExerciseSuperset,
  type IPlannerProgramExerciseWarmupSet,
  type IPlannerProgramReuse,
  type IProgramExerciseProgress,
  IProgramExerciseProgressType,
  type IProgramExerciseUpdate,
  IProgramExerciseUpdateType,
  PlannerKey_fromFullName,
  validateScript,
} from "@/evaluators/plan-evaluator-minimal.ts";
//#endregion

//@todo de-duplicate with other asserts
function assert(name: string): never {
  throw new SourcedSyntaxError(
    `Missing required nodes for ${name}, this should never happen`,
    0,
    0,
    0,
    1,
  );
}

export function evaluate(
  child: PlanNodes.ExerciseExpression,
  dayData: Readonly<IDayData>,
  createEmptyScriptBindings: () => IScriptBindings,
  createScriptFunctions: () => IScriptFunctions,
  exercises: IAllCustomExercises,
  exerciseIndex: number,
  consumeDescriptions: () => { value: string; isCurrent: boolean }[],
) {
  const nameNode = child.getChild(PlannerNodeName.ExerciseName);
  if (nameNode == null) {
    return assert("ExerciseName");
  }

  const fullName = getNodeSourceEscapedWhiteSpace(nameNode);

  let { label, name, equipment } = extractNameParts(fullName, exercises);

  const shortName = PlannerProgramExercise_shortNameFromFullName(
    fullName,
    exercises,
  );

  let notused = getIsNotUsed(child);

  const setVariations: IPlannerProgramExerciseSetVariation[] = [];
  const allSets: IPlannerProgramExerciseSet[] = [];
  let allWarmupSets: IPlannerProgramExerciseWarmupSet[] | undefined;
  let reuse: IPlannerProgramReuse | undefined;
  const repeat = getRepeat(child);
  const order = getOrder(child);
  const text = child.source.trim();
  let tags: number[] = [];
  let progress: IProgramExerciseProgress | undefined;
  let update: IProgramExerciseUpdate | undefined;
  let superset: IPlannerProgramExerciseSuperset | undefined;
  for (const sectionNode of child.getChildren(
    PlannerNodeName.ExerciseSection,
  )) {
    const section = evaluateSection(
      sectionNode,
      createEmptyScriptBindings,
      createScriptFunctions,
    );
    switch (section.type) {
      case "sets":
        allSets.push(...section.data);
        if (section.data.some((set) => set.repRange != null)) {
          setVariations.push({
            sets: section.data,
            isCurrent: section.isCurrent,
          });
        }
        break;
      case "warmup":
        allWarmupSets ??= [];
        allWarmupSets.push(...section.data);
        break;
      case "progress":
        progress = section.data;
        break;
      case "update":
        update = section.data;
        break;
      case "reuse":
        reuse = section.data;
        break;
      case "id":
        tags = tags.concat(section.data);
        break;
      case "superset":
        superset = section.data;
        break;
      case "used":
        notused = true;
        break;
      default:
        section satisfies never;
        throw new Error(`Unexpected section type`);
    }
  }

  const plannerExercise: IPlannerProgramExercise = {
    id: generateUid(8),
    key: PlannerKey_fromFullName(fullName, exercises),
    fullName,
    shortName,
    exerciseType: Exercise_findByNameAndEquipment(shortName, exercises),
    label,
    dayData,
    text,
    repeat,
    repeating: [...repeat],
    order,
    superset,
    name,
    equipment,
    exerciseIndex,
    line: child.getPointer().line,
    tags,
    notused,
    evaluatedSetVariations: [],
    setVariations,
    descriptions: {
      values: consumeDescriptions(),
    },
    warmupSets: allWarmupSets,
    reuse,
    progress,
    update,
    globals: {
      rpe: allSets.find((set) => set.repRange == null && set.rpe != null)?.rpe,
      logRpe: allSets.find((set) => set.repRange == null && set.logRpe != null)
        ?.logRpe,
      askWeight: allSets.find(
        (set) => set.repRange == null && set.askWeight != null,
      )?.askWeight,
      timer: allSets.find((set) => set.repRange == null && set.timer != null)
        ?.timer,
      percentage: allSets.find(
        (set) => set.repRange == null && set.percentage != null,
      )?.percentage,
      weight: allSets.find((set) => set.repRange == null && set.weight != null)
        ?.weight,
    },
    points: {
      fullName: nameNode.getPointer(),
      supersetPoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => n.getChild(PlannerNodeName.Superset))
        .filter((n) => n)[0]
        ?.getPointer(),
      reuseSetPoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => n.getChild(PlannerNodeName.ReuseSectionWithWeekDay))
        .filter((n) => n)[0]
        ?.getPointer(),
      progressPoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "progress" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0]
        ?.getPointer(),
      idPoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "id" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0]
        ?.getPointer(),
      updatePoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "update" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0]
        ?.getPointer(),
      warmupPoint: child
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) =>
          n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.WarmupExerciseSets),
        )
        .flat(2)
        .filter((n) => n)[0]
        ?.getPointer(),
    },
  };
  return plannerExercise;
}

function PlannerProgramExercise_shortNameFromFullName(
  fullName: string,
  exercises: IAllCustomExercises,
): string {
  const { name, equipment } = extractNameParts(fullName, exercises);

  return `${name}${equipment ? `, ${equipmentName(equipment)}` : ""}`;
}

function evaluateSet(expr: SourcedSyntaxNode): IPlannerProgramExerciseSet {
  if (expr.type.name === PlannerNodeName.ExerciseSet) {
    const setPartNodes = expr.getChildren(PlannerNodeName.SetPart);
    const setParts = setPartNodes
      .map((setPartNode) => getNodeSourceEscapedWhiteSpace(setPartNode))
      .join("");
    const repRange = getRepRange(setParts);
    const rpeNode = expr.getChild(PlannerNodeName.Rpe);
    const timerNode = expr.getChild(PlannerNodeName.Timer);
    const percentageNode = expr.getChild(PlannerNodeName.PercentageWithPlus);
    const weightNode = expr.getChild(PlannerNodeName.WeightWithPlus);
    const labelNode = expr.getChild(PlannerNodeName.SetLabel);
    const askWeightNode = expr.getChild(PlannerNodeName.AskWeight);
    const askWeight =
      askWeightNode != null ||
      (weightNode != null &&
        getNodeSourceEscapedWhiteSpace(weightNode).indexOf("+") !== -1) ||
      (percentageNode != null &&
        getNodeSourceEscapedWhiteSpace(percentageNode).indexOf("+") !== -1);
    const logRpe =
      rpeNode == null
        ? undefined
        : getNodeSourceEscapedWhiteSpace(rpeNode).indexOf("+") !== -1;
    let rpe =
      rpeNode == null
        ? undefined
        : parseFloat(
            getNodeSourceEscapedWhiteSpace(rpeNode)
              .replace("@", "")
              .replace("+", ""),
          );
    if (rpe != null && isNaN(rpe)) {
      rpe = undefined;
    }
    const timer =
      timerNode == null
        ? undefined
        : parseInt(
            getNodeSourceEscapedWhiteSpace(timerNode).replace("s", ""),
            10,
          );
    const percentage =
      percentageNode == null
        ? undefined
        : parseFloat(
            getNodeSourceEscapedWhiteSpace(percentageNode).replace(/[%+]/, ""),
          );
    const weight = getWeight(weightNode);
    const label = labelNode
      ? queryChildren(labelNode)
          .map((n) => getNodeSourceEscapedWhiteSpace(n))
          .toArray()
          .join(" ")
      : undefined;
    if (labelNode && label && label.length > 8) {
      throw nodeError(labelNode, "Label length should be 8 chars max");
    }
    return {
      repRange,
      timer,
      logRpe,
      rpe,
      weight,
      percentage,
      label,
      askWeight,
    };
  } else {
    assert(PlannerNodeName.ExerciseSection);
  }
}

function evaluateId(expr: SourcedSyntaxNode): number[] {
  if (expr.type.name === PlannerNodeName.ExerciseProperty) {
    const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
    if (valueNode == null) {
      throw errorPlannerSyntax(`Missing value for the property 'id'`, expr);
    }
    const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
    if (fnNameNode == null) {
      assert(PlannerNodeName.FunctionName);
    }
    const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
    if (["tags"].indexOf(fnName) === -1) {
      throw nodeError(fnNameNode, `There's no such id type - '${fnName}'`);
    }
    const fnArgs = valueNode
      .getChildren(PlannerNodeName.FunctionArgument)
      .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
    if (fnName === "tags") {
      if (fnArgs.length === 0) {
        throw nodeError(
          fnNameNode,
          `You should provide the list of numbers in "tags"`,
        );
      }
    }
    return fnArgs.map((t) => parseInt(t, 10)).filter((t) => !isNaN(t));
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateUpdate(expr: SourcedSyntaxNode): IProgramExerciseUpdate {
  if (expr.type.name === PlannerNodeName.ExerciseProperty) {
    const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
    if (valueNode == null) {
      throw nodeError(expr, `Missing value for the property 'update'`);
    }
    const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
    if (fnNameNode == null) {
      assert(PlannerNodeName.FunctionName);
    }
    const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
    const fnArgs = valueNode
      .getChildren(PlannerNodeName.FunctionArgument)
      .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
    let script: string | undefined;
    let body: string | undefined;
    let meta: { stateKeys: Set<string> } | undefined;
    let liftoscriptNode: SourcedSyntaxNode | undefined;
    if (fnName === "custom") {
      liftoscriptNode =
        valueNode.getChild(PlannerNodeName.Liftoscript) || undefined;
      script = liftoscriptNode ? liftoscriptNode.source : undefined;
      if (fnArgs.length > 0) {
        throw nodeError(
          fnNameNode,
          `State variables for the update script are taken from "progress" block`,
        );
      }
      const reuseLiftoscriptNode = valueNode
        .getChild(PlannerNodeName.ReuseLiftoscript)
        ?.getChild(PlannerNodeName.ReuseSection)
        ?.getChild(PlannerNodeName.ExerciseName);
      body = reuseLiftoscriptNode
        ? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
        : undefined;
      if (script) {
        const allKeys = queryTree(
          parseBound(LiftoscriptParser, script),
          (node) => node.type.name === NodeName.StateVariable,
        )
          .map(getStateKey)
          .filter((key) => key !== undefined);

        meta = { stateKeys: new Set(allKeys) };
      }
      if (!script && !body) {
        throw nodeError(
          valueNode,
          `'custom' update requires either to specify Liftoscript block or specify which one to reuse`,
        );
      }
      return {
        type: IProgramExerciseUpdateType.CUSTOM,
        script,
        liftoscriptNode,
        meta,
        reuse: body ? { fullName: body, source: "specific" } : undefined,
      };
    } else {
      throw nodeError(
        fnNameNode,
        `There's no such update progression exists - '${fnName}'`,
      );
    }
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateProgressImpl(
  expr: SourcedSyntaxNode,
  createEmptyScriptBindings: () => IScriptBindings,
  createScriptFunctions: () => IScriptFunctions,
): IEither<IProgramExerciseProgress, string> {
  if (expr.type.name !== PlannerNodeName.ExerciseProperty) {
    return assert(PlannerNodeName.ExerciseProperty);
  }
  const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
  if (valueNode == null) {
    if (expr.getChild(PlannerNodeName.None)) {
      return PlannerProgramExercise_buildProgress("none", []);
    }
    throw nodeError(expr, `Missing value for the property 'progress'`);
  }
  const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
  if (fnNameNode == null) {
    return assert(PlannerNodeName.FunctionName);
  }
  const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
  const fnArgs = valueNode
    .getChildren(PlannerNodeName.FunctionArgument)
    .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));

  const validatorMap: Record<
    IProgramExerciseProgressType,
    ProgressionFormulaValidator
  > = {
    [IProgramExerciseProgressType.LP]: validateLp,
    [IProgramExerciseProgressType.DP]: validateDp,
    [IProgramExerciseProgressType.SUM]: validateSum,
    [IProgramExerciseProgressType.CUSTOM]: validateCustom,
    [IProgramExerciseProgressType.NONE]: validateNone,
  };
  const validator = isEnumValue(IProgramExerciseProgressType, fnName)
    ? validatorMap[fnName]
    : function* () {
        yield nodeError(
          fnNameNode,
          `There's no such progression exists - '${fnName}'`,
        );
      };
  const [firstError] = validator(fnArgs, valueNode, (script) =>
    validateScript(
      script,
      fnArgsToStateVars(
        fnArgs.filter((a) => a !== undefined),
        (message) => throwError(nodeError(valueNode, message)),
      ).state,
      // @todo the only use case for these very drilled closures is to perform validation. MAybe the whole validator should be the closure, not these creation methods.
      createEmptyScriptBindings(),
      createScriptFunctions(),
      IProgramMode.PLANNER,
    ),
  );

  if (firstError) {
    throw firstError;
  }

  let options:
    | Parameters<typeof PlannerProgramExercise_buildProgress>[2]
    | undefined = undefined;

  if (fnName === IProgramExerciseProgressType.CUSTOM) {
    const reuseLiftoscriptNode = valueNode
      .getChild(PlannerNodeName.ReuseLiftoscript)
      ?.getChild(PlannerNodeName.ReuseSection)
      ?.getChild(PlannerNodeName.ExerciseName);
    options = {
      script: valueNode.getChild(PlannerNodeName.Liftoscript)?.source,
      reuseFullname: reuseLiftoscriptNode
        ? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
        : undefined,
    };
  }
  return PlannerProgramExercise_buildProgress(fnName, fnArgs, options);
}

function evaluateProgress(
  expr: SourcedSyntaxNode,
  createEmptyScriptBindings: () => IScriptBindings,
  createScriptFunctions: () => IScriptFunctions,
): IProgramExerciseProgress {
  const result = evaluateProgressImpl(
    expr,
    createEmptyScriptBindings,
    createScriptFunctions,
  );
  if (result.success) {
    return result.data;
  } else {
    throw nodeError(expr, result.error);
  }
}

function evaluateProperty(
  expr: SourcedSyntaxNode,
  createEmptyScriptBindings: () => IScriptBindings,
  createScriptFunctions: () => IScriptFunctions,
):
  | { type: "progress"; data: IProgramExerciseProgress }
  | { type: "update"; data: IProgramExerciseUpdate }
  | { type: "warmup"; data: IPlannerProgramExerciseWarmupSet[] }
  | { type: "id"; data: number[] }
  | { type: "used"; data: "" } {
  if (expr.type.name === PlannerNodeName.ExerciseProperty) {
    const nameNode = expr.getChild(PlannerNodeName.ExercisePropertyName);
    if (nameNode == null) {
      assert(PlannerNodeName.ExercisePropertyName);
    }
    const name = getNodeSourceEscapedWhiteSpace(nameNode);
    if (name === "progress") {
      return {
        type: "progress",
        data: evaluateProgress(
          expr,
          createEmptyScriptBindings,
          createScriptFunctions,
        ),
      };
    } else if (name === "update") {
      return {
        type: "update",
        data: evaluateUpdate(expr),
      };
    } else if (name === "warmup") {
      return { type: "warmup", data: evaluateWarmup(expr) };
    } else if (name === "id") {
      return { type: "id", data: evaluateId(expr) };
    } else if (name === "used") {
      return { type: "used", data: "" };
    } else {
      throw nodeError(nameNode, `There's no such property exists - '${name}'`);
    }
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateSection(
  expr: SourcedSyntaxNode,
  createEmptyScriptBindings: () => IScriptBindings,
  createScriptFunctions: () => IScriptFunctions,
):
  | { type: "sets"; data: IPlannerProgramExerciseSet[]; isCurrent: boolean }
  | { type: "progress"; data: IProgramExerciseProgress }
  | { type: "update"; data: IProgramExerciseUpdate }
  | { type: "id"; data: number[] }
  | { type: "reuse"; data: IPlannerProgramReuse }
  | { type: "warmup"; data: IPlannerProgramExerciseWarmupSet[] }
  | { type: "superset"; data: IPlannerProgramExerciseSuperset }
  | { type: "used"; data: "" } {
  if (expr.type.name === PlannerNodeName.ExerciseSection) {
    const reuseNode = expr.getChild(PlannerNodeName.ReuseSectionWithWeekDay);
    if (reuseNode != null) {
      return evaluateReuseNode(reuseNode);
    }
    const setsNode = expr.getChild(PlannerNodeName.ExerciseSets);
    if (setsNode != null) {
      const sets = setsNode.getChildren(PlannerNodeName.ExerciseSet);
      const isCurrent =
        setsNode.getChild(PlannerNodeName.CurrentVariation) != null;
      if (sets.length > 0) {
        return {
          type: "sets",
          data: sets.map((set) => evaluateSet(set)),
          isCurrent,
        };
      }
    }
    const superset = expr.getChild(PlannerNodeName.Superset);
    if (superset != null) {
      return evaluateSuperset(superset);
    }
    const property = expr.getChild(PlannerNodeName.ExerciseProperty);
    if (property != null) {
      return evaluateProperty(
        property,
        createEmptyScriptBindings,
        createScriptFunctions,
      );
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  } else {
    assert(PlannerNodeName.ExerciseSection);
  }
}

function evaluateWarmupSet(
  expr: SourcedSyntaxNode,
): IPlannerProgramExerciseWarmupSet {
  if (expr.type.name === PlannerNodeName.WarmupExerciseSet) {
    const setPartNodes = expr.getChildren(PlannerNodeName.WarmupSetPart);
    const setParts = setPartNodes
      .map((setPartNode) => getNodeSourceEscapedWhiteSpace(setPartNode))
      .join("");
    const { numberOfSets, reps } = getWarmupReps(setParts);
    const percentageNode = expr.getChild(PlannerNodeName.Percentage);
    const weightNode = expr.getChild(PlannerNodeName.Weight);
    const percentage =
      percentageNode == null
        ? undefined
        : parseFloat(
            getNodeSourceEscapedWhiteSpace(percentageNode).replace("%", ""),
          );
    const weight = getWeight(weightNode);
    if (percentage) {
      return {
        type: "warmup",
        reps,
        numberOfSets,
        percentage,
      };
    } else {
      return {
        type: "warmup",
        reps,
        numberOfSets,
        weight: weight!,
      };
    }
  } else {
    assert(PlannerNodeName.ExerciseSection);
  }
}

function evaluateWarmup(
  expr: SourcedSyntaxNode,
): IPlannerProgramExerciseWarmupSet[] {
  if (expr.type.name === PlannerNodeName.ExerciseProperty) {
    const none = expr.getChild(PlannerNodeName.None);
    if (none != null) {
      return [];
    }
    const setsNode = expr.getChild(PlannerNodeName.WarmupExerciseSets);
    if (setsNode != null) {
      const sets = setsNode.getChildren(PlannerNodeName.WarmupExerciseSet);
      if (sets.length > 0) {
        return sets.map((set) => evaluateWarmupSet(set));
      }
    }
    return [];
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateSuperset(expr: SourcedSyntaxNode): {
  type: "superset";
  data: IPlannerProgramExerciseSuperset;
} {
  if (expr.type.name === PlannerNodeName.Superset) {
    const exerciseNameNode = expr.getChild(PlannerNodeName.ExerciseName);
    if (exerciseNameNode != null) {
      const name = getNodeSourceEscapedWhiteSpace(exerciseNameNode);
      return {
        type: "superset",
        data: { name },
      };
    } else {
      assert(PlannerNodeName.ExerciseName);
    }
  } else {
    assert(PlannerNodeName.Superset);
  }
}
function getReuseWeekDay(weekDayNode: SourcedSyntaxNode | null): {
  week?: number;
  day?: number;
} {
  let week: number | undefined;
  let day: number | undefined;
  if (weekDayNode != null) {
    const result = weekDayNode
      .getChildren(PlannerNodeName.WeekOrDay)
      .map((n) => {
        const [child] = queryChildren(n);
        if (child?.type.name === PlannerNodeName.Int) {
          return parseInt(getNodeSourceEscapedWhiteSpace(child), 10);
        } else {
          return undefined;
        }
      });
    if (result.length === 1) {
      day = result[0];
    } else {
      week = result[0];
      day = result[1];
    }
  }
  return { week, day };
}

function evaluateReuseNode(expr: SourcedSyntaxNode): {
  type: "reuse";
  data: IPlannerProgramReuse;
} {
  if (expr.type.name === PlannerNodeName.ReuseSectionWithWeekDay) {
    const nameNode = expr
      .getChild(PlannerNodeName.ReuseSection)
      ?.getChild(PlannerNodeName.ExerciseName);
    if (nameNode == null) {
      assert(PlannerNodeName.ExerciseName);
    }
    const name = getNodeSourceEscapedWhiteSpace(nameNode);
    const { week, day } = getReuseWeekDay(
      expr.getChild(PlannerNodeName.WeekDay),
    );
    return {
      type: "reuse",
      data: { fullName: name, week, day, source: "overall" },
    };
  } else {
    assert(PlannerNodeName.ReuseSectionWithWeekDay);
  }
}

function getWarmupReps(setParts: string): {
  numberOfSets: number;
  reps: number;
} {
  let [numberOfSetsStr, repsStr] = setParts.split("x", 2);
  if (!numberOfSetsStr) {
    return { numberOfSets: 1, reps: 1 };
  }
  if (!repsStr) {
    repsStr = numberOfSetsStr;
    numberOfSetsStr = "1";
  }
  return {
    reps: parseInt(repsStr, 10),
    numberOfSets: parseInt(numberOfSetsStr, 10),
  };
}

function getRepRange(setParts: string): IRepRange | undefined {
  if (!setParts) {
    return undefined;
  }
  const [numberOfSetsStr, repRangeStr] = setParts.split("x", 2);

  const reprange = repRangeStr.split("-", 2);
  let minrepStr: string | undefined = reprange[0];
  let maxrepStr: string | undefined = reprange[1];
  if (!maxrepStr) {
    maxrepStr = minrepStr;
    minrepStr = undefined;
  }
  let isAmrap = false;
  if (maxrepStr.endsWith("+")) {
    isAmrap = true;
    maxrepStr.replace(/\+/g, "");
  }
  return {
    numberOfSets: parseInt(numberOfSetsStr, 10),
    minrep: minrepStr !== undefined ? parseInt(minrepStr, 10) : undefined,
    maxrep: parseInt(maxrepStr, 10),
    isAmrap: isAmrap,
    isQuickAddSet: numberOfSetsStr.endsWith("+"),
  };
}

function PlannerProgramExercise_buildProgress(
  type: IProgramExerciseProgressType | string,
  args: string[],
  opts: {
    reuseFullname?: string;
    script?: string;
  } = {},
): IEither<IProgramExerciseProgress, string> {
  switch (type) {
    case IProgramExerciseProgressType.LP: {
      const increment = args[0] ? parsePct(args[0]) : w`0lb`;
      const decrement = args[3] ? parsePct(args[3]) : w`0lb`;
      const state: IProgramState = {
        increment: increment ?? w`0lb`,
        successes: args[1] ? parseInt(args[1], 10) : 1,
        successCounter: args[2] ? parseInt(args[2], 10) : 0,
        decrement: decrement ?? w`0lb`,
        failures: args[4]
          ? parseInt(args[4], 10)
          : (decrement?.value ?? 0) > 0
            ? 1
            : 0,
        failureCounter: args[5] ? parseInt(args[5], 10) : 0,
      };
      const script = `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  state.successCounter += 1
  if (state.successCounter >= state.successes) {
    for (var.i in completedReps) {
      var.isInitial = weights[var.i] == 0 && completedWeights[var.i] != 0
      if (var.isInitial) {
        weights[var.i] = completedWeights[var.i] + state.increment
      } else {
        weights[var.i] += (completedWeights[var.i] - weights[var.i]) + state.increment
      }
    }
    state.successCounter = 0
    state.failureCounter = 0
  }
}
if (state.decrement > 0 && state.failures > 0) {
  if (!(completedReps >= minReps && completedRPE <= RPE)) {
    state.failureCounter += 1
    if (state.failureCounter >= state.failures) {
      weights -= state.decrement
      state.failureCounter = 0
      state.successCounter = 0
    }
  }
}`;
      return {
        success: true,
        data: {
          type,
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case IProgramExerciseProgressType.DP: {
      const increment = args[0] ? parsePct(args[0]) : w`0lb`;
      const state: IProgramState = {
        increment: increment ?? w`0lb`,
        minReps: args[1] ? parseInt(args[1], 10) : 0,
        maxReps: args[2] ? parseInt(args[2], 10) : 0,
      };
      const script = buildDpScript();
      return {
        success: true,
        data: {
          type,
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case IProgramExerciseProgressType.SUM: {
      const increment = args[1] ? parsePct(args[1]) : w`0lb`;
      const state: IProgramState = {
        reps: args[0] ? parseInt(args[0], 10) : 0,
        increment: increment ?? w`0lb`,
      };
      const script = `for (var.i in completedReps) {
if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
  weights[var.i] = completedWeights[var.i]
}
}
if (sum(completedReps) >= state.reps) {
for (var.i in completedReps) {
  weights[var.i] = completedWeights[var.i] + state.increment
}
}`;
      return {
        success: true,
        data: {
          type,
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case IProgramExerciseProgressType.CUSTOM: {
      const script = opts.script;
      let errorMessage: string | undefined;
      const { state, stateMetadata } = fnArgsToStateVars(args, (message) => {
        errorMessage = message;
      });
      if (errorMessage) {
        return {
          success: false,
          error: errorMessage,
        };
      }
      return {
        success: true,
        data: {
          type,
          state,
          stateMetadata,
          script,
          reuse: opts.reuseFullname
            ? { fullName: opts.reuseFullname, source: "specific" }
            : undefined,
        },
      };
    }
    case IProgramExerciseProgressType.NONE:
    default: {
      return {
        success: true,
        data: {
          type: IProgramExerciseProgressType.NONE,
          state: {},
          stateMetadata: {},
        },
      };
    }
  }
}

function buildDpScript(): string {
  return `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  if (completedReps >= state.maxReps) {
    reps = state.minReps
    for (var.i in completedReps) {
      var.isInitial = weights[var.i] == 0 && completedWeights[var.i] != 0
      if (var.isInitial) {
        weights[var.i] = completedWeights[var.i] + state.increment
      } else {
        weights[var.i] += (completedWeights[var.i] - weights[var.i]) + state.increment
      }
    }
  } else {
    for (var.i in completedReps) {
      reps[var.i] = completedReps[var.i] + 1 > state.maxReps ?
        state.maxReps :
        completedReps[var.i] + 1
    }
  }
}`;
}

/**
 * Gets the text of the variable attempting to be accessed on the state
 * e.g. state.foo, this would return 'foo'
 * @param expr The node to get the state key from
 */
function getStateKey(expr: SourcedSyntaxNode): string | undefined {
  return queryChild(expr, { ofType: NodeName.StateVariableIndex }) !== undefined
    ? // If there's an index, then there isn't going to be a named state key
      undefined
    : queryChild(expr, { ofType: NodeName.Keyword })?.source;
}
