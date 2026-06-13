import { parseBound, type SourcedSyntaxNode } from "@/utils/lezer.ts";
import { ObjectUtils_isEqual, ObjectUtils_keys } from "@/utils/object.ts";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
import { LiftoscriptSyntaxError } from "@/logic/evaluators/types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import type {
  IPlannerProgram,
  IPlannerProgramDay,
  IPlannerProgramWeek,
  IProgram,
} from "@/program";
import { memoize } from "micro-memoize";
import { eq, typeOf } from "@/quantities/weight.ts";
import type { IExerciseType } from "@/exercises";
import type { IEither } from "@/utils/types.ts";
import { filterUndefined } from "@/utils/collection.ts";
import { generateUid } from "@/utils/uid.ts";
import {
  PlannerNodeName,
  PlannerSyntaxError,
} from "@/planner/parsing/guards.ts";
import { queryChildren } from "@/utils/grammars.ts";
//@todo These imports are coming from higher or dead layers, which should not be imported from
import type { ISettings } from "@/user-settings";
import {
  convertToPlanner,
  evaluate,
  forExerciseInEvaluatedWeeks,
  getExercisesInProgram,
  type IDayData,
  type IEvaluatedProgram,
  type IPlannerEvalResult,
  type IPlannerExerciseEvaluatorMode,
  type IPlannerProgramExercise,
  type IPlannerProgramExerciseWarmupSet,
  type IPlannerProgramReuse,
  type IPlannerTopLineItem,
  type IProgramExerciseDescriptions,
  type IProgramExerciseProgress,
  type IProgramExerciseUpdate,
  isEqualProgress,
  isEqualUpdate,
  type IWeightChange,
  parse,
  PlannerKey_fromExerciseType,
  PlannerKey_fromFullName,
  PlannerKey_fromLabelNameAndEquipment,
  PlannerKey_fromPlannerExercise,
  PlannerProgramExercise_evaluateSetVariations,
  PlannerProgramExercise_getState,
  PlannerProgramExercise_setVariations,
  Program_create,
  Program_evaluate,
  Progress_createEmptyScriptBindings,
  validateScript,
} from "@/evaluators/plan-evaluator-minimal.ts";
import { asProgramScript2 } from "@/planner/display.ts";

//#region Planner Evaluator
type IByExercise<T> = Record<string, T>;
type IByExerciseWeekDay<T> = Record<string, Record<number, Record<number, T>>>;
type IByWeekDayExercise<T> = Record<number, Record<number, Record<string, T>>>;

interface IPlannerEvalMetadata {
  byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>;
  byWeekDayExercise: IByWeekDayExercise<IPlannerProgramExercise>;
  fullNames: Set<string>;
  notused: Set<string>;
  properties: {
    id: IByExercise<{ property: number[]; dayData: IDayData }>;
    progress: IByExercise<{
      property: IProgramExerciseProgress;
      dayData: IDayData;
    }>;
    update: IByExercise<{
      property: IProgramExerciseUpdate;
      dayData: IDayData;
    }>;
    warmup: IByExercise<{
      warmupSets: IPlannerProgramExerciseWarmupSet[];
      dayData: IDayData;
    }>;
  };
}

function buildDpRangeScript(): string {
  return `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  minReps = state.minReps
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
    minReps[var.i] = completedReps[var.i] + 1 > reps[var.i] ?
      reps[var.i] :
      completedReps[var.i] + 1
  }
}`;
}

function fillInMetadata(
  exercise: IPlannerProgramExercise,
  metadata: IPlannerEvalMetadata,
  dayData: IDayData,
): void {
  if (exercise.progress?.type === "dp") {
    const hasRange = exercise.setVariations.some((sv) =>
      sv.sets.some((s) => s.repRange?.minrep != null),
    );
    if (hasRange) {
      exercise.progress = {
        ...exercise.progress,
        script: buildDpRangeScript(),
      };
    }
  }
  if (
    metadata.byWeekDayExercise[dayData.week - 1]?.[dayData.dayInWeek - 1]?.[
      exercise.key
    ] != null
  ) {
    throw PlannerSyntaxError.fromPoint(
      exercise.fullName,
      `Exercise ${exercise.key} is already used in this day. Combine them together, or add a label to separate out.`,
      exercise.points.fullName,
    );
  }
  const tagsProp = exercise.tags;
  if (tagsProp != null && tagsProp.length > 0) {
    const existingTags = metadata.properties.id[exercise.key];
    if (
      existingTags != null &&
      !ObjectUtils_isEqual(existingTags.property, tagsProp)
    ) {
      const point = exercise.points.idPoint || exercise.points.fullName;
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `Same property 'id' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
          `week ${existingTags.dayData.week + 1}, day ${existingTags.dayData.dayInWeek + 1} ` +
          `and week ${dayData.week}, day ${dayData.dayInWeek}`,
        point,
      );
    }
    metadata.properties.id[exercise.key] = {
      property: tagsProp,
      dayData,
    };
  }

  const progressProp = exercise.progress;
  if (progressProp != null && progressProp.type !== "none") {
    const existingProgress = metadata.properties.progress[exercise.key];
    if (
      existingProgress != null &&
      !isEqualProgress(progressProp, existingProgress.property)
    ) {
      const point = exercise.points.progressPoint || exercise.points.fullName;
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `Same property 'progress' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
          `week ${existingProgress.dayData.week + 1}, day ${existingProgress.dayData.dayInWeek + 1} ` +
          `and week ${dayData.week}, day ${dayData.dayInWeek}`,
        point,
      );
    }
    metadata.properties.progress[exercise.key] = {
      property: progressProp,
      dayData,
    };
  }

  const updateProp = exercise.update;
  if (updateProp != null) {
    const existingUpdate = metadata.properties.update[exercise.key];
    if (
      existingUpdate != null &&
      !isEqualUpdate(updateProp, existingUpdate.property)
    ) {
      const point = exercise.points.updatePoint || exercise.points.fullName;
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `Same property 'update' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
          `week ${existingUpdate.dayData.week + 1}, day ${existingUpdate.dayData.dayInWeek + 1} ` +
          `and week ${dayData.week}, day ${dayData.dayInWeek}`,
        point,
      );
    }
    metadata.properties.update[exercise.key] = {
      property: updateProp,
      dayData,
    };
  }
  if (exercise.notused) {
    metadata.notused.add(exercise.key);
  }
  if (exercise.warmupSets != null) {
    const scheme = JSON.stringify(exercise.warmupSets);
    const ws = metadata.properties.warmup[exercise.key];
    if (ws != null && JSON.stringify(ws.warmupSets) !== scheme) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `Different warmup sets are specified in multiple weeks/days for exercise '${exercise.name}': both in ` +
          `week ${ws.dayData.week + 1}, day ${ws.dayData.dayInWeek + 1} ` +
          `and week ${dayData.week}, day ${dayData.dayInWeek}`,
        exercise.points.warmupPoint || exercise.points.fullName,
      );
    }
    metadata.properties.warmup[exercise.key] = {
      warmupSets: exercise.warmupSets,
      dayData,
    };
  }
  setByWeekDayExercise(
    metadata.byWeekDayExercise,
    exercise.key,
    dayData.week - 1,
    dayData.dayInWeek - 1,
    exercise,
  );
  setByExerciseWeekDay(
    metadata.byExerciseWeekDay,
    exercise.key,
    dayData.week - 1,
    dayData.dayInWeek - 1,
    exercise,
  );
  metadata.fullNames.add(exercise.fullName);
}

function evaluateDay(
  day: IPlannerProgramDay,
  dayData: IDayData,
  settings: ISettings,
): IPlannerEvalResult {
  const result = evaluate(
    parseBound(plannerExerciseParser, day.exerciseText),
    settings,
    "perday",
    dayData,
  );
  if (result.success) {
    const exercises = result.data[0]?.days[0]?.exercises || [];
    return { success: true, data: exercises };
  } else {
    return result;
  }
}

function getPerDayEvaluatedWeeks(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): {
  evaluatedWeeks: IPlannerEvalResult[][];
  metadata: IPlannerEvalMetadata;
} {
  let dayIndex = 0;
  const metadata: IPlannerEvalMetadata = {
    byExerciseWeekDay: {},
    byWeekDayExercise: {},
    fullNames: new Set(),
    notused: new Set(),
    properties: { progress: {}, update: {}, warmup: {}, id: {} },
  };
  const evaluatedWeeks: IPlannerEvalResult[][] = plannerProgram.weeks.map(
    (week, weekIndex) => {
      return week.days.map((day, dayInWeekIndex) => {
        const dayData = {
          week: weekIndex + 1,
          dayInWeek: dayInWeekIndex + 1,
          day: dayIndex + 1,
        };
        const result = evaluateDay(
          day,
          {
            week: weekIndex + 1,
            dayInWeek: dayInWeekIndex + 1,
            day: dayIndex + 1,
          },
          settings,
        );
        dayIndex += 1;
        if (result.success) {
          const exercises = result.data;
          for (const exercise of exercises) {
            try {
              fillInMetadata(exercise, metadata, dayData);
            } catch (e) {
              if (e instanceof PlannerSyntaxError) {
                return { success: false, error: e };
              } else {
                throw e;
              }
            }
          }
          return { success: true, data: exercises };
        } else {
          return result;
        }
      });
    },
  );
  return { evaluatedWeeks, metadata };
}

function getDayIndexFromWeekAndDayInWeekIndex(
  evaluatedWeeks: IPlannerEvalResult[][],
  weekIndex: number,
  dayInWeekIndex: number,
): number | undefined {
  let dayIndex = 0;
  for (let i = 0; i < evaluatedWeeks.length; i += 1) {
    const week = evaluatedWeeks[i];
    for (let j = 0; j < week.length; j += 1) {
      if (i === weekIndex && j === dayInWeekIndex) {
        return dayIndex;
      }
      dayIndex += 1;
    }
  }
  return undefined;
}

function fillRepeats(
  exercise: IPlannerProgramExercise,
  evaluatedWeeks: IPlannerEvalResult[][],
  dayInWeekIndex: number,
  byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
): void {
  for (const repeatWeek of exercise.repeat ?? []) {
    const repeatWeekIndex = repeatWeek - 1;
    if (
      byExerciseWeekDay[exercise.key]?.[repeatWeekIndex]?.[dayInWeekIndex] ==
      null
    ) {
      const dayData = {
        week: repeatWeek,
        dayInWeek: dayInWeekIndex + 1,
        day:
          (getDayIndexFromWeekAndDayInWeekIndex(
            evaluatedWeeks,
            repeatWeekIndex,
            dayInWeekIndex,
          ) ?? 0) + 1,
      };
      const repeatedExercise: IPlannerProgramExercise = {
        ...exercise,
        reuse: exercise.reuse ? { ...exercise.reuse } : undefined,
        progress: exercise.progress
          ? {
              ...exercise.progress,
              reuse: exercise.progress.reuse
                ? { ...exercise.progress.reuse }
                : undefined,
            }
          : undefined,
        update: exercise.update
          ? {
              ...exercise.update,
              reuse: exercise.update.reuse
                ? { ...exercise.update.reuse }
                : undefined,
            }
          : undefined,
        repeat: [],
        dayData,
        isRepeat: true,
      };
      setByExerciseWeekDay(
        byExerciseWeekDay,
        exercise.key,
        repeatWeekIndex,
        dayInWeekIndex,
        repeatedExercise,
      );
      const day = evaluatedWeeks[repeatWeekIndex]?.[dayInWeekIndex];
      if (day?.success) {
        day.data.push(repeatedExercise);
      }
    }
  }
}

function fillSetReuses(
  exercise: IPlannerProgramExercise,
  evaluatedWeeks: IPlannerEvalResult[][],
  weekIndex: number,
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  if (exercise.reuse && exercise.points.reuseSetPoint) {
    const reuse = exercise.reuse;
    const originalExercises = findOriginalExercisesAtWeekDay(
      settings,
      reuse.fullName,
      evaluatedWeeks,
      reuse.week ?? weekIndex + 1,
      reuse.day,
    );
    if (originalExercises.length > 1) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `There're several exercises matching, please be more specific with [week:day] syntax`,
        exercise.points.reuseSetPoint,
      );
    }
    const originalExercise = originalExercises[0];
    if (!originalExercise) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `No such exercise ${reuse.fullName} at week: ${reuse.week ?? weekIndex + 1}${
          reuse.day != null ? `, day: ${reuse.day}` : ""
        }`,
        exercise.points.reuseSetPoint,
      );
    }
    if (originalExercise.exercise.reuse?.fullName != null) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `Original exercise cannot reuse another exercise's sets x reps`,
        exercise.points.reuseSetPoint,
      );
    }
    if (
      originalExercise.exercise.progress?.reuse != null &&
      exercise.progress == null &&
      !originalExercise.exercise.notused
    ) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `This exercise doesn't specify progress - so the original USED exercise's progress cannot reuse another exercise's progress`,
        exercise.points.reuseSetPoint,
      );
    }
    if (
      originalExercise.exercise.update?.reuse != null &&
      exercise.update == null &&
      !originalExercise.exercise.notused
    ) {
      throw PlannerSyntaxError.fromPoint(
        exercise.fullName,
        `This exercise doesn't specify 'update' - so the original exercise's 'update' cannot reuse another exercise's 'update'`,
        exercise.points.reuseSetPoint,
      );
    }
    if (
      originalExercise.exercise.progress != null &&
      exercise.progress == null
    ) {
      const sharedProgressReuse: IPlannerProgramReuse = {
        fullName: originalExercise.exercise.fullName,
        source: "overall",
      };
      const originalProgress = originalExercise.exercise.progress;
      forEachSiblingInstance(exercise, metadata, (other) => {
        if (other.progress == null) {
          other.progress = {
            type: originalProgress.type,
            state: structuredClone(originalProgress.state),
            stateMetadata: structuredClone(originalProgress.stateMetadata),
            reuse: sharedProgressReuse,
          };
        }
      });
    }
    if (originalExercise.exercise.update != null && exercise.update == null) {
      const sharedUpdateReuse: IPlannerProgramReuse = {
        fullName: originalExercise.exercise.fullName,
        source: "overall",
      };
      const originalUpdate = originalExercise.exercise.update;
      forEachSiblingInstance(exercise, metadata, (other) => {
        if (other.update == null) {
          other.update = {
            type: originalUpdate.type,
            reuse: sharedUpdateReuse,
          };
        }
      });
    }

    exercise.reuse.exercise = originalExercise.exercise;
  }
}

function forEachSiblingInstance(
  exercise: IPlannerProgramExercise,
  metadata: IPlannerEvalMetadata,
  cb: (other: IPlannerProgramExercise) => void,
): void {
  const byKey = metadata.byExerciseWeekDay[exercise.key];
  if (byKey == null) {
    return;
  }
  for (const weekKey of ObjectUtils_keys(byKey)) {
    const weekEntry = byKey[weekKey as unknown as number];
    for (const dayKey of ObjectUtils_keys(weekEntry)) {
      cb(weekEntry[dayKey as unknown as number]);
    }
  }
}

function fillEvaluatedSetVariations(exercise: IPlannerProgramExercise): void {
  const setVariations = PlannerProgramExercise_setVariations(exercise);

  exercise.evaluatedSetVariations =
    PlannerProgramExercise_evaluateSetVariations(exercise, setVariations);
}

function fillDescriptions(
  exercise: IPlannerProgramExercise,
  evaluatedWeeks: IPlannerEvalResult[][],
  weekIndex: number,
  dayIndex: number,
): void {
  if (
    exercise.descriptions == null ||
    exercise.descriptions.values.length === 0
  ) {
    const lastWeekExercise = findLastWeekExercise(
      evaluatedWeeks,
      weekIndex,
      dayIndex,
      exercise,
      (ex) => ex.descriptions != null,
    );
    if (lastWeekExercise && lastWeekExercise.descriptions) {
      exercise.descriptions = structuredClone(lastWeekExercise.descriptions);
    }
  }
}

function fillDescriptionReuses(
  exercise: IPlannerProgramExercise,
  weekIndex: number,
  byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
  settings: ISettings,
): void {
  if (
    exercise.descriptions != null &&
    exercise.descriptions.values.length === 1 &&
    exercise.descriptions.values[0].value?.startsWith("...")
  ) {
    const reusingName = exercise.descriptions.values[0].value.slice(3).trim();
    const result = findReusedDescriptions(
      reusingName,
      weekIndex,
      byExerciseWeekDay,
      settings,
    );
    if (result != null) {
      const { descriptions, exercise: originalExercise } = result;
      exercise.descriptions = {
        values: [...structuredClone(descriptions.values)],
        reuse: {
          fullName: originalExercise.fullName,
          exercise: originalExercise,
          source: "specific",
        },
      };
    }
  }
}

function fillSingleProperties(
  exercise: IPlannerProgramExercise,
  metadata: IPlannerEvalMetadata,
): void {
  if (metadata.notused.has(exercise.key)) {
    exercise.notused = true;
  }

  if (metadata.properties.progress[exercise.key] != null) {
    const existingProgress = exercise.progress;
    if (!existingProgress) {
      exercise.progress = metadata.properties.progress[exercise.key].property;
    }
  }

  if (metadata.properties.update[exercise.key] != null && !exercise.update) {
    exercise.update = metadata.properties.update[exercise.key].property;
  }

  if (metadata.properties.warmup[exercise.key] != null) {
    exercise.warmupSets = metadata.properties.warmup[exercise.key].warmupSets;
  }
}

function fillProgressReuses(
  evaluatedWeeks: IPlannerEvalResult[][],
  exercise: IPlannerProgramExercise,
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  const progress = exercise.progress;
  if (progress?.type === "custom") {
    const fullName = progress.reuse?.fullName;
    if (progress.reuse && fullName) {
      const key = PlannerKey_fromFullName(fullName, settings.exercises);
      const point = exercise.points.progressPoint || exercise.points.fullName;
      if (metadata.byExerciseWeekDay[key] == null) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `No such exercise ${fullName}`,
          point,
        );
      }
      const originalProperty = metadata.properties.progress[key];
      const dayData = originalProperty?.dayData;
      const originalProgress = originalProperty?.property;
      if (!originalProgress || !dayData) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          "Original exercise should specify progress",
          point,
        );
      }
      if (
        originalProgress.reuse?.fullName != null &&
        !originalProgress.reuse?.exercise?.notused
      ) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `Original exercise cannot reuse another progress`,
          point,
        );
      }
      if (originalProgress.type !== "custom") {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          "Original exercise should specify custom progress",
          point,
        );
      }
      const originalState = originalProgress.state;
      const state = progress.state;
      for (const stateKey of ObjectUtils_keys(originalState)) {
        const value = originalState[stateKey];
        if (state[key] != null && typeOf(value) !== typeOf(state[stateKey])) {
          throw PlannerSyntaxError.fromPoint(
            exercise.fullName,
            `Wrong type of state variable ${stateKey}`,
            point,
          );
        }
      }
      const originalExercises = findOriginalExercisesAtWeekDay(
        settings,
        fullName,
        evaluatedWeeks,
        dayData.week,
        dayData.dayInWeek,
      );
      const originalExercise = originalExercises[0]?.exercise;
      if (
        originalExercise?.reuse != null &&
        (originalExercise.progress == null ||
          originalExercise.progress.reuse != null)
      ) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `Original exercise '${originalExercise.fullName}' should not reuse other exercise`,
          point,
        );
      }
      progress.reuse.exercise = originalExercise;
    }
  }
}

function checkUpdateScript(
  exercise: IPlannerProgramExercise,
  settings: ISettings,
  dayData: IDayData,
): void {
  const update = exercise.update;
  if (update?.type === "custom") {
    const { script, liftoscriptNode } = update;
    if (script && liftoscriptNode) {
      const state = PlannerProgramExercise_getState(exercise);
      try {
        validateScript(
          script,
          state,
          Progress_createEmptyScriptBindings(dayData, settings),
          Progress_createScriptFunctions(settings),
          "update",
        );
      } catch (e) {
        if (e instanceof LiftoscriptSyntaxError && liftoscriptNode) {
          const [line] = liftoscriptNode.getLineAndOffset();
          throw new PlannerSyntaxError(
            e.message,
            line + e.line,
            e.offset,
            liftoscriptNode.from + e.from,
            liftoscriptNode.from + e.to,
          );
        } else {
          throw e;
        }
      }
    }
  }
}

function fillUpdateReuses(
  evaluatedWeeks: IPlannerEvalResult[][],
  exercise: IPlannerProgramExercise,
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  const update = exercise.update;
  if (update?.type === "custom") {
    const fullName = update.reuse?.fullName;
    if (update.reuse && fullName) {
      const key = PlannerKey_fromFullName(fullName, settings.exercises);
      const point = exercise.points.updatePoint || exercise.points.fullName;

      if (metadata.byExerciseWeekDay[key] == null) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `No such exercise ${fullName}`,
          point,
        );
      }
      const originalProperty = metadata.properties.update[key];
      const originalUpdate = originalProperty?.property;
      const dayData = originalProperty?.dayData;
      if (!originalUpdate || !dayData) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          "Original exercise should specify update",
          point,
        );
      }
      if (
        originalUpdate.reuse?.fullName != null &&
        !originalUpdate.reuse?.exercise?.notused
      ) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `Original exercise cannot reuse another update`,
          point,
        );
      }
      if (originalUpdate.type !== "custom") {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          "Original exercise should specify custom update",
          point,
        );
      }
      const stateKeys = originalUpdate.meta?.stateKeys || new Set();
      if (stateKeys.size !== 0) {
        const progress = exercise.progress;
        if (progress == null) {
          throw PlannerSyntaxError.fromPoint(
            exercise.fullName,
            "If 'update' block uses state variables, exercise should define them in 'progress' block",
            point,
          );
        }
        const state = PlannerProgramExercise_getState(exercise);
        for (const stateKey of stateKeys) {
          if (state[stateKey] == null) {
            throw PlannerSyntaxError.fromPoint(
              exercise.fullName,
              `Missing state variable ${stateKey} that's used in the original update block`,
              point,
            );
          }
        }
      }
      const originalExercises = findOriginalExercisesAtWeekDay(
        settings,
        fullName,
        evaluatedWeeks,
        dayData.week,
        dayData.dayInWeek,
      );
      const originalExercise = originalExercises[0]?.exercise;
      if (
        originalExercise?.reuse != null &&
        (originalExercise.update == null ||
          originalExercise.update.reuse != null)
      ) {
        throw PlannerSyntaxError.fromPoint(
          exercise.fullName,
          `Original exercise '${originalExercise.fullName}' should not reuse other exercise`,
          point,
        );
      }
      update.reuse.exercise = originalExercise;
    }
  }
}

function postProcess(
  evaluatedWeeks: IPlannerEvalResult[][],
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  iterateOverExercises(
    evaluatedWeeks,
    (weekIndex, dayInWeekIndex, _, __, exercise) => {
      fillDescriptions(exercise, evaluatedWeeks, weekIndex, dayInWeekIndex);
      fillRepeats(
        exercise,
        evaluatedWeeks,
        dayInWeekIndex,
        metadata.byExerciseWeekDay,
      );
      fillSingleProperties(exercise, metadata);
      checkUnknownExercises(exercise, metadata);
    },
  );

  iterateOverExercises(
    evaluatedWeeks,
    (weekIndex, dayInWeekIndex, _, __, exercise) => {
      fillSetReuses(exercise, evaluatedWeeks, weekIndex, settings, metadata);
      fillDescriptionReuses(
        exercise,
        weekIndex,
        metadata.byExerciseWeekDay,
        settings,
      );
      fillProgressReuses(evaluatedWeeks, exercise, settings, metadata);
      fillUpdateReuses(evaluatedWeeks, exercise, settings, metadata);
      checkUpdateScript(exercise, settings, {
        week: weekIndex + 1,
        dayInWeek: dayInWeekIndex + 1,
        day: dayInWeekIndex + 1,
      });
    },
  );
  for (const week of evaluatedWeeks) {
    for (const day of week) {
      if (day.success) {
        day.data.sort((ex1, ex2) => {
          if (ex1.exerciseIndex === ex2.exerciseIndex) {
            return (ex1.repeating[0] ?? 0) - (ex2.repeating[0] ?? 0);
          } else {
            return ex1.exerciseIndex - ex2.exerciseIndex;
          }
        });
      }
    }
  }

  iterateOverExercises(evaluatedWeeks, (_, __, ___, ____, exercise) => {
    fillEvaluatedSetVariations(exercise);
  });
}

function checkUnknownExercises(
  exercise: IPlannerProgramExercise,
  metadata: IPlannerEvalMetadata,
): void {
  if (exercise.exerciseType == null && !metadata.notused.has(exercise.key)) {
    throw PlannerSyntaxError.fromPoint(
      exercise.fullName,
      `Unknown exercise ${exercise.name}`,
      exercise.points.fullName,
    );
  }
}

function findReusedDescriptions(
  reusingName: string,
  currentWeekIndex: number,
  byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
  settings: ISettings,
):
  | {
      descriptions: IProgramExerciseDescriptions;
      exercise: IPlannerProgramExercise;
    }
  | undefined {
  const weekDayMatch = reusingName.match(/\[([^]+)\]/);
  let weekIndex: number | undefined;
  let dayIndex: number | undefined;
  if (weekDayMatch != null) {
    const [dayOrWeekStr, dayStr] = weekDayMatch[1].split(":");
    if (dayStr != null) {
      weekIndex = parseInt(dayOrWeekStr, 10);
      weekIndex = isNaN(weekIndex) ? undefined : weekIndex - 1;
      dayIndex = parseInt(dayStr, 10);
      dayIndex = isNaN(dayIndex) ? undefined : dayIndex - 1;
    } else {
      dayIndex = parseInt(dayOrWeekStr, 10);
      dayIndex = isNaN(dayIndex) ? undefined : dayIndex - 1;
    }
  }
  reusingName = reusingName.replace(/\[([^]+)\]/, "").trim();
  const key = PlannerKey_fromFullName(reusingName, settings.exercises);
  const weekExercises = Object.values(
    byExerciseWeekDay[key]?.[weekIndex ?? currentWeekIndex] || [],
  );
  const weekDescriptions = weekExercises.map((d) => d.descriptions);
  const index = dayIndex ?? 0;
  if (weekDescriptions[index]) {
    return {
      descriptions: weekDescriptions[index],
      exercise: weekExercises[index],
    };
  } else {
    return undefined;
  }
}

function findOriginalExercisesAtWeekDay(
  settings: ISettings,
  fullName: string,
  program: IPlannerEvalResult[][],
  atWeek: number,
  atDay?: number,
): { exercise: IPlannerProgramExercise; dayData: IDayData }[] {
  const originalExercises: {
    exercise: IPlannerProgramExercise;
    dayData: IDayData;
  }[] = [];
  const week = program[atWeek - 1];
  const candidateDays = atDay != null ? [week[atDay - 1]] : week;
  for (
    let dayInWeekIndex = 0;
    dayInWeekIndex < candidateDays.length;
    dayInWeekIndex += 1
  ) {
    const day = candidateDays[dayInWeekIndex];
    if (day == null || !day.success) {
      continue;
    }
    for (const exercise of day.data) {
      const reusingKey = PlannerKey_fromPlannerExercise(exercise, settings);
      const originalKey = PlannerKey_fromFullName(fullName, settings.exercises);
      if (reusingKey === originalKey) {
        originalExercises.push({
          exercise,
          dayData: {
            week: atWeek,
            dayInWeek: dayInWeekIndex + 1,
            day: 1,
          },
        });
      }
    }
  }
  return originalExercises;
}

function findLastWeekExercise(
  program: IPlannerEvalResult[][],
  weekIndex: number,
  dayIndex: number,
  exercise: IPlannerProgramExercise,
  cond?: (ex: IPlannerProgramExercise) => boolean,
): IPlannerProgramExercise | undefined {
  for (
    let i = weekIndex - 1, lastWeekDay = program[i]?.[dayIndex];
    i >= 0 && lastWeekDay != null;
    i -= 1, lastWeekDay = program[i]?.[dayIndex]
  ) {
    if (lastWeekDay.success) {
      const lastWeekExercise = lastWeekDay.data.find(
        (ex) => ex.key === exercise.key,
      );
      if (
        lastWeekExercise != null &&
        (cond == null || cond(lastWeekExercise))
      ) {
        return lastWeekExercise;
      }
    }
  }
  return undefined;
}

function setByExerciseWeekDay<
  T,
  U extends Record<string, Record<number, Record<number, T>>>,
>(
  coll: U,
  exercise: string,
  weekIndex: number,
  dayIndex: number,
  val: T,
): void {
  coll[exercise as keyof U] = coll[exercise as keyof U] || {};
  coll[exercise as keyof U][weekIndex] =
    coll[exercise as keyof U][weekIndex] || {};
  coll[exercise as keyof U][weekIndex][dayIndex] = val;
}

function setByWeekDayExercise<
  T,
  U extends Record<number, Record<number, Record<string, T>>>,
>(
  coll: U,
  exercise: string,
  weekIndex: number,
  dayIndex: number,
  val: T,
): void {
  coll[weekIndex] = coll[weekIndex] || {};
  coll[weekIndex][dayIndex] = coll[weekIndex][dayIndex] || {};
  coll[weekIndex][dayIndex][exercise] = val;
}

function iterateOverExercises(
  program: IPlannerEvalResult[][],
  cb: (
    weekIndex: number,
    dayInWeekIndex: number,
    dayIndex: number,
    exerciseIndex: number,
    exercise: IPlannerProgramExercise,
  ) => void,
): void {
  let dayIndex = 0;
  for (let weekIndex = 0; weekIndex < program.length; weekIndex += 1) {
    const week = program[weekIndex];
    for (
      let dayInWeekIndex = 0;
      dayInWeekIndex < week.length;
      dayInWeekIndex += 1
    ) {
      const day = week[dayInWeekIndex];
      try {
        if (day?.success) {
          const exercises = day.data;
          for (
            let exerciseIndex = 0;
            exerciseIndex < exercises.length;
            exerciseIndex += 1
          ) {
            cb(
              weekIndex,
              dayInWeekIndex,
              dayIndex,
              exerciseIndex,
              exercises[exerciseIndex],
            );
          }
        }
      } catch (e) {
        if (e instanceof PlannerSyntaxError) {
          week[dayInWeekIndex] = { success: false, error: e };
        } else {
          throw e;
        }
      }
      dayIndex += 1;
    }
  }
}

export const PlannerEvaluator_forceEvaluate = (
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): {
  evaluatedWeeks: IPlannerEvalResult[][];
  exerciseFullNames: string[];
} => {
  const { evaluatedWeeks, metadata } = getPerDayEvaluatedWeeks(
    plannerProgram,
    settings,
  );
  postProcess(evaluatedWeeks, settings, metadata);
  return { evaluatedWeeks, exerciseFullNames: Array.from(metadata.fullNames) };
};

export const PlannerEvaluator_evaluate = memoize(
  PlannerEvaluator_forceEvaluate,
  {
    maxSize: 10,
    isEqual: (
      a: IPlannerProgram | ISettings,
      b: IPlannerProgram | ISettings,
    ) =>
      a && "weeks" in a && b && "weeks" in b
        ? asProgramScript2(a) === asProgramScript2(b)
        : a === b,
  },
);

//#endregion

//#region Planner Program

export function PlannerProgram_replaceWeight(
  program: IEvaluatedProgram,
  programExerciseId: string,
  weightChanges: IWeightChange[],
): IEvaluatedProgram {
  if (
    weightChanges.every((wc) =>
      ObjectUtils_isEqual(wc.originalWeight, wc.weight),
    )
  ) {
    return program;
  }
  const newEvalutedProgram = structuredClone(program);
  forExerciseInEvaluatedWeeks(newEvalutedProgram.weeks, (ex) => {
    if (ex.key !== programExerciseId) {
      return;
    }
    for (const { sets } of ex.evaluatedSetVariations) {
      for (const set of sets) {
        set.weight =
          weightChanges.find((wc) => eq(wc.originalWeight, set.weight))
            ?.weight ?? set.weight;
      }
    }
  });
  return newEvalutedProgram;
}

function replaceExercise(
  planner: IPlannerProgram,
  key: string,
  newLabel: string | undefined,
  toExerciseType: IExerciseType | string,
  settings: ISettings,
  dayData?: IDayData,
): IPlannerProgram {
  const evaluatedProgram = structuredClone(
    Program_evaluate({ ...Program_create("Temp"), planner }, settings),
  );
  const allExercises = getExercisesInProgram(evaluatedProgram);
  let labelSuffix: string | undefined = undefined;
  let noConflicts = false;

  function getLabel(label?: string): string | undefined {
    return (newLabel ?? label) || labelSuffix
      ? filterUndefined([newLabel ?? label, labelSuffix]).join("-")
      : undefined;
  }

  if (dayData) {
    noConflicts = true;
  }

  while (!noConflicts) {
    const conflictingExercises = allExercises.filter((e) => {
      const newKey =
        typeof toExerciseType === "string"
          ? PlannerKey_fromLabelNameAndEquipment(
              getLabel(e.label),
              toExerciseType,
              undefined,
              settings.exercises,
            )
          : PlannerKey_fromExerciseType(toExerciseType, getLabel(e.label));
      return (
        e.key === newKey &&
        (!dayData ||
          (dayData.week !== e.dayData.week &&
            dayData.dayInWeek !== e.dayData.dayInWeek))
      );
    });
    if (conflictingExercises.length > 0) {
      noConflicts = false;
      labelSuffix = generateUid(3);
    } else {
      noConflicts = true;
    }
  }

  const renameMapping: Record<string, { to: string; dayData?: IDayData }> = {};
  forExerciseInEvaluatedWeeks(
    evaluatedProgram.weeks,
    (exercise, weekIndex, dayInWeekIndex) => {
      if (exercise.key === key) {
        if (
          !dayData ||
          (dayData.week === weekIndex + 1 &&
            dayData.dayInWeek === dayInWeekIndex + 1)
        ) {
          exercise.exerciseType =
            typeof toExerciseType === "string" ? undefined : toExerciseType;
          const newLabel2 = getLabel(exercise.label);
          exercise.label = newLabel2;
          if (typeof toExerciseType === "string") {
            exercise.notused = true;
            exercise.fullName = `${newLabel2 ? `${newLabel2}: ` : ""}${toExerciseType}`;
          }
          const newKey =
            typeof toExerciseType === "string"
              ? PlannerKey_fromLabelNameAndEquipment(
                  newLabel2,
                  toExerciseType,
                  undefined,
                  settings.exercises,
                )
              : PlannerKey_fromExerciseType(toExerciseType, newLabel2);
          renameMapping[exercise.key] = { to: newKey, dayData };
          exercise.key = newKey;
        }
      }
    },
  );
  return convertToPlanner(evaluatedProgram, settings, {
    renameMapping,
  });
}

export function PlannerProgram_replaceAndValidateExercise(
  program: IProgram,
  key: string,
  toExerciseType: IExerciseType,
  settings: ISettings,
  dayData?: IDayData,
): IEither<IProgram, string> {
  const newPlanner = replaceExercise(
    program.planner!,
    key,
    undefined,
    toExerciseType,
    settings,
    dayData,
  );
  const { evaluatedWeeks } = PlannerEvaluator_evaluate(newPlanner, settings);
  let error: PlannerSyntaxError | undefined;
  for (const week of evaluatedWeeks) {
    for (const day of week) {
      if (!day.success) {
        error = day.error;
        break;
      }
    }
  }
  if (error) {
    return { success: false, error: error.message };
  } else {
    return { success: true, data: { ...program, planner: newPlanner } };
  }
}

export function PlannerProgram_groupedTopLines(
  topLine: IPlannerTopLineItem[][][],
): IPlannerTopLineItem[][][][] {
  const groupedTopLine: IPlannerTopLineItem[][][][] = [];
  for (let weekIndex = 0; weekIndex < topLine.length; weekIndex += 1) {
    const topLineWeek = topLine[weekIndex];
    groupedTopLine.push([]);
    for (
      let dayInWeekIndex = 0;
      dayInWeekIndex < topLineWeek.length;
      dayInWeekIndex += 1
    ) {
      const topLineDay = topLineWeek[dayInWeekIndex];
      const group: IPlannerTopLineItem[][] = [];
      groupedTopLine[weekIndex].push(group);
      let reset = true;
      for (let lineIndex = 0; lineIndex < topLineDay.length; lineIndex += 1) {
        if (reset) {
          group.push([]);
          reset = false;
        }
        const line = topLineDay[lineIndex];
        group[group.length - 1] = group[group.length - 1] || [];
        group[group.length - 1].push(line);
        if (line.type === "exercise") {
          reset = true;
        }
      }
    }
  }
  for (const week of groupedTopLine) {
    for (const day of week) {
      day.sort((group1, group2) => {
        const ex1 = group1.find((l) => l.type === "exercise");
        const ex2 = group2.find((l) => l.type === "exercise");
        if (ex1 == null || ex2 == null) {
          return 0;
        }
        if (ex1.exerciseIndex === ex2.exerciseIndex) {
          return (ex1.repeat?.[0] ?? 0) - (ex2.repeat?.[0] ?? 0);
        } else {
          return (ex1.exerciseIndex ?? 0) - (ex2.exerciseIndex ?? 0);
        }
      });
    }
  }
  return groupedTopLine;
}

export function PlannerProgram_evaluate(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): { evaluatedWeeks: IPlannerEvalResult[][]; exerciseFullNames: string[] } {
  return PlannerEvaluator_evaluate(plannerProgram, settings);
}

export function PlannerProgram_evaluateText(
  fullProgramText: string,
): IPlannerProgramWeek[] {
  const data = evaluatePreservingSource(
    parseBound(plannerExerciseParser, fullProgramText),
    "fulltext",
  );
  const weeks: IPlannerProgramWeek[] = data.map((week) => {
    return {
      name: week.name,
      description: week.description,
      days: week.days.map((day) => {
        return {
          name: day.name,
          description: day.description,
          exerciseText: day.exercises.join("").trim(),
        };
      }),
    };
  });
  if (weeks.length === 0) {
    weeks.push({ name: "Week 1", days: [{ name: "Day 1", exerciseText: "" }] });
  }
  return weeks;
}

export function PlannerProgram_generateFullText(
  weeks: IPlannerProgramWeek[],
): string {
  return asProgramScript2({ weeks });
}

//#endregion

/**
 * Walks the program preserving raw lines (including comments) for each day’s exercise text.
 * Requires {@link IPlannerExerciseEvaluatorMode} `"fulltext"`.
 */
function evaluatePreservingSource(
  programNode: SourcedSyntaxNode,
  mode: IPlannerExerciseEvaluatorMode,
): ITextWeek[] {
  if (mode !== "fulltext") {
    throw new Error(
      'PlannerExerciseEvaluator.evaluatePreservingSource requires mode "fulltext"',
    );
  }
  if (programNode.type.name !== PlannerNodeName.Program) {
    throw new Error(`Unexpected node type ${programNode.type.name}`);
  }
  parse(programNode);

  let weeksFullText: ITextWeek[] = [];
  let ongoingLinesFullText: INonExerciseFullTextLine[] = [];
  for (const child of filterUndefined(queryChildren(programNode).toArray())) {
    if (child.type.name === PlannerNodeName.Week) {
      const weekName = child.source.replace(/^#+/, "").trim();
      const description = getWeekDayDescriptionAndFillLastDayFullText(
        ongoingLinesFullText,
        weeksFullText,
      );
      weeksFullText.push({ name: weekName, description, days: [] });
      ongoingLinesFullText = [];
    } else if (child.type.name === PlannerNodeName.Day) {
      const dayName = child.source.replace(/^#+/, "").trim();
      const description = getWeekDayDescriptionAndFillLastDayFullText(
        ongoingLinesFullText,
        weeksFullText,
      );
      weeksFullText[weeksFullText.length - 1].days.push({
        name: dayName,
        exercises: [],
        description,
      });
      ongoingLinesFullText = [];
    } else if (child.type.name === PlannerNodeName.EmptyExpression) {
      ongoingLinesFullText.push({
        type: "empty",
        line: child.source,
      });
    } else if (child.type.name === PlannerNodeName.LineComment) {
      ongoingLinesFullText.push({
        type: "comment",
        line: child.source,
      });
    } else if (child.type.name === PlannerNodeName.TripleLineComment) {
      ongoingLinesFullText.push({
        type: "triplelinecomment",
        line: child.source,
      });
    } else if (child.type.name === PlannerNodeName.ExerciseExpression) {
      const lastWeek = weeksFullText[weeksFullText.length - 1];
      const lastDay = lastWeek
        ? lastWeek.days[lastWeek.days.length - 1]
        : undefined;
      const exercises = lastDay?.exercises;
      if (exercises) {
        for (const line of ongoingLinesFullText) {
          exercises.push(line.line);
        }
        exercises.push(child.source);
        ongoingLinesFullText = [];
      }
    }
  }
  return weeksFullText;
}

function getWeekDayOngoingLinesFullText(
  ongoingLinesFullText: Readonly<INonExerciseFullTextLine[]>,
): {
  linesToPreviousExercise: INonExerciseFullTextLine[];
  nextLines: INonExerciseFullTextLine[];
} {
  const ongoingLines = [...ongoingLinesFullText];
  let anyCommentStarted = false;
  let commentStarted = false;
  const linesToPreviousExercise: INonExerciseFullTextLine[] = [];
  const nextLines: INonExerciseFullTextLine[] = [];
  for (let i = 0; i < ongoingLines.length; i++) {
    const line = ongoingLines[i];
    if (!anyCommentStarted && line?.type === "empty") {
      continue;
    }
    if (line?.type === "comment" || line?.type === "triplelinecomment") {
      anyCommentStarted = true;
    }
    if (line?.type === "comment") {
      commentStarted = true;
    }
    if (anyCommentStarted && !commentStarted) {
      linesToPreviousExercise.push(line);
    }
    if (commentStarted && line?.type === "comment") {
      nextLines.push(line);
    }
  }
  for (let i = nextLines.length - 1; i >= 0; i--) {
    const line = nextLines[i];
    if (line.type === "empty") {
      nextLines.pop();
    } else {
      break;
    }
  }
  for (let i = linesToPreviousExercise.length - 1; i >= 0; i--) {
    const line = linesToPreviousExercise[i];
    if (line.type === "empty") {
      linesToPreviousExercise.pop();
    } else {
      break;
    }
  }
  return { linesToPreviousExercise, nextLines };
}

function getWeekDayDescriptionAndFillLastDayFullText(
  ongoingLinesFullText: Readonly<INonExerciseFullTextLine[]>,
  weeksFullText: ITextWeek[],
): string | undefined {
  const { linesToPreviousExercise, nextLines } =
    getWeekDayOngoingLinesFullText(ongoingLinesFullText);
  if (linesToPreviousExercise.length > 0) {
    const lastWeek = weeksFullText.at(-1);
    const lastDay = lastWeek?.days.at(-1);
    if (lastDay) {
      lastDay.exercises.push(
        ...linesToPreviousExercise.map((line) => line.line),
      );
    }
  }
  return nextLines.length > 0
    ? nextLines
        .map((line) => line.line.replace(/^\s*\/\/\/?\s*/, "").trim())
        .join("\n")
        .trim()
    : undefined;
}

/**
 * A program parsed into days and weeks, but with the exercises left as raw source code
 */
interface ITextWeek {
  name: string;
  description?: string;
  days: {
    name: string;
    description?: string;
    exercises: string[];
  }[];
}

type INonExerciseFullTextLine = {
  type: "comment" | "triplelinecomment" | "empty";
  line: string;
};
