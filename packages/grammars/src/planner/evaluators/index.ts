import {
  evaluate,
  type IDayData,
  type IPlannerEvalResult,
  type IPlannerProgramExercise,
  type IPlannerProgramExerciseWarmupSet,
  type IPlannerProgramReuse,
  type IProgramExerciseDescriptions,
  type IProgramExerciseProgress,
  type IProgramExerciseUpdate,
  isEqualProgress,
  isEqualUpdate,
  PlannerKey_fromFullName,
  PlannerKey_fromPlannerExercise,
  PlannerProgram_generateFullText,
  PlannerProgramExercise_evaluateSetVariations,
  PlannerProgramExercise_getState,
  PlannerProgramExercise_setVariations,
  PlannerSyntaxError,
  Progress_createEmptyScriptBindings,
  validateScript,
} from "@/evaluators/plan-evaluator-minimal.ts";
import { parseBound } from "@/utils/lezer.ts";
import { ObjectUtils_isEqual, ObjectUtils_keys } from "@/utils/object.ts";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
//@todo ISettings should not be imported, this layer comes before the user settings layer
import type { ISettings } from "@/user-settings";
import { LiftoscriptSyntaxError } from "@/logic/evaluators/types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import type { IPlannerProgram, IPlannerProgramDay } from "@/program";
import { memoize } from "micro-memoize";
import { typeOf } from "@/quantities/weight.ts";

/**
 * New planner evaluation system (scaffolding).
 *
 * This intentionally does not implement evaluation yet; tests should be added
 * in parallel to drive the implementation.
 */
export function run(): unknown {
  throw new Error("Planner new-system evaluator not implemented");
}

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

function PlannerProgramExercise_buildDpRangeScript(): string {
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

function PlannerEvaluator_fillInMetadata(
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
        script: PlannerProgramExercise_buildDpRangeScript(),
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
  PlannerEvaluator_setByWeekDayExercise(
    metadata.byWeekDayExercise,
    exercise.key,
    dayData.week - 1,
    dayData.dayInWeek - 1,
    exercise,
  );
  PlannerEvaluator_setByExerciseWeekDay(
    metadata.byExerciseWeekDay,
    exercise.key,
    dayData.week - 1,
    dayData.dayInWeek - 1,
    exercise,
  );
  metadata.fullNames.add(exercise.fullName);
}

function PlannerEvaluator_evaluateDay(
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

function PlannerEvaluator_getPerDayEvaluatedWeeks(
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
        const result = PlannerEvaluator_evaluateDay(
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
              PlannerEvaluator_fillInMetadata(exercise, metadata, dayData);
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

function PlannerEvaluator_getDayIndexFromWeekAndDayInWeekIndex(
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

function PlannerEvaluator_fillRepeats(
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
          (PlannerEvaluator_getDayIndexFromWeekAndDayInWeekIndex(
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
      PlannerEvaluator_setByExerciseWeekDay(
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

function PlannerEvaluator_fillSetReuses(
  exercise: IPlannerProgramExercise,
  evaluatedWeeks: IPlannerEvalResult[][],
  weekIndex: number,
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  if (exercise.reuse && exercise.points.reuseSetPoint) {
    const reuse = exercise.reuse;
    const originalExercises = PlannerEvaluator_findOriginalExercisesAtWeekDay(
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
      PlannerEvaluator_forEachSiblingInstance(exercise, metadata, (other) => {
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
      PlannerEvaluator_forEachSiblingInstance(exercise, metadata, (other) => {
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

function PlannerEvaluator_forEachSiblingInstance(
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

function PlannerEvaluator_fillEvaluatedSetVariations(
  exercise: IPlannerProgramExercise,
): void {
  const setVariations = PlannerProgramExercise_setVariations(exercise);

  exercise.evaluatedSetVariations =
    PlannerProgramExercise_evaluateSetVariations(exercise, setVariations);
}

function PlannerEvaluator_fillDescriptions(
  exercise: IPlannerProgramExercise,
  evaluatedWeeks: IPlannerEvalResult[][],
  weekIndex: number,
  dayIndex: number,
): void {
  if (
    exercise.descriptions == null ||
    exercise.descriptions.values.length === 0
  ) {
    const lastWeekExercise = PlannerEvaluator_findLastWeekExercise(
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

function PlannerEvaluator_fillDescriptionReuses(
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
    const result = PlannerEvaluator_findReusedDescriptions(
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

function PlannerEvaluator_fillSingleProperties(
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

function PlannerEvaluator_fillProgressReuses(
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
      const originalExercises = PlannerEvaluator_findOriginalExercisesAtWeekDay(
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

function PlannerEvaluator_checkUpdateScript(
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

function PlannerEvaluator_fillUpdateReuses(
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
      const originalExercises = PlannerEvaluator_findOriginalExercisesAtWeekDay(
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

function PlannerEvaluator_postProcess(
  evaluatedWeeks: IPlannerEvalResult[][],
  settings: ISettings,
  metadata: IPlannerEvalMetadata,
): void {
  PlannerEvaluator_iterateOverExercises(
    evaluatedWeeks,
    (weekIndex, dayInWeekIndex, _, __, exercise) => {
      PlannerEvaluator_fillDescriptions(
        exercise,
        evaluatedWeeks,
        weekIndex,
        dayInWeekIndex,
      );
      PlannerEvaluator_fillRepeats(
        exercise,
        evaluatedWeeks,
        dayInWeekIndex,
        metadata.byExerciseWeekDay,
      );
      PlannerEvaluator_fillSingleProperties(exercise, metadata);
      PlannerEvaluator_checkUnknownExercises(exercise, metadata);
    },
  );

  PlannerEvaluator_iterateOverExercises(
    evaluatedWeeks,
    (weekIndex, dayInWeekIndex, _, __, exercise) => {
      PlannerEvaluator_fillSetReuses(
        exercise,
        evaluatedWeeks,
        weekIndex,
        settings,
        metadata,
      );
      PlannerEvaluator_fillDescriptionReuses(
        exercise,
        weekIndex,
        metadata.byExerciseWeekDay,
        settings,
      );
      PlannerEvaluator_fillProgressReuses(
        evaluatedWeeks,
        exercise,
        settings,
        metadata,
      );
      PlannerEvaluator_fillUpdateReuses(
        evaluatedWeeks,
        exercise,
        settings,
        metadata,
      );
      PlannerEvaluator_checkUpdateScript(exercise, settings, {
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

  PlannerEvaluator_iterateOverExercises(
    evaluatedWeeks,
    (_, __, ___, ____, exercise) => {
      PlannerEvaluator_fillEvaluatedSetVariations(exercise);
    },
  );
}

function PlannerEvaluator_checkUnknownExercises(
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

function PlannerEvaluator_findReusedDescriptions(
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

function PlannerEvaluator_findOriginalExercisesAtWeekDay(
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

function PlannerEvaluator_findLastWeekExercise(
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

function PlannerEvaluator_setByExerciseWeekDay<
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

function PlannerEvaluator_setByWeekDayExercise<
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

function PlannerEvaluator_iterateOverExercises(
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
  const { evaluatedWeeks, metadata } = PlannerEvaluator_getPerDayEvaluatedWeeks(
    plannerProgram,
    settings,
  );
  PlannerEvaluator_postProcess(evaluatedWeeks, settings, metadata);
  return { evaluatedWeeks, exerciseFullNames: Array.from(metadata.fullNames) };
};

export const PlannerEvaluator_evaluate = memoize(
  PlannerEvaluator_forceEvaluate,
  {
    maxSize: 10,
    isEqual: (
      a: IPlannerProgram | ISettings,
      b: IPlannerProgram | ISettings,
    ) => {
      if (a == null || b == null) {
        return a === b;
      }
      if ("weeks" in a && "weeks" in b) {
        const aText = PlannerProgram_generateFullText(a.weeks);
        const bText = PlannerProgram_generateFullText(b.weeks);
        return aText === bText;
      } else {
        return a === b;
      }
    },
  },
);

//#endregion
