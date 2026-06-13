import { memoize } from "micro-memoize";
import { z } from "zod";
import type { SyntaxNode } from "@lezer/common";
import { CollectionUtils_sortBy, filterUndefined } from "../utils/collection";
import { generateUid } from "@/utils/uid.ts";
import {
  MathUtils_applyOp,
  MathUtils_roundFloat,
  MathUtils_roundTo0005,
  n,
} from "@/utils/math";
import { type IEither, is, isNumber, type OpenRecord } from "@/utils/types";
import {
  ObjectUtils_entries,
  ObjectUtils_filter,
  ObjectUtils_isEqual,
  ObjectUtils_keys,
} from "@/utils/object";
import { StringUtils_unindent } from "@/utils/string";
import type { IAssignmentOp, ILiftoscriptEvaluatorUpdate } from "@/logic/types";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";
import { NodeName } from "@/evaluators/logic-evaluator.ts";
import {
  applyOp,
  build,
  eq,
  type IDynamicWeight,
  type IWeight,
  parse as parseWeight,
  parsePct,
  percentORM,
  print,
  roundConvertTo,
  roundTo005,
  rpeMultiplier,
  rpePct,
  TDynamicWeight,
  TWeight,
  w,
} from "@/quantities/weight.ts";
import {
  type IExerciseDataValue,
  type IProgramState,
  type IScriptFnContext,
  type IScriptFunctions,
  TProgramState,
  TSet,
} from "@/common-types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import {
  Exercise_findByNameAndEquipment,
  Exercise_findByNameEquipment,
  Exercise_fullName,
  getExerciseOrDefault,
  getOrmOrStartingWeight,
  type IAllCustomExercises,
  type IExerciseType,
  isUnilateral,
  TExerciseType,
  toKey,
} from "@/exercises";
import { equipmentName } from "@/equipment";
import {
  getCurrentEquipment,
  getPreferredUnit,
  type ISettings,
} from "@/user-settings";
import {
  asPlanNodeOfTypeOrThrow,
  PlannerNodeName,
  PlannerSyntaxError,
  type TypedPlanNode,
} from "@/planner/parsing/guards.ts";
import { evaluateWeight } from "@/quantities-dynamic";
import { getAverageBodyweight, type IStats } from "@/fitness-stats";
import {
  getWarmupSets as getProgramWarmupSets,
  type IPlannerProgram,
  type IPlannerProgramDay,
  type IPlannerProgramWeek,
  type IProgram,
  type IProgramExerciseWarmupSet,
  type IProgramStateMetadata,
} from "@/program";
import {
  type ISyntaxPointer,
  parseBound,
  type SourcedSyntaxNode,
} from "@/utils/lezer.ts";
import { isEqual, omitBy, pick } from "es-toolkit";
import type { Tagged } from "type-fest";
import { run, validate } from "@/logic/evaluators";
import { queryChild, queryChildren, queryTree } from "@/utils/grammars.ts";
import { LiftoscriptSyntaxError } from "@/logic/evaluators/types.ts";
import {
  PlannerEvaluator_forceEvaluate,
  PlannerProgram_evaluate,
  PlannerProgram_groupedTopLines,
} from "@/planner/evaluators";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
import { asProgramScript } from "@/planner/display.ts";

//#region Program
interface IEvaluatedProgramDay {
  name: string;
  dayData: IDayData;
  description?: string;
  exercises: IPlannerProgramExercise[];
}

type IByTag<T> = Record<number, T>;

export interface IEvaluatedProgram {
  id: string;
  planner: IPlannerProgram;
  name: string;
  nextDay: number;
  errors: {
    error: PlannerSyntaxError;
    dayData: IDayData;
  }[];
  weeks: {
    name: string;
    description?: string;
    days: IEvaluatedProgramDay[];
  }[];
  states: IByTag<IProgramState>;
}

function Program_nextHistoryEntry(
  program: IEvaluatedProgram,
  dayData: IDayData,
  index: number,
  programExercise: IPlannerProgramExerciseWithType,
  stats: IStats,
  settings: ISettings,
): IHistoryEntry {
  const programSets = programExercise.evaluatedSetVariations.at(
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(programExercise),
  )?.sets;
  const sets =
    programSets?.map((programSet, i) => ({
      id: generateUid(6),
      reps: programSet.maxrep,
      index: i,
      minReps:
        programSet.minrep != null && programSet.minrep !== programSet.maxrep
          ? programSet.minrep
          : undefined,
      weight: ProgramSet_getEvaluatedWeight(
        programSet,
        programExercise.exerciseType,
        settings,
      ),
      isUnilateral: isUnilateral(programExercise.exerciseType, settings),
      rpe: programSet.rpe,
      timer: programSet.timer,
      logRpe: programSet.logRpe,
      askWeight: programSet.askWeight,
      originalWeight: programSet.weight,
      isAmrap: programSet.isAmrap,
      label: programSet.label,
      isCompleted: false,
      programSetIndex: i,
    })) ?? [];

  const entry: IHistoryEntry = {
    id: Progress_getEntryId(
      programExercise.exerciseType,
      programExercise.label,
    ),
    index,
    exercise: programExercise.exerciseType,
    programExerciseId: programExercise.key,
    sets,
    superset: programExercise.superset?.name,
    warmupSets: getProgramWarmupSets(
      programExercise.exerciseType,
      sets.at(0)?.weight,
      settings,
      PlannerProgramExercise_programWarmups(programExercise, settings),
    ),
  };

  return Progress_runUpdateScriptForEntry(
    entry,
    dayData,
    programExercise,
    program.states,
    -1,
    settings,
    stats,
  );
}

export function Program_nextHistoryRecordFromEvaluated(
  program: IEvaluatedProgram,
  settings: ISettings,
  stats: IStats,
  dayIndex?: number,
): IHistoryRecord {
  const day = Math.max(
    1,
    Math.min(
      getTotalDaysInProgram(program),
      Math.max(1, (dayIndex || program.nextDay) ?? 0),
    ),
  );

  const dayData = getDayData(program, day);
  const dayExercises = dayData.dayObj
    ? Program_getProgramDayUsedExercises(dayData.dayObj)
    : [];
  const week = program.weeks[dayData.week - 1];
  const isMultiweek = program.weeks.length > 1 && week != null;
  const dayName = `${isMultiweek ? `${week.name} - ` : ""}${dayData.dayObj?.name}`;
  const now = Date.now();

  return {
    id: 0,
    date: new Date().toISOString(),
    programId: program.id,
    programName: program.name,
    intervals: [],
    day,
    week: dayData.week,
    dayInWeek: dayData.dayInWeek,
    dayName,
    startTime: now,
    updatedAt: now,
    entries: CollectionUtils_sortBy(dayExercises, "order").map((exercise, i) =>
      Program_nextHistoryEntry(program, dayData, i, exercise, stats, settings),
    ),
  };
}

function Program_runFinishDayScript(
  programExercise: IPlannerProgramExercise,
  program: IEvaluatedProgram,
  dayData: IDayData,
  entry: IHistoryEntry,
  settings: ISettings,
  stats: IStats,
  userPromptedStateVars?: IProgramState,
): IEither<
  {
    state: IProgramState;
    otherStates: Record<number, IProgramState>;
    updates: ILiftoscriptEvaluatorUpdate[];
    bindings: IScriptBindings;
  },
  string
> {
  const state = PlannerProgramExercise_getState(programExercise);
  const setVariationIndex =
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(programExercise);
  const descriptionIndex =
    PlannerProgramExercise_currentDescriptionIndex(programExercise);
  const bindings = Progress_createScriptBindings(
    dayData,
    entry,
    settings,
    programExercise.evaluatedSetVariations[setVariationIndex]?.sets.length ?? 0,
    getAverageBodyweight(
      stats,
      settings.units,
      settings.graphOptions.weight?.movingAverageWindowSize,
    ),
    undefined,
    setVariationIndex + 1,
    descriptionIndex + 1,
  );
  const fns = Progress_createScriptFunctions(settings);

  const otherStates = structuredClone(program.states);

  const script =
    PlannerProgramExercise_getProgressScript(programExercise) || "";
  let updates: ILiftoscriptEvaluatorUpdate[];
  let newState: IProgramState;
  try {
    const result = run(
      script,
      {
        ...state,
        ...userPromptedStateVars,
      },
      bindings,
      fns,
      {
        exerciseType: programExercise.exerciseType,
        unit: settings.units,
        prints: [],
      },
      otherStates,
      "planner",
    );
    updates = result.updates;
    newState = result.finalState;
  } catch (e) {
    if (e instanceof SyntaxError) {
      return { success: false, error: e.message };
    } else {
      throw e;
    }
  }

  const diffOtherStates = ObjectUtils_keys(otherStates).reduce<
    IByTag<IProgramState>
  >((memo, key) => {
    if (!ObjectUtils_isEqual(otherStates[key], program.states[key])) {
      memo[key] = ObjectUtils_keys(otherStates[key]).reduce<IProgramState>(
        (memo2, key2) => {
          if (!eq(otherStates[key][key2], program.states[key][key2])) {
            memo2[key2] = otherStates[key][key2];
          }
          return memo2;
        },
        {},
      );
    }
    return memo;
  }, {});

  const stateDiff = omitBy(newState, (value, key) => state[key] === value);
  return {
    success: true,
    data: { state: stateDiff, otherStates: diffOtherStates, updates, bindings },
  };
}

function Program_getProgramExerciseForKeyAndDay(
  program: IEvaluatedProgram,
  day: number,
  key: string,
): IPlannerProgramExerciseWithType | undefined {
  const programDay = program ? getDayData(program, day).dayObj : undefined;
  const dayExercises = programDay
    ? Program_getProgramDayUsedExercises(programDay)
    : [];
  let programExercise = dayExercises.find((pe) => pe.key === key);
  if (programExercise == null) {
    const allExercises = program
      ? getExercisesInProgram(program).filter(
          (e): e is IPlannerProgramExerciseWithType =>
            e.exerciseType !== undefined,
        )
      : [];
    programExercise = allExercises.find((pe) => pe.key === key);
    if (programExercise != null) {
      programExercise = {
        ...programExercise,
        dayData: getDayData(program, day),
      };
    }
  }
  return programExercise;
}

type IExerciseData = OpenRecord<IExerciseDataValue>;
export function Program_runAllFinishDayScripts(
  program: IProgram,
  progress: IHistoryRecord,
  stats: IStats,
  settings: ISettings,
): { program: IProgram; exerciseData: IExerciseData } {
  const newEvaluatedProgram = Program_forceEvaluate(program, settings);
  if (!getDayData(newEvaluatedProgram, progress.day).dayObj) {
    return { program, exerciseData: {} };
  }

  const exerciseData: IExerciseData = {};
  const dayData = getDayData(newEvaluatedProgram, progress.day);

  for (const entry of progress.entries) {
    if (
      entry == null ||
      entry.isSuppressed ||
      entry.sets.every((s) => !s.isCompleted)
    ) {
      continue;
    }
    const programExercise =
      program && entry.programExerciseId
        ? Program_getProgramExerciseForKeyAndDay(
            newEvaluatedProgram,
            dayData.day,
            entry.programExerciseId,
          )
        : undefined;
    if (!programExercise) {
      continue;
    }
    const newStateResult = Program_runFinishDayScript(
      programExercise,
      newEvaluatedProgram,
      dayData,
      entry,
      settings,
      stats,
      progress.userPromptedStateVars?.[programExercise.key],
    );
    if (!newStateResult.success) {
      continue;
    }
    const { state, updates, bindings, otherStates } = newStateResult.data;
    const exerciseKey = toKey(entry.exercise);
    if (!eq(bindings.rm1, getOrmOrStartingWeight(entry.exercise, settings))) {
      exerciseData[exerciseKey] = {
        rm1: roundTo005(bindings.rm1),
      };
    }
    forExerciseInEvaluatedWeeks(newEvaluatedProgram.weeks, (exercise) => {
      if (exercise.key === programExercise.key && exercise.progress) {
        exercise.progress.state = {
          ...exercise.progress.state,
          ...entry.state,
          ...state,
        };
      }
    });
    ProgramExercise_applyVariables(
      programExercise.key,
      newEvaluatedProgram,
      updates,
      settings,
    );
    for (const key of ObjectUtils_keys(otherStates || {})) {
      forExerciseInEvaluatedWeeks(newEvaluatedProgram.weeks, (exercise) => {
        if (exercise.tags?.includes(Number(key)) && exercise.progress) {
          exercise.progress.state = {
            ...exercise.progress.state,
            ...otherStates[key],
          };
        }
      });
    }
  }

  return {
    program: {
      ...structuredClone(program),
      nextDay: Program_nextDay(newEvaluatedProgram, progress.day),
      planner: convertToPlanner(newEvaluatedProgram, settings),
    },
    exerciseData,
  };
}

export function getExercisesInProgram(
  evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExercise[] {
  return evaluatedProgram.weeks.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  );
}

function Program_forceEvaluate(
  program: IProgram,
  settings: ISettings,
): IEvaluatedProgram {
  const planner = program.planner;
  if (!planner) {
    return {
      id: program.id,
      planner: {
        name: program.name,
        weeks: [
          { name: "Week 1", days: [{ name: "Day 1", exerciseText: "" }] },
        ],
      },
      name: program.name,
      errors: [],
      nextDay: program.nextDay,
      weeks: [
        {
          name: "Week 1",
          days: [
            {
              name: "Day 1",
              dayData: { day: 1, week: 1, dayInWeek: 1 },
              exercises: [],
            },
          ],
        },
      ],
      states: {},
    };
  }
  const { evaluatedWeeks } = PlannerEvaluator_forceEvaluate(planner, settings);
  let dayNum = 0;
  const errors: IEvaluatedProgram["errors"] = [];
  const weeks = planner.weeks.map((week, weekIndex) => {
    const evaluatedWeek = evaluatedWeeks[weekIndex];
    const days = week.days.map((day, dayInWeekIndex) => {
      dayNum += 1;
      const evaluatedDay = evaluatedWeek[dayInWeekIndex];
      const dayData = {
        day: dayNum,
        week: weekIndex + 1,
        dayInWeek: dayInWeekIndex + 1,
      };
      const evaluatedExercises = CollectionUtils_sortBy(
        evaluatedDay.success ? evaluatedDay.data : [],
        "order",
      );
      if (!evaluatedDay.success) {
        errors.push({ error: evaluatedDay.error, dayData });
      }
      return {
        name: day.name,
        description: day.description,
        dayData,
        exercises: evaluatedExercises,
      };
    });
    return { name: week.name, description: week.description, days };
  });
  const states: IByTag<IProgramState> = {};
  forExerciseInEvaluatedResults(evaluatedWeeks, (exercise) => {
    for (const tag of exercise.tags) {
      states[tag] = {
        ...states[tag],
        ...PlannerProgramExercise_getState(exercise),
      };
    }
  });

  return {
    id: program.id,
    errors,
    planner,
    name: program.name,
    nextDay: program.nextDay,
    weeks: weeks,
    states,
  };
}

function getTotalDaysInProgram(program: IEvaluatedProgram): number {
  return program.weeks.reduce((sum, week) => sum + week.days.length, 0);
}

/**
 * Determines information about an absolute day in a program
 * @param program The program to get information about
 * @param day The absolute day to get information about
 */
function getDayData(
  program: IEvaluatedProgram,
  day: number,
): IDayData & {
  /**
   * The actual day object at this absolute day index of the program
   */
  dayObj: IEvaluatedProgramDay | undefined;
} {
  let week = 1;
  let dayInWeek = 1;
  let daysTotal = 0;
  for (let i = 0; i < program.weeks.length; i++) {
    const weekLength = program.weeks[i].days.length;
    daysTotal += weekLength;
    if (daysTotal >= day) {
      week = i + 1;
      dayInWeek = day - (daysTotal - weekLength);
      break;
    }
  }

  return {
    day,
    week,
    dayInWeek,
    dayObj: program.weeks[week - 1]?.days[dayInWeek - 1],
  };
}

function Program_getProgramDayUsedExercises(
  programDay: IEvaluatedProgramDay,
): IPlannerProgramExerciseWithType[] {
  return programDay.exercises.filter(
    (e): e is IPlannerProgramExerciseWithType =>
      !e.notused && e.exerciseType != null,
  );
}

export function Program_applyEvaluatedProgram(
  program: IProgram,
  evaluatedProgram: IEvaluatedProgram,
  settings: ISettings,
): IProgram {
  return {
    ...structuredClone(program),
    planner: convertToPlanner(evaluatedProgram, settings),
    nextDay: evaluatedProgram.nextDay,
  };
}

function Program_getProgramExercise(
  day: number,
  program?: IEvaluatedProgram,
  key?: string,
): IPlannerProgramExercise | undefined {
  if (key == null || program == null) {
    return undefined;
  }
  return getDayData(program, day).dayObj?.exercises.find((e) => e.key === key);
}

function Program_nextDay(program: IEvaluatedProgram, day?: number): number {
  const nd = (day != null ? day % getTotalDaysInProgram(program) : 0) + 1;
  return isNaN(nd) ? 1 : nd;
}

export function Program_create(name: string, id?: string): IProgram {
  return {
    id: id || generateUid(8),
    name: name,
    url: "",
    author: "",
    shortDescription: "",
    description: "",
    nextDay: 1,
    weeks: [],
    days: [{ id: generateUid(8), name: "Day 1", exercises: [] }],
    exercises: [],
    deletedDays: [],
    deletedWeeks: [],
    deletedExercises: [],
    clonedAt: Date.now(),
  };
}

export const Program_evaluate = memoize(Program_forceEvaluate, { maxSize: 10 });

//#endregion

//#region Types

const THistoryEntry = z.strictObject({
  exercise: TExerciseType,
  sets: z.array(TSet),
  warmupSets: z.array(TSet),
  index: z.number(),
  id: z.string(),
  programExerciseId: z.string().optional(),
  state: TProgramState.optional(),
  vars: TProgramState.optional(),
  notes: z.string().optional(),
  changed: z.boolean().optional(),
  isSuppressed: z.boolean().optional(),
  superset: z.string().optional(),
  updatePrints: z
    .array(z.array(z.union([z.number(), TWeight, TDynamicWeight])))
    .optional(),
});
type IHistoryEntry = z.infer<typeof THistoryEntry>;

const THistoryRecord = z.strictObject({
  date: z.string(),
  programId: z.string(),
  programName: z.string(),
  day: z.number(),
  dayName: z.string(),
  entries: z.array(THistoryEntry),
  startTime: z.number(),
  id: z.number(),
  endTime: z.number().optional(),
  week: z.number().optional(),
  dayInWeek: z.number().optional(),
  intervals: z
    .array(
      z.tuple([z.number(), z.union([z.number(), z.undefined(), z.null()])]),
    )
    .optional(),
  deletedProgramExercises: z
    .record(z.string(), z.union([z.boolean(), z.undefined()]))
    .optional(),
  userPromptedStateVars: z
    .record(z.string(), z.union([TProgramState, z.undefined()]))
    .optional(),
  changes: z.array(z.enum(["order"] as const)).optional(),
  timerSince: z.number().optional(),
  timerMode: z.enum(["warmup", "workout"]).optional(),
  timer: z.number().optional(),
  timerEntryIndex: z.number().optional(),
  timerSetIndex: z.number().optional(),
  notes: z.string().optional(),
  updatedAt: z.number().optional(),
});
type IHistoryRecord = z.infer<typeof THistoryRecord>;

export type IDayData = {
  /**
   * Which week of the program the day falls into
   * 1-indexed
   */
  week: number;
  /**
   * The absolute day of the program
   * @todo 1-indexed? 0-indexed?
   */
  day: number;
  /**
   * Which day, 1-indexed, within the week the absolute day falls into
   * e.g. If there are 2 days in a week, and the day is 3, then this is 1
   */
  dayInWeek: number;
};

//#endregion

//#region Program Exercise

export interface IWeightChange {
  originalWeight: IWeight | IDynamicWeight;
  weight: IWeight | IDynamicWeight;
  current: boolean;
}

export function ProgramExercise_weightChanges(
  program: IEvaluatedProgram,
  programExerciseKey: string,
): IWeightChange[] {
  const results: Record<string, IWeightChange> = {};
  forExerciseInEvaluatedWeeks(program.weeks, (exercise) => {
    if (exercise.key === programExerciseKey) {
      const currentVariationIndex =
        PlannerProgramExercise_currentEvaluatedSetVariationIndex(exercise);
      for (
        let variationIndex = 0;
        variationIndex < exercise.evaluatedSetVariations.length;
        variationIndex += 1
      ) {
        const variation = exercise.evaluatedSetVariations[variationIndex];
        for (
          let setIndex = 0;
          setIndex < variation.sets.length;
          setIndex += 1
        ) {
          const set = variation.sets[setIndex];
          if (set.weight) {
            const key = print(set.weight);
            results[key] = {
              originalWeight: set.weight,
              weight: set.weight,
              current:
                results[key]?.current ||
                variationIndex + 1 === currentVariationIndex,
            };
          }
        }
      }
    }
  });
  return CollectionUtils_sortBy(Object.values(results), "current", true);
}

function ProgramExercise_applyVariables(
  programExerciseKey: string,
  program: IEvaluatedProgram,
  updates: ILiftoscriptEvaluatorUpdate[],
  settings: ISettings,
): void {
  for (const update of updates) {
    const key = update.type;
    const value = update.value;
    const [week, day, variation, set] = value.target;
    let dayIndex = 0;
    for (let weekIndex = 0; weekIndex < program.weeks.length; weekIndex += 1) {
      const programWeek = program.weeks[weekIndex];
      for (
        let dayInWeekIndex = 0;
        dayInWeekIndex < programWeek.days.length;
        dayInWeekIndex += 1
      ) {
        const dayExercises = programWeek.days[dayInWeekIndex].exercises.filter(
          (e): e is IPlannerProgramExerciseWithType => e.exerciseType != null,
        );
        for (const exercise of dayExercises) {
          if (
            exercise.key !== programExerciseKey ||
            (week !== "*" && week !== weekIndex + 1) ||
            (day !== "*" && day !== dayInWeekIndex + 1)
          ) {
            continue;
          }
          switch (key) {
            case "numberOfSets": {
              const val = value.value;
              if (!isNumber(val)) break;
              exercise.evaluatedSetVariations
                .entries()
                .filter(
                  ([variationIndex]) =>
                    variation === "*" || variation === variationIndex + 1,
                )
                .forEach(([, evaluatedVariation]) => {
                  const sets = evaluatedVariation.sets;
                  const newValue = MathUtils_applyOp(
                    sets.length,
                    val,
                    value.op,
                  );
                  const lastSet = sets[sets.length - 1] || {
                    maxrep: 1,
                    weight: w`100lb`,
                    logRpe: false,
                    isAmrap: false,
                    isQuickAddSet: false,
                    askWeight: false,
                  };
                  sets.splice(newValue);
                  for (let i = sets.length; i < newValue; i += 1) {
                    sets.push(structuredClone(lastSet));
                  }
                });
              break;
            }
            case "RPE":
            case "reps":
            case "minReps":
            case "timers":
            case "weights":
            case "amraps":
            case "logrpes":
            case "askweights": {
              exercise.evaluatedSetVariations
                .entries()
                .filter(
                  ([variationIndex]) =>
                    variation === "*" || variation === variationIndex + 1,
                )
                .forEach(([, evaluatedVariation]) => {
                  for (
                    let setIndex = 0;
                    setIndex < evaluatedVariation.sets.length;
                    setIndex += 1
                  ) {
                    if (set === "*" || set === setIndex + 1) {
                      operation(
                        exercise,
                        evaluatedVariation.sets[setIndex],
                        settings,
                        (
                          {
                            RPE: "rpe",
                            reps: "maxrep",
                            minReps: "minrep",
                            timers: "timer",
                            weights: "weight",
                            amraps: "isAmrap",
                            logrpes: "logRpe",
                            askweights: "askWeight",
                          } as const
                        )[key],
                        value.value,
                        value.op,
                      );
                    }
                  }
                });
              break;
            }
            case "setVariationIndex": {
              if (!isNumber(value.value)) {
                break;
              }
              let indexValue: number;
              if (value.op === "=") {
                indexValue = value.value - 1;
              } else {
                const currentSetVariationIndex =
                  PlannerProgramExercise_currentEvaluatedSetVariationIndex(
                    exercise,
                  );
                indexValue = applyOp(
                  undefined,
                  currentSetVariationIndex,
                  value.value,
                  update.value.op,
                ) as number;
              }
              indexValue = indexValue % exercise.evaluatedSetVariations.length;
              exercise.evaluatedSetVariations.forEach(
                (s) => (s.isCurrent = false),
              );
              const sv = exercise.evaluatedSetVariations[indexValue];
              if (sv != null) {
                sv.isCurrent = true;
              }
              break;
            }
            case "descriptionIndex": {
              if (!isNumber(value.value)) {
                break;
              }
              let indexValue: number;
              if (value.op === "=") {
                indexValue = value.value - 1;
              } else {
                const currentDescriptionIndex =
                  PlannerProgramExercise_currentDescriptionIndex(exercise);
                indexValue = applyOp(
                  undefined,
                  currentDescriptionIndex,
                  value.value,
                  value.op,
                ) as number;
              }
              indexValue = indexValue % exercise.descriptions.values.length;
              exercise.descriptions.values.forEach(
                (s) => (s.isCurrent = false),
              );
              const d = exercise.descriptions.values[indexValue];
              if (d != null) {
                d.isCurrent = true;
              }
              break;
            }
            default:
              key satisfies never;
          }
        }
        dayIndex += 1;
      }
    }
  }
}

function operation(
  programExercise: IPlannerProgramExerciseWithType,
  set: IPlannerProgramExerciseEvaluatedSet,
  settings: ISettings,
  key:
    | "maxrep"
    | "minrep"
    | "weight"
    | "rpe"
    | "timer"
    | "logRpe"
    | "isAmrap"
    | "askWeight",
  value: IWeight | IDynamicWeight | number,
  op: IAssignmentOp,
): void {
  const valueToAssign = applyOp(
    getOrmOrStartingWeight(programExercise.exerciseType, settings),
    set[key] ??
      ProgramSet_getEvaluatedWeight(
        set,
        programExercise.exerciseType,
        settings,
      ),
    value,
    op,
  );

  switch (key) {
    case "weight": {
      if (is(TWeight, valueToAssign) || is(TDynamicWeight, valueToAssign)) {
        set[key] = valueToAssign;
      }
      break;
    }
    case "maxrep":
    case "minrep":
    case "timer":
    case "rpe": {
      if (isNumber(valueToAssign)) {
        set[key] = valueToAssign;
      }
      break;
    }
    case "askWeight":
    case "isAmrap":
    case "logRpe": {
      if (isNumber(valueToAssign)) {
        set[key] = valueToAssign !== 0;
      }
      break;
    }
    default:
      key satisfies never;
  }
}

//#endregion

//#region Planner Key

type PlannerKey = Tagged<string, "plannerKey">;

export function PlannerKey_fromPlannerExercise(
  plannerExercise: IPlannerProgramExercise,
  settings: ISettings,
): PlannerKey {
  return plannerExercise.exerciseType
    ? PlannerKey_fromExerciseType(
        plannerExercise.exerciseType,
        plannerExercise.label,
      )
    : PlannerKey_fromFullName(plannerExercise.fullName, settings.exercises);
}

export function PlannerKey_fromExerciseType(
  exerciseType: IExerciseType,
  label?: string,
): PlannerKey {
  return makePlannerKey(label, toKey(exerciseType));
}

export const PlannerKey_fromFullName = memoize(
  (fullName: string, exercises: IAllCustomExercises): PlannerKey => {
    const { label, name, equipment } = extractNameParts(fullName, exercises);
    return PlannerKey_fromLabelNameAndEquipment(
      label,
      name,
      equipment,
      exercises,
    );
  },
  { maxSize: 1000 },
);

export const PlannerKey_fromLabelNameAndEquipment = memoize(
  (
    label: string | undefined,
    name: string,
    equipment: string | undefined,
    exercises: IAllCustomExercises,
  ): PlannerKey => {
    const exercise = Exercise_findByNameEquipment(exercises, name, equipment);
    const key = exercise ? toKey(exercise) : name;

    return makePlannerKey(label, key);
  },
  {
    maxSize: 1000,
  },
);

function makePlannerKey(label: string | undefined, key: string): PlannerKey {
  return `${label ? `${label}-` : ""}${key}`.toLowerCase() as PlannerKey;
}

//#endregion

//#region Pages Planner Model Types
type IPlannerProgramExerciseWithType = IPlannerProgramExercise &
  Required<Pick<IPlannerProgramExercise, "exerciseType">>;

export type IPlannerProgramExercise = {
  id: string;
  key: string;
  fullName: string;
  shortName: string;
  dayData: IDayData;
  exerciseType?: IExerciseType;
  label?: string;
  exerciseIndex: number;
  repeat: number[];
  repeating: number[];
  order: number;
  isRepeat?: boolean;
  text: string;
  tags: number[];
  equipment?: string;
  name: string;
  line: number;
  reuse?: IPlannerProgramReuse;
  superset?: IPlannerProgramExerciseSuperset;
  notused?: boolean;
  evaluatedSetVariations: IPlannerProgramExerciseEvaluatedSetVariation[];
  setVariations: IPlannerProgramExerciseSetVariation[];
  warmupSets?: IPlannerProgramExerciseWarmupSet[];
  descriptions: IProgramExerciseDescriptions;
  globals: {
    logRpe?: boolean;
    rpe?: number;
    timer?: number;
    percentage?: number;
    weight?: IWeight;
    askWeight?: boolean;
  };
  progress?: IProgramExerciseProgress;
  update?: IProgramExerciseUpdate;
  points: {
    fullName: ISyntaxPointer;
    supersetPoint?: ISyntaxPointer;
    reuseSetPoint?: ISyntaxPointer;
    progressPoint?: ISyntaxPointer;
    updatePoint?: ISyntaxPointer;
    idPoint?: ISyntaxPointer;
    warmupPoint?: ISyntaxPointer;
  };
};

interface IPlannerProgramExerciseSetVariation {
  sets: IPlannerProgramExerciseSet[];
  isCurrent: boolean;
}

interface IPlannerProgramExerciseEvaluatedSetVariation {
  sets: IPlannerProgramExerciseEvaluatedSet[];
  isCurrent: boolean;
}

interface IPlannerProgramExerciseEvaluatedSet {
  maxrep?: number;
  weight?: IWeight | IDynamicWeight;
  minrep?: number;
  timer?: number;
  rpe?: number;
  logRpe: boolean;
  label?: string;
  isAmrap: boolean;
  isQuickAddSet: boolean;
  askWeight: boolean;
}

interface IPlannerProgramExerciseSet {
  repRange?: IRepRange;
  timer?: number;
  rpe?: number;
  logRpe?: boolean;
  percentage?: number;
  weight?: IWeight;
  label?: string;
  askWeight?: boolean;
}

export interface IPlannerProgramExerciseWarmupSet {
  type: "warmup";
  numberOfSets: number;
  reps: number;
  percentage?: number;
  weight?: IWeight;
}

interface IPlannerProgramExerciseSuperset {
  name: string;
}

type IPlannerProgramReuseSource = "specific" | "overall";

export interface IPlannerProgramReuse {
  fullName: string;
  source: IPlannerProgramReuseSource;
  week?: number;
  day?: number;
  exercise?: IPlannerProgramExercise;
}

type IProgramExerciseUpdateType = "custom" | "lp" | "dp" | "sum";
type IProgramExerciseProgressType = IProgramExerciseUpdateType | "none";

export interface IProgramExerciseDescriptions {
  values: {
    value: string;
    isCurrent: boolean;
  }[];
  reuse?: IPlannerProgramReuse;
}

export interface IProgramExerciseProgress {
  type: IProgramExerciseProgressType;
  state: IProgramState;
  stateMetadata: IProgramStateMetadata;
  script?: string;
  reuse?: IPlannerProgramReuse;
  liftoscriptNode?: SyntaxNode;
}

export interface IProgramExerciseUpdate {
  type: IProgramExerciseUpdateType;
  script?: string;
  reuse?: IPlannerProgramReuse;
  liftoscriptNode?: SourcedSyntaxNode;
  meta?: {
    stateKeys?: Set<string>;
  };
}

/**
 * Information about a potentially flexible number of repetitions
 * @todo rename to "IMovement"? This is more than a range of reps, it's number of sets!
 */
interface IRepRange {
  /**
   * The many times this rep range should be done
   */
  numberOfSets: number;
  /**
   * The highest number of repetitions that should be done
   */
  maxrep?: number;
  /**
   * The lowest number of repetitions that should be done
   */
  minrep?: number;
  /**
   * If true, there is no maximum, instead the movement should be done until failure
   */
  isAmrap: boolean;
  isQuickAddSet: boolean;
}

//#endregion

//#region Planner Exercise Evaluator
export interface IPlannerTopLineItem {
  type: "exercise" | "comment" | "description" | "empty";
  value: string;
  exerciseIndex?: number;
  notused?: boolean;
  order?: number;
  fullName?: string;
  repeat?: number[];
  repeatRanges?: string[];
  descriptions?: string[];
  sections?: string;
  sectionsToReuse?: string;
  used?: boolean;
}

export type IPlannerEvalResult = IEither<
  IPlannerProgramExercise[],
  PlannerSyntaxError
>;
type IPlannerEvalFullResult = IEither<
  IPlannerExerciseEvaluatorWeek[],
  PlannerSyntaxError
>;

function assert(name: string): never {
  throw new PlannerSyntaxError(
    `Missing required nodes for ${name}, this should never happen`,
    0,
    0,
    0,
    1,
  );
}

interface IPlannerExerciseEvaluatorWeek {
  name: string;
  line: number;
  days: { name: string; line: number; exercises: IPlannerProgramExercise[] }[];
}

/**
 * perday -> single-day exercise list
 * full -> full program with structured exercises
 * fulltext -> preserve raw source lines for round-trip text
 */
export type IPlannerExerciseEvaluatorMode = "perday" | "full" | "fulltext";

export function isEqualProgress(
  a: IProgramExerciseProgress,
  b: IProgramExerciseProgress,
): boolean {
  const pickA = {
    ...pick(a, ["type", "state", "stateMetadata", "script"]),
    reuse: a.reuse?.fullName,
  };
  const pickB = {
    ...pick(b, ["type", "state", "stateMetadata", "script"]),
    reuse: b.reuse?.fullName,
  };
  return isEqual(pickA, pickB);
}

export function isEqualUpdate(
  a: IProgramExerciseUpdate,
  b: IProgramExerciseUpdate,
): boolean {
  const pickA = {
    ...pick(a, ["type", "script"]),
    reuse: a.reuse?.fullName,
  };
  const pickB = {
    ...pick(b, ["type", "script"]),
    reuse: b.reuse?.fullName,
  };
  return isEqual(pickA, pickB);
}

function fnArgsToStateVars(
  fnArgs: string[],
  onError?: (message: string) => void,
): {
  state: IProgramState;
  stateMetadata: IProgramStateMetadata;
} {
  const state: IProgramState = {};
  const stateMetadata: IProgramStateMetadata = {};
  for (const value of fnArgs) {
    let [fnArgKey, fnArgValStr] = value.split(":").map((v) => v.trim());
    if (onError && (!fnArgKey || !fnArgValStr)) {
      onError(`Invalid argument ${value}`);
    }
    if (fnArgKey.endsWith("+")) {
      fnArgKey = fnArgKey.replace("+", "");
      stateMetadata[fnArgKey] = { userPrompted: true };
    } else {
      stateMetadata[fnArgKey] = { userPrompted: false };
    }
    try {
      const fnArgVal = fnArgValStr.match(/(lb|kg)/)
        ? parseWeight(fnArgValStr)
        : fnArgValStr.match(/%/)
          ? percentORM(parseFloat(fnArgValStr))
          : MathUtils_roundFloat(parseFloat(fnArgValStr), 2);
      state[fnArgKey] = fnArgVal ?? 0;
    } catch (e) {
      if (onError) {
        onError(`Invalid argument ${value}`);
      } else {
        throw e;
      }
    }
  }
  return { state, stateMetadata };
}

const extractNameParts = memoize(
  (
    str: string,
    exercises: IAllCustomExercises,
  ): { name: string; label?: string; equipment?: string } => {
    let [label, ...nameEquipmentItems] = str.split(":");
    if (nameEquipmentItems.length === 0) {
      nameEquipmentItems = [label];
      label = "";
    } else {
      label = label.trim();
    }
    const nameEquipment = nameEquipmentItems.join(":").trim();
    const matchingExercise = Exercise_findByNameAndEquipment(
      nameEquipment,
      exercises,
    );
    if (matchingExercise) {
      return {
        name: matchingExercise.name,
        label: label ? label : undefined,
        equipment: matchingExercise.equipment,
      };
    }
    return { name: nameEquipment, label: label ? label : undefined };
  },
  { maxSize: 1000 },
);

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

export const getNodeSourceEscapedWhiteSpace = (
  node: SourcedSyntaxNode,
): string => node.source.replace(/\n/g, "\\n").replace(/\t/g, "\\t");

function getWeight(expr?: SourcedSyntaxNode | null): IWeight | undefined {
  if (
    expr?.type.name === PlannerNodeName.WeightWithPlus ||
    expr?.type.name === PlannerNodeName.Weight
  ) {
    const value = getNodeSourceEscapedWhiteSpace(expr).replace("+", "");
    const unit = value.indexOf("kg") !== -1 ? "kg" : "lb";
    return build(parseFloat(value), unit);
  } else {
    return undefined;
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

export function getOrder(expr: SourcedSyntaxNode): number {
  if (expr.type.name === PlannerNodeName.ExerciseExpression) {
    const repeatNode = expr.getChild(PlannerNodeName.Repeat);
    if (repeatNode == null) {
      return 0;
    }
    for (const childNode of queryChildren(repeatNode)) {
      if (childNode.type.name === PlannerNodeName.Rep) {
        return parseInt(getNodeSourceEscapedWhiteSpace(childNode), 10);
      }
    }
    return 0;
  } else {
    assert(PlannerNodeName.ExerciseExpression);
  }
}

export function getRepeat(expr: SourcedSyntaxNode): number[] {
  if (expr.type.name === PlannerNodeName.ExerciseExpression) {
    const repeatNode = expr.getChild(PlannerNodeName.Repeat);
    if (repeatNode == null) {
      return [];
    }
    const result: Set<number> = new Set();
    for (const childNode of queryChildren(repeatNode)) {
      if (childNode.type.name === PlannerNodeName.RepRange) {
        const [from, to] = queryChildren(childNode, { atLeast: 2 }).map((n) =>
          parseInt(getNodeSourceEscapedWhiteSpace(n), 10),
        );
        for (let i = from; i <= to; i += 1) {
          result.add(i);
        }
        break;
      }
    }
    return Array.from(result).sort((a, b) => a - b);
  } else {
    assert(PlannerNodeName.ExerciseExpression);
  }
}

export function getIsNotUsed(expr: SourcedSyntaxNode): boolean {
  if (expr.type.name === PlannerNodeName.ExerciseExpression) {
    const sections = expr.getChildren(PlannerNodeName.ExerciseSection);
    for (const section of sections) {
      const properties = section.getChildren(PlannerNodeName.ExerciseProperty);
      for (const property of properties) {
        const nameNode = property.getChild(
          PlannerNodeName.ExercisePropertyName,
        );
        const name = nameNode ? nameNode.source : undefined;
        const valueNode = property.getChild(PlannerNodeName.None);
        if (name === "used" && valueNode != null) {
          return true;
        }
      }
    }
    return false;
  } else {
    assert(PlannerNodeName.ExerciseSection);
  }
}

export function errorPlannerSyntax(
  message: string,
  node: SourcedSyntaxNode,
): never {
  throw PlannerSyntaxError.fromPoint(undefined, message, node.getPointer());
}

export function parse(expr: SourcedSyntaxNode): void {
  const cursor = expr.cursor();
  do {
    if (cursor.node.type.isError) {
      errorPlannerSyntax("Syntax error", cursor.node);
    }
  } while (cursor.next());
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
      errorPlannerSyntax("Label length should be 8 chars max", labelNode);
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
      errorPlannerSyntax(`There's no such id type - '${fnName}'`, fnNameNode);
    }
    const fnArgs = valueNode
      .getChildren(PlannerNodeName.FunctionArgument)
      .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
    if (fnName === "tags") {
      if (fnArgs.length === 0) {
        errorPlannerSyntax(
          `You should provide the list of numbers in "tags"`,
          fnNameNode,
        );
      }
    }
    return fnArgs.map((t) => parseInt(t, 10)).filter((t) => !isNaN(t));
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}
function validateProgress(
  fnName: string,
  fnArgs: string[],
  fnNameNode: SourcedSyntaxNode,
  valueNode: SourcedSyntaxNode,
): void {
  if (["lp", "sum", "dp", "custom", "none"].indexOf(fnName) === -1) {
    errorPlannerSyntax(
      `There's no such progression exists - '${fnName}'`,
      fnNameNode,
    );
  }
  if (fnName === "lp") {
    if (fnArgs.length > 6) {
      errorPlannerSyntax(
        `Linear Progression 'lp' only has 6 arguments max`,
        valueNode,
      );
    } else if (
      fnArgs[0] &&
      !fnArgs[0].endsWith("lb") &&
      !fnArgs[0].endsWith("kg") &&
      !fnArgs[0].endsWith("%")
    ) {
      errorPlannerSyntax(
        `1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
        valueNode,
      );
    } else if (fnArgs[1] != null && isNaN(parseInt(fnArgs[1], 10))) {
      errorPlannerSyntax(
        `2nd argument of 'lp' should be a number of attempts - i.e. a number`,
        valueNode,
      );
    } else if (fnArgs[2] != null && isNaN(parseInt(fnArgs[2], 10))) {
      errorPlannerSyntax(
        `3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
        valueNode,
      );
    } else if (
      fnArgs[3] != null &&
      !fnArgs[3].endsWith("lb") &&
      !fnArgs[3].endsWith("kg") &&
      !fnArgs[3].endsWith("%")
    ) {
      errorPlannerSyntax(
        `4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
        valueNode,
      );
    } else if (fnArgs[4] != null && isNaN(parseInt(fnArgs[4], 10))) {
      errorPlannerSyntax(
        `5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
        valueNode,
      );
    } else if (fnArgs[5] != null && isNaN(parseInt(fnArgs[5], 10))) {
      errorPlannerSyntax(
        `6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
        valueNode,
      );
    }
  } else if (fnName === "sum") {
    if (fnArgs.length > 2) {
      errorPlannerSyntax(
        `Reps Sum Progression 'sum' only has 2 arguments max`,
        valueNode,
      );
    } else if (fnArgs[0] == null || isNaN(parseInt(fnArgs[0], 10))) {
      errorPlannerSyntax(
        `1st argument of 'sum' should be a number of reps - i.e. a number`,
        valueNode,
      );
    } else if (
      fnArgs[1] == null ||
      (!fnArgs[1].endsWith("lb") &&
        !fnArgs[1].endsWith("kg") &&
        !fnArgs[1].endsWith("%"))
    ) {
      errorPlannerSyntax(
        `2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
        valueNode,
      );
    }
  } else if (fnName === "dp") {
    if (fnArgs.length !== 3) {
      errorPlannerSyntax(
        `Double Progression 'dp' should have 3 arguments`,
        valueNode,
      );
    } else if (
      fnArgs[0] == null ||
      (!fnArgs[0].endsWith("lb") &&
        !fnArgs[0].endsWith("kg") &&
        !fnArgs[0].endsWith("%"))
    ) {
      errorPlannerSyntax(
        `1st argument of 'dp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
        valueNode,
      );
    } else if (fnArgs[1] == null || isNaN(parseInt(fnArgs[1], 10))) {
      errorPlannerSyntax(
        `2nd argument of 'dp' should be min reps in the range - i.e. a number, like 8`,
        valueNode,
      );
    } else if (fnArgs[2] == null || isNaN(parseInt(fnArgs[2], 10))) {
      errorPlannerSyntax(
        `3rd argument of 'dp' should be max reps in the range - i.e. a number, like 12`,
        valueNode,
      );
    }
  } else if (fnName === "custom") {
    const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
    const script = liftoscriptNode ? liftoscriptNode.source : undefined;
    const reuseLiftoscriptNode = valueNode
      .getChild(PlannerNodeName.ReuseLiftoscript)
      ?.getChild(PlannerNodeName.ReuseSection)
      ?.getChild(PlannerNodeName.ExerciseName);
    const body = reuseLiftoscriptNode ? reuseLiftoscriptNode.source : undefined;
    if (!script && !body) {
      errorPlannerSyntax(
        `'custom' progression requires either to specify Liftoscript block or specify which one to reuse`,
        valueNode,
      );
    }
  }
}

function evaluateUpdate(expr: SourcedSyntaxNode): IProgramExerciseUpdate {
  if (expr.type.name === PlannerNodeName.ExerciseProperty) {
    const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
    if (valueNode == null) {
      throw errorPlannerSyntax(`Missing value for the property 'update'`, expr);
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
        errorPlannerSyntax(
          `State variables for the update script are taken from "progress" block`,
          fnNameNode,
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
        errorPlannerSyntax(
          `'custom' update requires either to specify Liftoscript block or specify which one to reuse`,
          valueNode,
        );
      }
      return {
        type: "custom",
        script,
        liftoscriptNode,
        meta,
        reuse: body ? { fullName: body, source: "specific" } : undefined,
      };
    } else {
      errorPlannerSyntax(
        `There's no such update progression exists - '${fnName}'`,
        fnNameNode,
      );
    }
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateProgressImpl(
  expr: SourcedSyntaxNode,
  settings: ISettings,
  dayData: IDayData,
): IEither<IProgramExerciseProgress, string> {
  if (expr.type.name !== PlannerNodeName.ExerciseProperty) {
    return assert(PlannerNodeName.ExerciseProperty);
  }
  const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
  if (valueNode == null) {
    if (expr.getChild(PlannerNodeName.None)) {
      return PlannerProgramExercise_buildProgress("none", []);
    }
    throw errorPlannerSyntax(`Missing value for the property 'progress'`, expr);
  }
  const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
  if (fnNameNode == null) {
    return assert(PlannerNodeName.FunctionName);
  }
  const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
  const fnArgs = valueNode
    .getChildren(PlannerNodeName.FunctionArgument)
    .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
  validateProgress(fnName, fnArgs, fnNameNode, valueNode);

  let options:
    | Parameters<typeof PlannerProgramExercise_buildProgress>[2]
    | undefined = undefined;
  if (fnName === "custom") {
    const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
    const script = liftoscriptNode ? liftoscriptNode.source : undefined;
    if (script) {
      try {
        validateScript(
          script,
          fnArgsToStateVars(fnArgs, (message) =>
            errorPlannerSyntax(message, fnNameNode),
          ).state,
          Progress_createEmptyScriptBindings(dayData, settings),
          Progress_createScriptFunctions(settings),
          "planner",
        );
      } catch (e) {
        if (e instanceof LiftoscriptSyntaxError && liftoscriptNode) {
          const { line, from } = liftoscriptNode.getPointer();
          throw new PlannerSyntaxError(
            e.message,
            line + e.line,
            e.offset,
            from + e.from,
            from + e.to,
          );
        }
        throw e;
      }
    }
    const reuseLiftoscriptNode = valueNode
      .getChild(PlannerNodeName.ReuseLiftoscript)
      ?.getChild(PlannerNodeName.ReuseSection)
      ?.getChild(PlannerNodeName.ExerciseName);
    options = {
      script,
      reuseFullname: reuseLiftoscriptNode
        ? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
        : undefined,
    };
  }
  return PlannerProgramExercise_buildProgress(fnName, fnArgs, options);
}

function evaluateProgress(
  expr: SourcedSyntaxNode,
  settings: ISettings,
  dayData: IDayData,
): IProgramExerciseProgress {
  const result = evaluateProgressImpl(expr, settings, dayData);
  if (result.success) {
    return result.data;
  } else {
    throw errorPlannerSyntax(result.error, expr);
  }
}

function evaluateProperty(
  expr: SourcedSyntaxNode,
  settings: ISettings,
  dayData: IDayData,
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
        data: evaluateProgress(expr, settings, dayData),
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
      errorPlannerSyntax(
        `There's no such property exists - '${name}'`,
        nameNode,
      );
    }
  } else {
    assert(PlannerNodeName.ExerciseProperty);
  }
}

function evaluateSection(
  expr: SourcedSyntaxNode,
  settings: ISettings,
  dayData: IDayData,
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
      return evaluateProperty(property, settings, dayData);
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  } else {
    assert(PlannerNodeName.ExerciseSection);
  }
}

export function evaluate(
  programNode: SourcedSyntaxNode,
  settings: ISettings,
  mode: IPlannerExerciseEvaluatorMode,
  dayData: IDayData | undefined,
): IPlannerEvalFullResult {
  dayData ??= { day: 1, week: 1, dayInWeek: 1 };
  try {
    parse(programNode);
    if (programNode.type.name !== PlannerNodeName.Program) {
      errorPlannerSyntax(
        `Unexpected node type ${programNode.node.type.name}`,
        programNode,
      );
    }

    let weeks: IPlannerExerciseEvaluatorWeek[] = [];
    let exerciseIndex = 0;
    let latestDescriptions: string[][] = [];
    for (const child of filterUndefined(queryChildren(programNode).toArray())) {
      if (
        child.type.name === PlannerNodeName.EmptyExpression ||
        child.type.name === PlannerNodeName.TripleLineComment
      ) {
        if (latestDescriptions.length > 0) {
          latestDescriptions.push([]);
        }
      } else if (child.type.name === PlannerNodeName.Week) {
        if (mode === "perday") {
          errorPlannerSyntax(
            `You cannot specify weeks in the per-day exercise lists. Switch to the full program mode for that.`,
            child,
          );
        }
        const weekName = child.source.replace(/^#+/, "").trim();
        weeks.push({ name: weekName, line: child.getPointer().line, days: [] });
        dayData = {
          day: dayData.day,
          week: weeks.length + 1,
          dayInWeek: 0,
        };
      } else if (child.type.name === PlannerNodeName.Day) {
        if (mode === "perday") {
          errorPlannerSyntax(
            `You cannot specify days in the per-day exercise lists. Switch to the full program mode for that.`,
            child,
          );
        }
        if (weeks.length === 0) {
          errorPlannerSyntax(`You need to specify a week before a day`, child);
        }
        const dayName = child.source.replace(/^#+/, "").trim();
        weeks[weeks.length - 1].days.push({
          name: dayName,
          line: child.getPointer().line,
          exercises: [],
        });
        dayData = {
          day: dayData.day + 1,
          week: dayData.week,
          dayInWeek: (dayData.dayInWeek || 0) + 1,
        };
        exerciseIndex = 0;
      } else if (child.type.name === PlannerNodeName.LineComment) {
        const value = child.source.trim();
        if (latestDescriptions.length === 0) {
          latestDescriptions.push([]);
        }
        latestDescriptions[latestDescriptions.length - 1].push(
          value.replace(/^\/\//, ""),
        );
      } else if (child.type.name === PlannerNodeName.ExerciseExpression) {
        if (
          mode === "full" &&
          (weeks.length === 0 || weeks[weeks.length - 1].days.length === 0)
        ) {
          errorPlannerSyntax(
            `You should first define a week and a day before listing exercises.`,
            child,
          );
        } else if (weeks.length === 0) {
          weeks.push({
            name: "Week 1",
            line: 1,
            days: [{ name: "Day 1", line: 1, exercises: [] }],
          });
        }
        const nameNode = child.getChild(PlannerNodeName.ExerciseName);
        if (nameNode == null) {
          return assert("ExerciseName");
        }

        const fullName = getNodeSourceEscapedWhiteSpace(nameNode);

        let { label, name, equipment } = extractNameParts(
          fullName,
          settings.exercises,
        );
        const key = PlannerKey_fromFullName(fullName, settings.exercises);
        const shortName = PlannerProgramExercise_shortNameFromFullName(
          fullName,
          settings,
        );
        const exercise = Exercise_findByNameAndEquipment(
          shortName,
          settings.exercises,
        );
        let notused = getIsNotUsed(child);
        const sectionNodes = child.getChildren(PlannerNodeName.ExerciseSection);
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
        for (const sectionNode of sectionNodes) {
          const section = evaluateSection(sectionNode, settings, dayData);
          if (section.type === "sets") {
            allSets.push(...section.data);
            if (section.data.some((set) => set.repRange != null)) {
              setVariations.push({
                sets: section.data,
                isCurrent: section.isCurrent,
              });
            }
          } else if (section.type === "warmup") {
            allWarmupSets ??= [];
            allWarmupSets.push(...section.data);
          } else if (section.type === "progress") {
            progress = section.data;
          } else if (section.type === "update") {
            update = section.data;
          } else if (section.type === "reuse") {
            reuse = section.data;
          } else if (section.type === "id") {
            tags = tags.concat(section.data);
          } else if (section.type === "superset") {
            superset = section.data;
          } else if (section.type === "used") {
            notused = true;
          } else {
            throw new Error(`Unexpected section type`);
          }
        }
        const rpe = allSets.find(
          (set) => set.repRange == null && set.rpe != null,
        )?.rpe;
        const timer = allSets.find(
          (set) => set.repRange == null && set.timer != null,
        )?.timer;
        const percentage = allSets.find(
          (set) => set.repRange == null && set.percentage != null,
        )?.percentage;
        const weight = allSets.find(
          (set) => set.repRange == null && set.weight != null,
        )?.weight;
        const logRpe = allSets.find(
          (set) => set.repRange == null && set.logRpe != null,
        )?.logRpe;
        const askWeight = allSets.find(
          (set) => set.repRange == null && set.askWeight != null,
        )?.askWeight;
        const rawDescriptions: string[] = latestDescriptions.map((d) =>
          d.join("\n"),
        );
        const currentDescriptionIndex = rawDescriptions.findIndex((d) =>
          /^\s*!/.test(d),
        );
        let descriptions = rawDescriptions.map((d, i) => ({
          value: d.replace(/^\s*!/, ""),
          isCurrent: i === currentDescriptionIndex,
        }));
        if (descriptions.length > 1) {
          descriptions = descriptions.filter((d) => d.value);
        }
        descriptions = descriptions.map((d) => ({
          ...d,
          value: StringUtils_unindent(d.value),
        }));
        latestDescriptions = [];

        const reuseSetsNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) => n.getChild(PlannerNodeName.ReuseSectionWithWeekDay))
          .filter((n) => n)[0];

        const progressNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) => {
            const node = n
              .getChild(PlannerNodeName.ExerciseProperty)
              ?.getChild(PlannerNodeName.ExercisePropertyName);
            return node != null && node.source === "progress"
              ? node
              : undefined;
          })
          .flat(2)
          .filter((n) => n)[0];

        const updateNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) => {
            const node = n
              .getChild(PlannerNodeName.ExerciseProperty)
              ?.getChild(PlannerNodeName.ExercisePropertyName);
            return node != null && node.source === "update" ? node : undefined;
          })
          .flat(2)
          .filter((n) => n)[0];

        const idNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) => {
            const node = n
              .getChild(PlannerNodeName.ExerciseProperty)
              ?.getChild(PlannerNodeName.ExercisePropertyName);
            return node != null && node.source === "id" ? node : undefined;
          })
          .flat(2)
          .filter((n) => n)[0];

        const warmupNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) =>
            n
              .getChild(PlannerNodeName.ExerciseProperty)
              ?.getChild(PlannerNodeName.WarmupExerciseSets),
          )
          .flat(2)
          .filter((n) => n)[0];

        const supersetNode = child
          .getChildren(PlannerNodeName.ExerciseSection)
          .map((n) => n.getChild(PlannerNodeName.Superset))
          .filter((n) => n)[0];

        const plannerExercise: IPlannerProgramExercise = {
          id: generateUid(8),
          key,
          fullName,
          shortName,
          exerciseType: exercise,
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
          notused: notused,
          evaluatedSetVariations: [],
          setVariations,
          descriptions: {
            values: descriptions,
          },
          warmupSets: allWarmupSets,
          reuse,
          progress,
          update,
          globals: {
            rpe,
            logRpe,
            askWeight,
            timer,
            percentage,
            weight,
          },
          points: {
            fullName: nameNode.getPointer(),
            supersetPoint: supersetNode?.getPointer(),
            reuseSetPoint: reuseSetsNode?.getPointer(),
            progressPoint: progressNode?.getPointer(),
            idPoint: idNode?.getPointer(),
            updatePoint: updateNode?.getPointer(),
            warmupPoint: warmupNode?.getPointer(),
          },
        };
        weeks[weeks.length - 1].days[
          weeks[weeks.length - 1].days.length - 1
        ].exercises.push(plannerExercise);
        if (!notused) {
          exerciseIndex += 1;
        }
      } else {
        errorPlannerSyntax(
          `Unexpected node type ${child.node.type.name}`,
          child,
        );
      }
    }
    return { data: weeks, success: true };
  } catch (e) {
    if (e instanceof PlannerSyntaxError) {
      return { error: e, success: false };
    } else {
      throw e;
    }
  }
}

//#endregion

//#region Planner Program Exercise

export function PlannerProgramExercise_setVariations(
  exercise: IPlannerProgramExercise,
): IPlannerProgramExerciseSetVariation[] {
  const originalSetVariations = exercise.setVariations;
  const reuseSetVariations = exercise.reuse?.exercise?.setVariations;
  const setVariations =
    (originalSetVariations?.length > 0
      ? originalSetVariations
      : reuseSetVariations) || [];
  return setVariations.length === 0
    ? [{ sets: PlannerProgramExercise_sets(exercise), isCurrent: true }]
    : setVariations;
}

function PlannerProgramExercise_programWarmups(
  exercise: IPlannerProgramExercise,
  settings: ISettings,
): IProgramExerciseWarmupSet[] | undefined {
  const exerciseWarmups =
    exercise.warmupSets || exercise.reuse?.exercise?.warmupSets;
  if (exerciseWarmups == null) {
    return undefined;
  }
  const sets: IProgramExerciseWarmupSet[] = [];
  for (const ws of exerciseWarmups) {
    for (let i = 0; i < ws.numberOfSets; i += 1) {
      let value: IWeight | number | undefined = ws.percentage
        ? ws.percentage / 100
        : undefined;
      value ??= ws.weight ?? MathUtils_roundTo0005(rpeMultiplier(ws.reps, 4));
      sets.push({
        reps: ws.reps,
        value,
        threshold: build(0, settings.units),
      });
    }
  }
  return sets;
}

export function PlannerProgramExercise_evaluateSetVariations(
  exercise: IPlannerProgramExercise,
  setVariations: IPlannerProgramExerciseSetVariation[],
): IPlannerProgramExerciseEvaluatedSetVariation[] {
  const evaluatedSetVariations: IPlannerProgramExerciseEvaluatedSetVariation[] =
    [];
  for (let i = 0; i < setVariations.length; i++) {
    const sets = PlannerProgramExercise_sets(exercise, i);
    const evaluatedSets: IPlannerProgramExerciseEvaluatedSet[] = [];
    for (const aSet of sets) {
      if (aSet.repRange == null) {
        continue;
      }
      for (let j = 0; j < aSet.repRange.numberOfSets; j++) {
        evaluatedSets.push({
          maxrep: aSet.repRange.maxrep,
          minrep: aSet.repRange.minrep,
          weight: aSet.weight
            ? aSet.weight
            : aSet.percentage
              ? percentORM(aSet.percentage)
              : undefined,
          timer: aSet.timer,
          rpe: aSet.rpe,
          logRpe: !!aSet.logRpe,
          label: aSet.label,
          isAmrap: aSet.repRange.isAmrap,
          isQuickAddSet: aSet.repRange.isQuickAddSet,
          askWeight: !!aSet.askWeight,
        });
      }
    }
    evaluatedSetVariations.push({
      sets: evaluatedSets,
      isCurrent: setVariations[i].isCurrent,
    });
  }
  return evaluatedSetVariations;
}

function PlannerProgramExercise_sets(
  exercise: IPlannerProgramExercise,
  variationIndex?: number,
): IPlannerProgramExerciseSet[] {
  const reusedSets = exercise.reuse?.exercise
    ? exercise.reuse?.exercise?.setVariations[
        variationIndex ??
          PlannerProgramExercise_currentSetVariationIndex(
            exercise.reuse?.exercise,
          )
      ]?.sets
    : undefined;
  const reusedGlobals = exercise.reuse?.exercise?.globals || {};
  variationIndex =
    variationIndex ?? PlannerProgramExercise_currentSetVariationIndex(exercise);
  const currentSets = exercise.setVariations[variationIndex]?.sets;
  const currentGlobals = exercise.globals;
  const sets = currentSets || reusedSets || [];
  return sets.map((aSet) => {
    const set: IPlannerProgramExerciseSet = structuredClone(aSet);
    set.rpe =
      currentGlobals.rpe != null
        ? currentGlobals.rpe
        : (set.rpe ?? reusedGlobals.rpe);
    set.timer =
      currentGlobals.timer != null
        ? currentGlobals.timer
        : (set.timer ?? reusedGlobals.timer);
    if (currentGlobals.weight != null || currentGlobals.percentage != null) {
      if (currentGlobals.weight != null) {
        set.weight = currentGlobals.weight;
        set.percentage = undefined;
      } else {
        set.percentage = currentGlobals.percentage;
        set.weight = undefined;
      }
    } else {
      set.weight = set.weight ?? reusedGlobals.weight;
      set.percentage = set.percentage ?? reusedGlobals.percentage;
    }

    set.logRpe = !!(currentGlobals.rpe != null && currentGlobals.logRpe != null
      ? currentGlobals.logRpe
      : (set.logRpe ?? reusedGlobals.logRpe));
    set.askWeight = !!((currentGlobals.weight != null ||
      currentGlobals.percentage != null) &&
    currentGlobals.askWeight != null
      ? currentGlobals.askWeight
      : (set.askWeight ?? reusedGlobals.askWeight));
    return set;
  });
}

function PlannerProgramExercise_currentSetVariationIndex(
  exercise: IPlannerProgramExercise,
): number {
  const index = exercise.setVariations.findIndex((sv) => sv.isCurrent);
  return index === -1 ? 0 : index;
}

function PlannerProgramExercise_currentEvaluatedSetVariationIndex(
  exercise: IPlannerProgramExercise,
): number {
  const index = exercise.evaluatedSetVariations.findIndex((sv) => sv.isCurrent);
  return index === -1 ? 0 : index;
}

function PlannerProgramExercise_currentDescriptionIndex(
  exercise: IPlannerProgramExercise,
): number {
  const index = exercise.descriptions.values.findIndex((d) => d.isCurrent);
  return index === -1 ? 0 : index;
}

function PlannerProgramExercise_getProgressScript(
  exercise: IPlannerProgramExercise,
): string | undefined {
  return (
    exercise.progress?.script ??
    exercise.progress?.reuse?.exercise?.progress?.script ??
    exercise.progress?.reuse?.exercise?.progress?.reuse?.exercise?.progress
      ?.script ??
    exercise.reuse?.exercise?.progress?.script ??
    exercise.reuse?.exercise?.progress?.reuse?.exercise?.progress?.script
  );
}

export function PlannerProgramExercise_getState(
  exercise: IPlannerProgramExercise,
): IProgramState {
  if (exercise.progress?.state && !exercise.progress.reuse) {
    return exercise.progress.state;
  } else {
    const originalState = exercise.progress?.reuse?.exercise
      ? PlannerProgramExercise_getState(exercise.progress.reuse.exercise)
      : exercise.reuse?.exercise
        ? PlannerProgramExercise_getState(exercise.reuse.exercise)
        : {};

    return { ...originalState, ...exercise.progress?.state };
  }
}

function PlannerProgramExercise_getOnlyChangedState(
  exercise: IPlannerProgramExercise,
): IProgramState {
  const originalState = exercise.progress?.reuse?.exercise
    ? exercise.progress.reuse.exercise.progress?.state || {}
    : exercise.reuse?.exercise
      ? exercise.reuse.exercise.progress?.state || {}
      : {};
  const originalStateMetadata = exercise.progress?.reuse?.exercise
    ? exercise.progress.reuse.exercise.progress?.stateMetadata || {}
    : exercise.reuse?.exercise
      ? exercise.reuse.exercise.progress?.stateMetadata || {}
      : {};
  const state = exercise.progress?.state || {};
  const stateMetadata = exercise.progress?.stateMetadata || {};
  return ObjectUtils_filter(
    state,
    (key, value) =>
      originalState[key] == null ||
      !eq(originalState[key], value) ||
      originalStateMetadata[key]?.userPrompted !==
        stateMetadata[key]?.userPrompted,
  ) as IProgramState;
}

function PlannerProgramExercise_getStateMetadata(
  exercise: IPlannerProgramExercise,
): IProgramStateMetadata {
  if (exercise.progress?.stateMetadata && !exercise.progress.reuse) {
    return exercise.progress.stateMetadata;
  } else {
    const originalState = exercise.progress?.reuse?.exercise
      ? PlannerProgramExercise_getStateMetadata(
          exercise.progress.reuse.exercise,
        )
      : exercise.reuse?.exercise
        ? PlannerProgramExercise_getStateMetadata(exercise.reuse.exercise)
        : {};

    return { ...originalState, ...exercise.progress?.stateMetadata };
  }
}

function PlannerProgramExercise_getUpdateScript(
  exercise: IPlannerProgramExercise,
): string | undefined {
  return (
    exercise.update?.script ??
    exercise.update?.reuse?.exercise?.update?.script ??
    exercise.update?.reuse?.exercise?.update?.reuse?.exercise?.update?.script ??
    exercise.reuse?.exercise?.update?.script ??
    exercise.reuse?.exercise?.update?.reuse?.exercise?.update?.script
  );
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

function PlannerProgramExercise_buildProgress(
  type: IProgramExerciseProgressType | string,
  args: string[],
  opts: {
    reuseFullname?: string;
    script?: string;
  } = {},
): IEither<IProgramExerciseProgress, string> {
  switch (type) {
    case "lp": {
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
          type: "lp",
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case "dp": {
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
          type: "dp",
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case "sum": {
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
          type: "sum",
          state,
          stateMetadata: {},
          script,
        },
      };
    }
    case "custom": {
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
          type: "custom",
          state,
          stateMetadata,
          script,
          reuse: opts.reuseFullname
            ? { fullName: opts.reuseFullname, source: "specific" }
            : undefined,
        },
      };
    }
    case "none":
    default: {
      return {
        success: true,
        data: {
          type: "none",
          state: {},
          stateMetadata: {},
        },
      };
    }
  }
}

function PlannerProgramExercise_shortNameFromFullName(
  fullName: string,
  settings: ISettings,
): string {
  const { name, equipment } = extractNameParts(fullName, settings.exercises);

  return `${name}${equipment ? `, ${equipmentName(equipment)}` : ""}`;
}

//#endregion

//#region Program Set
/**
 * Gets the weight of a set as a static weight
 * @param set The set (weight x reps) this is for
 * @param exerciseType The exercise the set is for
 * @param settings The settings to use for evaluation
 */
function ProgramSet_getEvaluatedWeight(
  set: IPlannerProgramExerciseEvaluatedSet,
  exerciseType: IExerciseType,
  settings: ISettings,
): IWeight | undefined {
  const evaluatedWeight = set.weight
    ? evaluateWeight(set.weight, exerciseType, settings)
    : set.maxrep != null && set.rpe != null
      ? evaluateWeight(rpePct(set.maxrep, set.rpe), exerciseType, settings)
      : undefined;
  return evaluatedWeight
    ? roundConvertTo(
        evaluatedWeight,
        settings,
        getPreferredUnit(settings, exerciseType),
        exerciseType,
      )
    : undefined;
}
//#endregion

//#region Progress

interface IScriptBindings {
  day: number;
  week: number;
  dayInWeek: number;
  originalWeights: (IWeight | IDynamicWeight)[];
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

export function Progress_createEmptyScriptBindings(
  dayData: IDayData,
  settings: ISettings,
  exercise?: IExerciseType,
): IScriptBindings {
  const rm1 = exercise ? getOrmOrStartingWeight(exercise, settings) : w`0lb`;
  return {
    day: dayData.day,
    week: dayData.week,
    dayInWeek: dayData.dayInWeek,
    completedWeights: [],
    originalWeights: [],
    weights: [],
    reps: [],
    minReps: [],
    RPE: [],
    amraps: [],
    logrpes: [],
    askweights: [],
    completedReps: [],
    completedRepsLeft: [],
    completedRPE: [],
    isCompleted: [],
    timers: [],
    w: [],
    r: [],
    cr: [],
    cw: [],
    mr: [],
    programNumberOfSets: 0,
    numberOfSets: 0,
    completedNumberOfSets: 0,
    ns: 0,
    setVariationIndex: 1,
    descriptionIndex: 1,
    bodyweight: build(0, settings.units),
    setIndex: 1,
    rm1,
  };
}

function Progress_createScriptBindings(
  dayData: IDayData,
  entry: IHistoryEntry,
  settings: ISettings,
  programNumberOfSets: number,
  bodyweight: IWeight | undefined,
  setIndex?: number,
  setVariationIndex?: number,
  descriptionIndex?: number,
): IScriptBindings {
  const bindings = Progress_createEmptyScriptBindings(
    dayData,
    settings,
    entry.exercise,
  );
  for (const set of entry.sets) {
    bindings.weights.push(set.weight);
    bindings.originalWeights.push(
      set.originalWeight ?? build(0, settings.units),
    );
    bindings.reps.push(set.reps);
    bindings.minReps.push(set.minReps);
    bindings.completedReps.push(set.completedReps);
    bindings.completedRepsLeft.push(set.completedRepsLeft);
    bindings.completedRPE.push(set.completedRpe);
    bindings.completedWeights.push(set.completedWeight);
    bindings.RPE.push(set.rpe);
    bindings.amraps.push(set.isAmrap ? 1 : undefined);
    bindings.logrpes.push(set.logRpe ? 1 : undefined);
    bindings.askweights.push(set.askWeight ? 1 : undefined);
    bindings.timers.push(set.timer);
    bindings.isCompleted.push(set.isCompleted ? 1 : 0);
  }
  bindings.w = bindings.weights;
  bindings.r = bindings.reps;
  bindings.cr = bindings.completedReps;
  bindings.cw = bindings.completedWeights;
  bindings.mr = bindings.minReps;
  bindings.ns = entry.sets.length;
  bindings.programNumberOfSets = programNumberOfSets;
  bindings.numberOfSets = entry.sets.length;
  bindings.completedNumberOfSets = entry.sets.filter(
    (s) => s.isCompleted,
  ).length;
  bindings.setIndex = setIndex ?? 1;
  bindings.setVariationIndex = setVariationIndex ?? 1;
  bindings.descriptionIndex = descriptionIndex ?? 1;
  bindings.bodyweight = bodyweight ?? build(0, settings.units);
  return bindings;
}

function Progress_runUpdateScriptForEntry(
  entry: IHistoryEntry,
  dayData: IDayData,
  programExercise: IPlannerProgramExercise,
  otherStates: IByTag<IProgramState>,
  setIndex: number,
  settings: ISettings,
  stats: IStats,
): IHistoryEntry {
  if (setIndex !== -1 && !entry?.sets[setIndex]?.isCompleted) {
    return entry;
  }
  const script = PlannerProgramExercise_getUpdateScript(programExercise);
  if (!script) {
    return entry;
  }
  const exercise = programExercise.exerciseType;
  const state = structuredClone(
    PlannerProgramExercise_getState(programExercise),
  );
  const setVariationIndex =
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(programExercise);
  const descriptionIndex =
    PlannerProgramExercise_currentDescriptionIndex(programExercise);
  const bindings = Progress_createScriptBindings(
    dayData,
    entry,
    settings,
    programExercise.evaluatedSetVariations[setVariationIndex]?.sets.length ?? 0,
    getAverageBodyweight(
      stats,
      settings.units,
      settings.graphOptions.weight?.movingAverageWindowSize,
    ),
    setIndex + 1,
    setVariationIndex,
    descriptionIndex,
  );
  try {
    const fnContext: IScriptFnContext = {
      exerciseType: exercise,
      unit: settings.units,
      prints: [],
    };
    const result = run(
      script,
      state,
      bindings,
      Progress_createScriptFunctions(settings),
      fnContext,
      structuredClone(otherStates),
      "update",
    );
    const newEntry = Progress_applyBindings(entry, bindings, settings);
    newEntry.state = { ...newEntry.state, ...result.finalState };
    if (fnContext.prints.length > 0) {
      newEntry.updatePrints = fnContext.prints;
    }
    return newEntry;
  } catch (error) {
    const e = error as Error;
    console.error(e);

    return entry;
  }
}

function Progress_applyBindings(
  oldEntry: IHistoryEntry,
  bindings: IScriptBindings,
  settings: ISettings,
): IHistoryEntry {
  const keys = [
    "RPE",
    "minReps",
    "reps",
    "weights",
    "amraps",
    "logrpes",
    "timers",
    "originalWeights",
    "askweights",
  ] as const;
  const entry = structuredClone(oldEntry);
  const lastCompletedIndex =
    bindings.completedReps.findLastIndex((r) => r != null) + 1;
  entry.sets = entry.sets.slice(
    0,
    Math.max(lastCompletedIndex, bindings.numberOfSets, 0),
  );
  for (const key of keys) {
    for (let i = 0; i < bindings[key].length; i += 1) {
      entry.sets[i] ??= {
        id: generateUid(6),
        index: i,
        isUnilateral: isUnilateral(entry.exercise, settings),
        reps: 0,
        weight: w`0lb`,
        originalWeight: w`0lb`,
        askWeight: false,
        isCompleted: false,
      };
      if (!entry.sets[i].isCompleted) {
        if (key === "RPE") {
          const value = bindings.RPE[i];
          entry.sets[i].rpe = value !== 0 ? value : undefined;
        } else if (key === "reps") {
          entry.sets[i].reps = bindings.reps[i];
        } else if (key === "minReps") {
          const value = bindings.minReps[i];
          entry.sets[i].minReps = value !== 0 ? value : undefined;
        } else if (key === "weights") {
          entry.sets[i].weight = bindings.weights[i];
        } else if (key === "originalWeights") {
          entry.sets[i].originalWeight = bindings.originalWeights[i];
        } else if (key === "amraps") {
          const value = bindings.amraps[i];
          entry.sets[i].isAmrap = !!value;
        } else if (key === "logrpes") {
          const value = bindings.logrpes[i];
          entry.sets[i].logRpe = !!value;
        } else if (key === "askweights") {
          const value = bindings.askweights[i];
          entry.sets[i].askWeight = !!value;
        } else if (key === "timers") {
          const value = bindings.timers[i];
          entry.sets[i].timer = value != null && value >= 0 ? value : undefined;
        }
      }
    }
  }
  return entry;
}

function Progress_getEntryId(
  exerciseType: IExerciseType,
  label?: string,
): string {
  return filterUndefined([label, toKey(exerciseType)]).join("_");
}

//#endregion

//#region PP
export function forExerciseInEvaluatedWeeks(
  evaluatedWeeks: IEvaluatedProgram["weeks"],
  cb: (
    exercise: IPlannerProgramExercise,
    weekIndex: number,
    dayInWeekIndex: number,
    dayIndex: number,
    exerciseIndex: number,
  ) => boolean | void,
): void {
  let dayIndex = 0;
  for (let weekIndex = 0; weekIndex < evaluatedWeeks.length; weekIndex++) {
    const week = evaluatedWeeks[weekIndex];
    for (
      let dayInWeekIndex = 0;
      dayInWeekIndex < week.days.length;
      dayInWeekIndex++
    ) {
      const day = week.days[dayInWeekIndex];
      for (
        let exerciseIndex = 0;
        exerciseIndex < day.exercises.length;
        exerciseIndex++
      ) {
        const exercise = day.exercises[exerciseIndex];
        const shouldReturn = cb(
          exercise,
          weekIndex,
          dayInWeekIndex,
          dayIndex,
          exerciseIndex,
        );
        if (!!shouldReturn) {
          return;
        }
      }
      dayIndex += 1;
    }
  }
}

export function forExerciseInEvaluatedResults(
  evaluatedWeeks: IPlannerEvalResult[][],
  cb: (
    exercise: IPlannerProgramExercise,
    weekIndex: number,
    dayInWeekIndex: number,
    dayIndex: number,
    exerciseIndex: number,
  ) => boolean | void,
): void {
  let dayIndex = 0;
  for (let weekIndex = 0; weekIndex < evaluatedWeeks.length; weekIndex++) {
    const week = evaluatedWeeks[weekIndex];
    for (
      let dayInWeekIndex = 0;
      dayInWeekIndex < week.length;
      dayInWeekIndex++
    ) {
      const day = week[dayInWeekIndex];
      if (day.success) {
        for (
          let exerciseIndex = 0;
          exerciseIndex < day.data.length;
          exerciseIndex++
        ) {
          const exercise = day.data[exerciseIndex];
          const shouldReturn = cb(
            exercise,
            weekIndex,
            dayInWeekIndex,
            dayIndex,
            exerciseIndex,
          );
          if (!!shouldReturn) {
            return;
          }
        }
      }
      dayIndex += 1;
    }
  }
}

//#endregion

//#region Program to Planner
interface IPlannerToProgram2Globals {
  weight?: IWeight | IDynamicWeight;
  rpe?: number;
  timer?: number;
  logRpe?: boolean;
  askWeight?: boolean;
}

type IDereuseDecision =
  | "sets"
  | "weight"
  | "rpe"
  | "timer"
  | "progress"
  | "update";

interface IPlannerToProgramConvertOpts {
  renameMapping?: Record<string, { to: string; dayData?: IDayData }>;
  reorder?: {
    dayData: IDayData;
    fromIndex: number;
    toIndex: number;
  }[];
  add?: { dayData: IDayData; index: number; fullName: string }[];
}

function getUpdate(
  update: IProgramExerciseUpdate,
  settings: ISettings,
): string {
  if (!update.reuse) {
    return `update: custom() ${update.script}`;
  }
  if (!update.reuse.exercise?.exerciseType) {
    // @todo this branch seems to double pre-fix the "/". Is that a mistake?
    return ` / update: custom() { ...${update.reuse.exercise?.fullName || update.reuse.fullName} }`;
  }
  const fullName = Exercise_fullName(
    getExerciseOrDefault(
      update.reuse.exercise.exerciseType,
      settings.exercises,
    ),
    getCurrentEquipment(settings),
    update.reuse.exercise.label,
  );
  return `update: custom() { ...${fullName} }`;
}

function getProgress(
  programExercise: IPlannerProgramExercise,
  settings: ISettings,
  hideScript?: boolean,
): string {
  const progress = programExercise.progress;
  if (!progress) {
    return "";
  }
  let progressStr = `progress: ${progress.type}`;
  const state = PlannerProgramExercise_getState(programExercise);
  const stateMetadata =
    PlannerProgramExercise_getStateMetadata(programExercise);
  if (progress.type === "custom") {
    const onlyChangedState =
      PlannerProgramExercise_getOnlyChangedState(programExercise);
    progressStr += `(${ObjectUtils_entries(onlyChangedState)
      .map(([k, v]) => {
        return `${k}${stateMetadata[k]?.userPrompted ? "+" : ""}: ${print(v)}`;
      })
      .join(", ")})`;
  } else if (progress.type === "lp") {
    const increment = state.increment as IWeight | IDynamicWeight;
    const successes = state.successes as number;
    const successCounter = state.successCounter as number;
    const decrement = state.decrement as IWeight | IDynamicWeight;
    const failures = state.failures as number;
    const failureCounter = state.failureCounter as number;
    const args: string[] = [];
    args.push(print(increment));
    if (successes > 1 || decrement.value > 0) {
      args.push(`${successes}`);
    }
    if (successes > 1 || decrement.value > 0) {
      args.push(`${successCounter}`);
    }
    if (decrement.value > 0) {
      args.push(print(decrement));
    }
    if (failures > 1) {
      args.push(`${failures}`);
    }
    if (failures > 1) {
      args.push(`${failureCounter}`);
    }
    progressStr += `(${args.join(", ")})`;
  } else if (progress.type === "dp") {
    const increment = state.increment as IWeight | IDynamicWeight;
    const minReps = state.minReps as number;
    const maxReps = state.maxReps as number;
    const args = [print(increment), `${minReps}`, `${maxReps}`];
    progressStr += `(${args.join(", ")})`;
  } else if (progress.type === "sum") {
    const reps = state.reps as number;
    const increment = state.increment as IWeight | IDynamicWeight;
    const args = [`${reps}`, print(increment)];
    progressStr += `(${args.join(", ")})`;
  }
  if (progress.type === "custom") {
    if (progress.reuse) {
      if (progress.reuse.exercise?.exerciseType) {
        const exercise = getExerciseOrDefault(
          progress.reuse.exercise.exerciseType,
          settings.exercises,
        );
        const fullName = Exercise_fullName(
          exercise,
          getCurrentEquipment(settings),
          progress.reuse.exercise.label,
        );
        progressStr += ` { ...${fullName} }`;
      } else {
        progressStr += ` { ...${progress.reuse.exercise?.fullName || progress.reuse.fullName} }`;
      }
    } else {
      progressStr += hideScript ? ` {~ ... ~}` : ` ${progress.script}`;
    }
  }
  return progressStr;
}

function getDereuseDecisions(
  programExercise: IPlannerProgramExercise,
): IDereuseDecision[] {
  const dereuseDecisions: Set<IDereuseDecision> = new Set();
  const reuseExercise = programExercise.reuse?.exercise;
  if (!reuseExercise) {
    return Array.from(dereuseDecisions);
  }
  const globals = getGlobals(programExercise);
  const reusedGlobals = getGlobals(reuseExercise);
  if (
    programExercise.evaluatedSetVariations.length !==
    reuseExercise.evaluatedSetVariations.length
  ) {
    dereuseDecisions.add("sets");
  }
  if (
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(
      programExercise,
    ) !==
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(reuseExercise)
  ) {
    dereuseDecisions.add("sets");
  }
  if (reuseExercise.progress != null || programExercise.progress != null) {
    if (
      programExercise.progress == null ||
      programExercise.progress.type !== reuseExercise.progress?.type ||
      (programExercise.progress.reuse
        ? programExercise.progress.reuse?.fullName !== reuseExercise.fullName
        : programExercise.progress.script !== reuseExercise.progress.script) ||
      Object.keys(PlannerProgramExercise_getOnlyChangedState(programExercise))
        .length > 0
    ) {
      dereuseDecisions.add("progress");
    }
  }
  if (reuseExercise.update != null || programExercise.update != null) {
    if (
      programExercise.update == null ||
      (programExercise.update.reuse
        ? programExercise.update.reuse?.fullName !== reuseExercise.fullName
        : programExercise.update.script !== reuseExercise.update?.script)
    ) {
      dereuseDecisions.add("update");
    }
  }
  if (
    programExercise.evaluatedSetVariations.length ===
    reuseExercise.evaluatedSetVariations.length
  ) {
    for (let i = 0; i < programExercise.evaluatedSetVariations.length; i += 1) {
      const programVariation = programExercise.evaluatedSetVariations[i];
      const reuseVariation = reuseExercise.evaluatedSetVariations[i];
      if (programVariation.sets.length !== reuseVariation.sets.length) {
        dereuseDecisions.add("sets");
      }
      for (let j = 0; j < programVariation.sets.length; j += 1) {
        const programSet = programVariation.sets[j];
        const reuseSet = reuseVariation.sets[j];
        if (
          programSet.maxrep !== reuseSet?.maxrep ||
          programSet.minrep !== reuseSet?.minrep
        ) {
          dereuseDecisions.add("sets");
        }
        if (
          reuseSet
            ? !eq(programSet.weight, reuseSet.weight) ||
              programSet.askWeight !== reuseSet.askWeight
            : !eq(globals.weight || w`0lb`, reusedGlobals.weight || w`0lb`) ||
              globals.askWeight !== reusedGlobals.askWeight
        ) {
          if (globals.weight != null) {
            dereuseDecisions.add("weight");
          } else {
            dereuseDecisions.add("sets");
          }
        }
        if (
          reuseSet
            ? programSet.rpe !== reuseSet.rpe ||
              programSet.logRpe !== reuseSet.logRpe
            : globals.rpe !== reusedGlobals.rpe ||
              globals.logRpe !== reusedGlobals.logRpe
        ) {
          if (globals.rpe != null) {
            dereuseDecisions.add("rpe");
          } else {
            dereuseDecisions.add("sets");
          }
        }
        if (
          reuseSet
            ? programSet.timer !== reuseSet.timer
            : globals.timer !== reusedGlobals.timer
        ) {
          if (globals.timer != null) {
            dereuseDecisions.add("timer");
          } else {
            dereuseDecisions.add("sets");
          }
        }
      }
    }
  }
  return Array.from(dereuseDecisions);
}

function reorderGroupedTopLine(
  groupedTopLine: IPlannerTopLineItem[][][][],
  reorders: IPlannerToProgramConvertOpts["reorder"],
): IPlannerTopLineItem[][][][] {
  if (!reorders) {
    return groupedTopLine;
  }
  for (const reorder of reorders) {
    const groupedDay =
      groupedTopLine[reorder.dayData.week - 1]?.[reorder.dayData.dayInWeek - 1];
    if (groupedDay) {
      const indexMap = groupedDay.reduce<{
        result: Record<number, number>;
        i: number;
      }>(
        ({ result, i }, group, index) => {
          const exercise = group.find((item) => item.type === "exercise");
          if (exercise && !exercise.notused) {
            result[i] = index;
            i += 1;
          }
          return { result, i };
        },
        { result: {}, i: 0 },
      ).result;
      const from = groupedDay[indexMap[reorder.fromIndex]];
      if (from) {
        groupedDay.splice(indexMap[reorder.fromIndex], 1);
        groupedDay.splice(indexMap[reorder.toIndex], 0, from);
      }
    }
  }
  return groupedTopLine;
}

function getRenamedValue(
  opts: IPlannerToProgramConvertOpts,
  line: IPlannerTopLineItem,
  weekIndex: number,
  dayInWeekIndex: number,
): string {
  const renamedValue = opts.renameMapping?.[line.value];
  if (
    renamedValue &&
    (!renamedValue.dayData ||
      (renamedValue.dayData.week === weekIndex + 1 &&
        renamedValue.dayData.dayInWeek === dayInWeekIndex + 1))
  ) {
    return renamedValue.to;
  } else {
    return line.value;
  }
}
function groupWarmupsSets(
  sets: IPlannerProgramExerciseWarmupSet[],
): [IPlannerProgramExerciseWarmupSet, number][] {
  let lastKey: string | undefined;
  const groups: [IPlannerProgramExerciseWarmupSet, number][] = [];
  for (const set of sets) {
    const key = `${set.reps}-${print(set.weight || set.percentage || 0)}`;
    if (lastKey == null || lastKey !== key) {
      groups.push([set, 0]);
    }
    groups[groups.length - 1][1] += set.numberOfSets;
    lastKey = key;
  }
  return groups;
}

function addGroupedTopLine(
  groupedTopLine: IPlannerTopLineItem[][][][],
  adds: IPlannerToProgramConvertOpts["add"],
  settings: ISettings,
): IPlannerTopLineItem[][][][] {
  if (!adds) {
    return groupedTopLine;
  }
  for (const add of adds) {
    const groupedDay =
      groupedTopLine[add.dayData.week - 1]?.[add.dayData.dayInWeek - 1];
    if (groupedDay) {
      groupedDay.splice(add.index, 0, [
        {
          type: "exercise",
          value: PlannerKey_fromFullName(add.fullName, settings.exercises),
        },
      ]);
    }
  }
  return groupedTopLine;
}

function getCurrentDescriptionExercise(
  program: IEvaluatedProgram,
  key: string,
  weekIndex: number,
  dayInWeekIndex: number,
): IPlannerProgramExercise | undefined {
  return program.weeks[weekIndex]?.days[dayInWeekIndex]?.exercises?.find(
    (e) => e.key === key,
  );
}

function getCurrentDescriptionIndex(
  program: IEvaluatedProgram,
  key: string,
  weekIndex: number,
  dayInWeekIndex: number,
): number {
  const exercise = getCurrentDescriptionExercise(
    program,
    key,
    weekIndex,
    dayInWeekIndex,
  );
  const descriptions = exercise?.descriptions.values || [];
  const index = descriptions.findIndex((s) => s.isCurrent);
  return index === -1 ? 0 : index;
}

function addExerciseDescriptions(
  program: IEvaluatedProgram,
  exercise: IPlannerProgramExercise | undefined,
  weekIndex: number,
  dayInWeekIndex: number,
  addedCurrentDescription: boolean,
): { lines: string[]; addedCurrentDescription: boolean } | undefined {
  if (!exercise) {
    return undefined;
  }
  if (
    exercise?.descriptions.reuse == null ||
    !ObjectUtils_isEqual(
      exercise.descriptions.values || [],
      exercise.descriptions.reuse.exercise?.descriptions.values || [],
    )
  ) {
    const lines: string[] = [];
    const currentIndex = getCurrentDescriptionIndex(
      program,
      exercise.key,
      weekIndex,
      dayInWeekIndex,
    );
    for (let i = 0; i < exercise.descriptions.values.length; i += 1) {
      if (i > 0) {
        lines.push("");
      }
      const description = exercise.descriptions.values[i];
      const parts = description.value.split("\n");
      for (const part of parts) {
        if (
          currentIndex !== 0 &&
          currentIndex === i &&
          !addedCurrentDescription
        ) {
          lines.push(`// ! ${part}`);
          addedCurrentDescription = true;
        } else {
          lines.push(`// ${part}`);
        }
      }
    }
    return { lines, addedCurrentDescription };
  } else if (exercise?.descriptions.reuse?.exercise) {
    const reusedExercise = exercise.descriptions.reuse.exercise;
    const reusedDayData = reusedExercise.dayData;
    const currentWeekReusedExercisesCount = program.weeks[
      weekIndex
    ]?.days.filter((day) => {
      return day.exercises.some((e) => e.key === reusedExercise.key);
    }).length;
    if (
      currentWeekReusedExercisesCount === 1 &&
      reusedDayData.week === weekIndex + 1
    ) {
      return {
        lines: [`// ...${reusedExercise.fullName}`],
        addedCurrentDescription,
      };
    } else {
      return {
        lines: [
          `// ...${reusedExercise.fullName}[${reusedDayData.week}:${reusedDayData.dayInWeek}]`,
        ],
        addedCurrentDescription,
      };
    }
  } else {
    return undefined;
  }
}

export function compactPlannerProgram(
  oldPlannerProgram: IPlannerProgram,
  plannerProgram: IPlannerProgram,
  settings: ISettings,
  additionalRepeatingExercises?: Set<string>,
): IPlannerProgram {
  const repeatingExercises = new Set<string>(additionalRepeatingExercises);
  const { evaluatedWeeks } = PlannerProgram_evaluate(
    structuredClone(oldPlannerProgram),
    settings,
  );
  const { evaluatedWeeks: newEvaluatedWeeks } = PlannerProgram_evaluate(
    structuredClone(plannerProgram),
    settings,
  );
  for (const ev of [evaluatedWeeks, newEvaluatedWeeks]) {
    forExerciseInEvaluatedResults(ev, (exercise) => {
      if (exercise.repeat != null && exercise.repeat.length > 0) {
        repeatingExercises.add(exercise.key);
      }
    });
  }

  const lastDescriptions: OpenRecord<string, number> = {};
  plannerProgram.weeks.forEach((week) => {
    week.days.forEach((day, dayInWeekIndex) => {
      if (lastDescriptions[dayInWeekIndex] === undefined) {
        lastDescriptions[dayInWeekIndex] = day.description;
      } else if (lastDescriptions[dayInWeekIndex] === day.description) {
        day.description = undefined;
      } else {
        lastDescriptions[dayInWeekIndex] = day.description;
      }
    });
  });

  const mapping = plannerProgram.weeks.map((week) => {
    return week.days.map((day) => {
      return topLineMap(
        asPlanNodeOfTypeOrThrow(
          "Program",
          parseBound(plannerExerciseParser, day.exerciseText),
        ),
        settings.exercises,
      );
    });
  });

  for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
    const week = mapping[weekIndex];
    for (let dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
      const day = week[dayIndex];
      for (const line of day) {
        if (
          line.type === "exercise" &&
          !line.used &&
          repeatingExercises.has(line.value)
        ) {
          const repeatRanges: [number, number | undefined][] = [];
          for (
            let repeatWeekIndex = weekIndex + 1;
            repeatWeekIndex < mapping.length;
            repeatWeekIndex += 1
          ) {
            const repeatDay = mapping[repeatWeekIndex]?.[dayIndex];
            const repeatedExercises = (repeatDay || []).filter((e) => {
              if (
                e.type !== "exercise" ||
                e.value !== line.value ||
                e.sectionsToReuse !== line.sectionsToReuse ||
                e.exerciseIndex !== line.exerciseIndex ||
                !ObjectUtils_isEqual(
                  e.descriptions || [],
                  line.descriptions || [],
                )
              ) {
                return false;
              }
              const oldDay = evaluatedWeeks[repeatWeekIndex][dayIndex];
              const oldExercise = oldDay.success
                ? oldDay.data.find((ex) => ex.key === e.value)
                : undefined;
              return oldExercise?.repeating?.includes(weekIndex + 1);
            });
            for (const e of repeatedExercises) {
              e.used = true;
            }
            if (repeatedExercises.length > 0) {
              if (
                repeatRanges.length === 0 ||
                repeatRanges[repeatRanges.length - 1][1] != null
              ) {
                repeatRanges.push([repeatWeekIndex, undefined]);
              }
            } else {
              if (repeatRanges.length > 0) {
                repeatRanges[repeatRanges.length - 1][1] = repeatWeekIndex;
              }
              break;
            }
          }
          if (
            repeatRanges.length > 0 &&
            repeatRanges[repeatRanges.length - 1][1] == null
          ) {
            repeatRanges[repeatRanges.length - 1][1] = mapping.length;
          }
          line.repeatRanges = repeatRanges.map((r) => `${r[0]}-${r[1]}`);
        }
      }
    }
  }

  for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
    const programWeek = plannerProgram.weeks[weekIndex];
    const week = mapping[weekIndex];
    for (let dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
      const day = week[dayIndex];
      const programDay = programWeek.days[dayIndex];
      let str = "";
      let ongoingDescriptions = false;
      for (const line of day) {
        if (line.type === "description") {
          ongoingDescriptions = true;
        } else if (line.type === "exercise") {
          ongoingDescriptions = false;
          if (!line.used) {
            if (line.descriptions && line.descriptions.length > 0) {
              str += `${line.descriptions.filter((d) => d.trim()).join("\n\n")}\n`;
            }
            let repeatStr = "";
            if (
              (line.order != null && line.order !== 0) ||
              (line.repeatRanges && line.repeatRanges.length > 0)
            ) {
              const repeatParts = [];
              if (line.order != null && line.order !== 0) {
                repeatParts.push(line.order);
              }
              if (line.repeatRanges && line.repeatRanges.length > 0) {
                repeatParts.push(line.repeatRanges.join(","));
              }
              repeatStr = `[${repeatParts.join(",")}]`;
            }
            str +=
              [`${line.fullName}${repeatStr}`, line.sections]
                .filter((r) => r)
                .join(" / ") + `\n`;
          }
        } else if (line.type === "empty") {
          if (!ongoingDescriptions) {
            str += line.value + "\n";
          }
        } else {
          str += line.value + "\n";
        }
      }
      programDay.exerciseText = str.trim();
    }
  }

  return plannerProgram;
}

function topLineItems(
  plannerProgram: IPlannerProgram,
  exercises: IAllCustomExercises,
): IPlannerTopLineItem[][][] {
  let dayIndex = 0;

  const mapping = plannerProgram.weeks.map((week) => {
    return week.days.map((day) => {
      dayIndex += 1;

      return topLineMap(
        asPlanNodeOfTypeOrThrow(
          "Program",
          parseBound(plannerExerciseParser, day.exerciseText),
        ),
        exercises,
      );
    });
  });
  for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
    const week = mapping[weekIndex];
    for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
      const day = week[dayIndex];
      for (const exercise of day) {
        for (const r of exercise.repeat || []) {
          const reuseDay = mapping[r - 1]?.[dayIndex];
          if (
            reuseDay &&
            !reuseDay.some(
              (e) => e.type === "exercise" && e.value === exercise.value,
            )
          ) {
            if (exercise.descriptions) {
              for (let di = 0; di < exercise.descriptions.length; di += 1) {
                if (di !== 0) {
                  reuseDay.push({ type: "empty", value: "" });
                }
                reuseDay.push({
                  type: "description",
                  value: exercise.descriptions[di],
                });
              }
            }
            reuseDay.push({ ...exercise, repeat: undefined });
          }
        }
      }
    }
  }
  return mapping;
}

function getRepeatRanges(numbers: number[]): string[] {
  if (numbers.length === 0) {
    return [];
  }

  const ranges: string[] = [];
  let rangeStart = numbers[0];
  let rangeEnd = numbers[0];

  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === rangeEnd + 1) {
      rangeEnd = numbers[i];
    } else {
      ranges.push(`${rangeStart}-${rangeEnd}`);
      rangeStart = numbers[i];
      rangeEnd = numbers[i];
    }
  }

  ranges.push(`${rangeStart}-${rangeEnd}`);

  return ranges;
}

function topLineMap(
  programNode: TypedPlanNode<"Program">,
  exercises: IAllCustomExercises,
): IPlannerTopLineItem[] {
  const result: IPlannerTopLineItem[] = [];
  let lastDescriptions: string[][] = [];
  let ongoingDescriptions = false;
  let exerciseIndex = 0;
  for (const child of queryChildren(programNode)) {
    if (child.type.name === PlannerNodeName.ExerciseExpression) {
      ongoingDescriptions = false;
      const nameNode = child.getChild(PlannerNodeName.ExerciseName)!;
      const fullName = getNodeSourceEscapedWhiteSpace(nameNode);
      const key = PlannerKey_fromFullName(fullName, exercises);
      const repeat = getRepeat(child);
      const repeatRanges = getRepeatRanges(repeat);
      const order = getOrder(child);
      const isUsed = !getIsNotUsed(child);
      const sectionsNode = child.getChildren(PlannerNodeName.ExerciseSection);
      const sections = sectionsNode
        .map((section) => section.source.trim())
        .join(" / ");
      const sectionsToReuse = sectionsNode
        .filter((section) => {
          const properties = section.getChild(PlannerNodeName.ExerciseProperty);
          if (properties == null) {
            return true;
          }
          const propertyNameNode = properties.getChild(
            PlannerNodeName.ExercisePropertyName,
          );
          const propertyName = propertyNameNode
            ? getNodeSourceEscapedWhiteSpace(propertyNameNode)
            : undefined;
          if (propertyName === "progress") {
            const none = properties.getChild(PlannerNodeName.None);
            return none != null;
          }
          return false;
        })
        .map((section) => section.source.trim())
        .join(" / ");
      result.push({
        type: "exercise",
        fullName,
        order,
        notused: !isUsed,
        value: key,
        exerciseIndex,
        repeat,
        repeatRanges,
        descriptions: lastDescriptions.map((d) => d.join("\n")),
        sections,
        sectionsToReuse,
      });
      if (isUsed) {
        exerciseIndex += 1;
      }
      lastDescriptions = [];
    } else if (child.type.name === PlannerNodeName.LineComment) {
      ongoingDescriptions = true;
      const description = child.source.trim();
      if (lastDescriptions.length === 0) {
        lastDescriptions.push([]);
      }
      lastDescriptions[lastDescriptions.length - 1].push(description);
      result.push({ type: "description", value: description });
    } else if (child.type.name === PlannerNodeName.TripleLineComment) {
      result.push({
        type: "comment",
        value: child.source.trim(),
      });
    } else if (child.type.name === PlannerNodeName.EmptyExpression) {
      result.push({ type: "empty", value: "" });
      if (ongoingDescriptions) {
        lastDescriptions.push([]);
      }
    } else {
      errorPlannerSyntax(
        `Unexpected node type ${child.type.name}, should be only exercise, comment, description or empty line`,
        child,
      );
    }
  }
  return result;
}

export function convertToPlanner(
  program: IEvaluatedProgram,
  settings: ISettings,
  opts: IPlannerToProgramConvertOpts = {},
): IPlannerProgram {
  const plannerWeeks: IPlannerProgramWeek[] = [];
  if (program.errors.length > 0) {
    const error = program.errors[0];
    console.log(asProgramScript(program.planner));

    throw error.error;
  }
  const topLineMap = topLineItems(program.planner, settings.exercises);
  let groupedTopLineMap = PlannerProgram_groupedTopLines(topLineMap);
  groupedTopLineMap = opts.reorder
    ? reorderGroupedTopLine(groupedTopLineMap, opts.reorder)
    : groupedTopLineMap;
  groupedTopLineMap = opts.add
    ? addGroupedTopLine(groupedTopLineMap, opts.add, settings)
    : groupedTopLineMap;
  let dayIndex = 0;
  const addedProgressMap: Record<string, boolean> = {};
  const addedUpdateMap: Record<string, boolean> = {};
  const addedWarmupsMap: Record<string, boolean> = {};
  const addedIdMap: Record<string, boolean> = {};

  for (let weekIndex = 0; weekIndex < program.weeks.length; weekIndex += 1) {
    const week = program.weeks[weekIndex];
    const plannerWeek: IPlannerProgramWeek = {
      name: week.name,
      days: [],
      description: week.description,
    };
    for (
      let dayInWeekIndex = 0;
      dayInWeekIndex < week.days.length;
      dayInWeekIndex += 1
    ) {
      const programDay = week.days[dayInWeekIndex];
      const plannerDay: IPlannerProgramDay = {
        name: programDay.name,
        exerciseText: "",
      };
      let descriptionIndex: number | undefined = undefined;
      let addedCurrentDescription = false;
      let finishedToAddDescription = false;
      const groupedTopLines = groupedTopLineMap[weekIndex][dayInWeekIndex];
      let groupTextArr: string[] = [];
      groupLoop: for (
        let groupIndex = 0;
        groupIndex < groupedTopLines.length;
        groupIndex += 1
      ) {
        const exerciseTextArr: string[] = [];
        const group = groupedTopLines[groupIndex];
        for (let lineIndex = 0; lineIndex < group.length; lineIndex += 1) {
          const line = group[lineIndex];
          switch (line.type) {
            case "comment": {
              exerciseTextArr.push(line.value);
              break;
            }
            case "description": {
              let key: string | undefined;
              for (let i = lineIndex; i < group.length; i += 1) {
                if (group[i].type === "exercise") {
                  key = getRenamedValue(
                    opts,
                    group[i],
                    weekIndex,
                    dayInWeekIndex,
                  );
                  break;
                }
              }
              descriptionIndex ??= 0;
              if (finishedToAddDescription) {
                break;
              }
              if (key != null) {
                const exercise = getCurrentDescriptionExercise(
                  program,
                  key,
                  weekIndex,
                  dayInWeekIndex,
                );
                const result = addExerciseDescriptions(
                  program,
                  exercise,
                  weekIndex,
                  dayInWeekIndex,
                  addedCurrentDescription,
                );
                if (result) {
                  exerciseTextArr.push(...result.lines);
                  addedCurrentDescription = result.addedCurrentDescription;
                  finishedToAddDescription = true;
                } else {
                  const currentIndex = getCurrentDescriptionIndex(
                    program,
                    key,
                    weekIndex,
                    dayInWeekIndex,
                  );
                  if (
                    currentIndex !== 0 &&
                    currentIndex === descriptionIndex &&
                    !addedCurrentDescription
                  ) {
                    exerciseTextArr.push(
                      line.value.replace(/^\/\/\s*!?\s*/, "// ! "),
                    );
                    addedCurrentDescription = true;
                  } else {
                    exerciseTextArr.push(
                      line.value.replace(/^(\/\/\s*)!\s*/, "$1"),
                    );
                  }
                }
              } else {
                exerciseTextArr.push(
                  line.value.replace(/^(\/\/\s*)!\s*/, "$1"),
                );
              }
              break;
            }
            case "empty": {
              if (!finishedToAddDescription) {
                exerciseTextArr.push("");
                if (descriptionIndex != null) {
                  descriptionIndex += 1;
                }
              }
              break;
            }
            case "exercise": {
              descriptionIndex = undefined;
              const value = getRenamedValue(
                opts,
                line,
                weekIndex,
                dayInWeekIndex,
              );
              const evalExercise = Program_getProgramExercise(
                dayIndex + 1,
                program,
                value,
              )!;

              if (evalExercise == null) {
                continue groupLoop;
              }

              const key = evalExercise.key;

              if (
                !finishedToAddDescription &&
                (evalExercise.descriptions.reuse ||
                  evalExercise.descriptions.values.length > 0)
              ) {
                const result = addExerciseDescriptions(
                  program,
                  evalExercise,
                  weekIndex,
                  dayInWeekIndex,
                  addedCurrentDescription,
                );
                if (result) {
                  exerciseTextArr.push(...result.lines);
                }
              }

              finishedToAddDescription = false;
              addedCurrentDescription = false;

              let plannerExercise: string;

              if (evalExercise.exerciseType) {
                const name = Exercise_fullName(
                  getExerciseOrDefault(
                    evalExercise.exerciseType,
                    settings.exercises,
                  ),
                  getCurrentEquipment(settings),
                  evalExercise.label,
                );
                plannerExercise =
                  evalExercise.order > 0
                    ? `${name}[${evalExercise.order}]`
                    : name;
              } else {
                plannerExercise = evalExercise.fullName;
              }
              plannerExercise += " / ";
              if (evalExercise.notused) {
                plannerExercise += "used: none / ";
              }
              const variations = evalExercise.evaluatedSetVariations;
              const globals = getGlobals(evalExercise);

              const shouldReuseSets = !!evalExercise.reuse;
              const dereuseDecisions = shouldReuseSets
                ? getDereuseDecisions(evalExercise)
                : [];
              if (shouldReuseSets) {
                function reuseToStr(): string {
                  const reuseExercise = evalExercise.reuse?.exercise;
                  const reuse = evalExercise.reuse;
                  if (!reuseExercise || !reuse) {
                    throw new Error("reuse.exercise is required");
                  }
                  let str = "...";
                  str += reuseExercise.exerciseType
                    ? Exercise_fullName(
                        getExerciseOrDefault(
                          reuseExercise.exerciseType,
                          settings.exercises,
                        ),
                        getCurrentEquipment(settings),
                        reuseExercise.label,
                      )
                    : reuseExercise.fullName;
                  if (reuse.week || reuse.day) {
                    const weekAndDay = filterUndefined([
                      reuse.week,
                      reuse.day,
                    ]).join(":");
                    str += `[${weekAndDay}]`;
                  }
                  return str;
                }

                plannerExercise += reuseToStr();

                if (dereuseDecisions.includes("sets")) {
                  plannerExercise +=
                    ` / ` +
                    variations
                      .map((v, i) => {
                        return variationToString(v, globals, i, evalExercise);
                      })
                      .join(" / ");
                }

                const overriddenGlobals: string[] = [];
                if (
                  dereuseDecisions.includes("weight") &&
                  globals.weight != null
                ) {
                  overriddenGlobals.push(
                    `${weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
                  );
                } else if (
                  dereuseDecisions.includes("weight") &&
                  globals.askWeight
                ) {
                  overriddenGlobals.push("?+");
                }
                if (dereuseDecisions.includes("rpe") && globals.rpe != null) {
                  overriddenGlobals.push(
                    `@${n(globals.rpe)}${globals.logRpe ? "+" : ""}`,
                  );
                }
                if (
                  dereuseDecisions.includes("timer") &&
                  globals.timer != null
                ) {
                  overriddenGlobals.push(`${n(globals.timer)}s`);
                }
                if (overriddenGlobals.length > 0) {
                  plannerExercise += ` / ${overriddenGlobals.join(" ")}`;
                }
              } else {
                if (evalExercise.setVariations.length > 0) {
                  plannerExercise += variations
                    .map((v, i) =>
                      variationToString(v, globals, i, evalExercise),
                    )
                    .join(" / ");
                }

                const globalsStr: string[] = [];
                if (globals.weight != null) {
                  globalsStr.push(
                    `${weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
                  );
                } else if (globals.askWeight) {
                  globalsStr.push("?+");
                }
                if (globals.rpe != null) {
                  globalsStr.push(
                    `@${globals.rpe}${globals.logRpe ? "+" : ""}`,
                  );
                }
                if (globals.timer != null) {
                  globalsStr.push(`${globals.timer}s`);
                }
                if (globalsStr.length > 0) {
                  plannerExercise += ` / ${globalsStr.join(" ")}`;
                }
              }

              function getWarmupSets(): string | undefined {
                const result = groupWarmupsSets(evalExercise.warmupSets ?? [])
                  .map(([first, length]) => {
                    const weight =
                      first.weight ??
                      (first.percentage != null
                        ? percentORM(first.percentage)
                        : w`0lb`);
                    return `${length}x${first.reps} ${print(weight)}`;
                  })
                  .join(", ");
                return result.length === 0 ? "none" : result;
              }

              if (!addedWarmupsMap[key] && evalExercise?.warmupSets) {
                const warmupSets = getWarmupSets();
                if (warmupSets != null) {
                  plannerExercise += ` / warmup: ${warmupSets}`;
                  addedWarmupsMap[key] = true;
                }
              }

              if (!addedIdMap[key] && (evalExercise.tags || []).length > 0) {
                plannerExercise += ` / id: tags(${(evalExercise.tags || []).join(", ")})`;
                addedIdMap[key] = true;
              }

              const superset = evalExercise.superset?.name;
              if (superset) {
                plannerExercise += ` / superset: ${superset}`;
              }

              const update = evalExercise.update;
              if (
                !addedUpdateMap[key] &&
                update &&
                (update.reuse || update.script)
              ) {
                if (
                  !evalExercise.reuse ||
                  dereuseDecisions.includes("update")
                ) {
                  if (evalExercise.update) {
                    plannerExercise +=
                      " / " + getUpdate(evalExercise.update, settings);
                  }
                  addedUpdateMap[key] = true;
                } else if (
                  update.reuse?.fullName === evalExercise.reuse.fullName
                ) {
                  addedUpdateMap[key] = true;
                }
              }

              const progress = evalExercise.progress;
              if (progress && progress.type === "none") {
                plannerExercise += ` / progress: none`;
              } else if (
                !addedProgressMap[key] &&
                progress &&
                (progress.reuse || progress.script)
              ) {
                if (
                  !evalExercise.reuse ||
                  dereuseDecisions.includes("progress")
                ) {
                  const progressStr = getProgress(
                    evalExercise,
                    settings,
                    false,
                  );
                  if (progressStr) {
                    plannerExercise += ` / ${progressStr}`;
                  }
                  addedProgressMap[key] = true;
                } else if (
                  progress.reuse?.fullName === evalExercise.reuse.fullName
                ) {
                  addedProgressMap[key] = true;
                }
              }
              exerciseTextArr.push(plannerExercise);
              break;
            }
          }
        }
        if (exerciseTextArr.length > 0) {
          groupTextArr = groupTextArr.concat(exerciseTextArr);
        }
      }
      plannerDay.exerciseText = groupTextArr.join("\n");
      plannerDay.description = programDay.description;
      plannerWeek.days.push(plannerDay);
      dayIndex += 1;
    }
    plannerWeeks.push(plannerWeek);
  }
  const result: IPlannerProgram = {
    name: program.name,
    weeks: plannerWeeks,
  };
  const repeatingExercises = new Set<string>();
  forExerciseInEvaluatedWeeks(program.weeks, (exercise) => {
    if (exercise.repeat != null && exercise.repeat.length > 0) {
      const key = PlannerKey_fromPlannerExercise(exercise, settings);
      repeatingExercises.add(key);
    }
  });

  return compactPlannerProgram(
    program.planner,
    result,
    settings,
    repeatingExercises,
  );
}

function variationToString(
  variation: IPlannerProgramExerciseEvaluatedSetVariation,
  globals: IPlannerToProgram2Globals,
  index: number,
  exercise: IPlannerProgramExercise,
): string {
  const result: string[] = [];
  for (const [set, count] of groupVariationSets(
    variation.sets,
    exercise,
    index,
  )) {
    let setStr = "";
    setStr += `${count}${set.isQuickAddSet ? "+" : ""}x`;
    setStr += set.minrep != null ? `${n(Math.max(0, set.minrep))}-` : "";
    setStr += `${n(Math.max(0, set.maxrep ?? 0))}`;
    setStr += set.isAmrap ? "+" : "";
    if (globals.weight == null && !globals.askWeight) {
      const weightValue = weightExprToStr(set.weight);
      if (weightValue) {
        setStr += ` ${weightValue}${set.askWeight ? "+" : ""}`;
      } else if (set.askWeight) {
        setStr += " ?+";
      }
    }
    if (globals.rpe == null && set.rpe != null) {
      setStr += ` @${n(Math.max(0, set.rpe))}`;
      if (set.logRpe) {
        setStr += "+";
      }
    }
    if (globals.timer == null) {
      setStr += set.timer ? ` ${n(Math.max(0, set.timer))}s` : "";
    }
    if (set.label) {
      setStr += ` (${set.label})`;
    }
    result.push(setStr);
  }
  let resultStr = "";
  if (index > 0 && variation.isCurrent) {
    resultStr += "! ";
  }
  return resultStr + result.map((r) => r.trim()).join(", ");
}
function groupVariationSets(
  sets: IPlannerProgramExerciseEvaluatedSet[],
  exercise: IPlannerProgramExercise,
  index: number,
): [IPlannerProgramExerciseEvaluatedSet, number][] {
  if (sets.length === 0) {
    const originalSets = PlannerProgramExercise_sets(exercise, index).at(0);
    return [
      [
        {
          maxrep: originalSets?.repRange?.maxrep || 1,
          minrep: originalSets?.repRange?.minrep,
          weight: originalSets?.weight || w`0lb`,
          logRpe: originalSets?.logRpe || false,
          isAmrap: originalSets?.repRange?.isAmrap || false,
          isQuickAddSet: originalSets?.repRange?.isQuickAddSet || false,
          askWeight: originalSets?.askWeight || false,
          rpe: originalSets?.rpe,
          timer: originalSets?.timer,
          label: originalSets?.label,
        },
        0,
      ],
    ];
  }
  let lastKey: string | undefined;
  const groups: [IPlannerProgramExerciseEvaluatedSet, number][] = [];
  for (const set of sets) {
    const key = `${set.maxrep}-${set.minrep}-${print(set.weight)}-${set.isAmrap}-${set.rpe}-${set.logRpe}-${
      set.timer
    }-${set.label}-${set.askWeight}`;
    if (lastKey === undefined || lastKey !== key) {
      groups.push([set, 0]);
    }
    groups[groups.length - 1][1] += 1;
    lastKey = key;
  }
  return groups;
}

function getGlobals(
  exercise: IPlannerProgramExercise,
): IPlannerToProgram2Globals {
  const variations = exercise.evaluatedSetVariations;
  if (variations.length === 0 || variations[0].sets.length === 0) {
    return {
      weight:
        exercise.globals?.weight ?? exercise.reuse?.exercise?.globals?.weight,
      rpe: exercise.globals?.rpe ?? exercise.reuse?.exercise?.globals?.rpe,
      timer:
        exercise.globals?.timer ?? exercise.reuse?.exercise?.globals?.timer,
      logRpe:
        exercise.globals?.logRpe ?? exercise.reuse?.exercise?.globals?.logRpe,
      askWeight:
        exercise.globals?.askWeight ??
        exercise.reuse?.exercise?.globals?.askWeight,
    };
  }
  const first = variations.at(0)?.sets.at(0);
  const firstWeight = first?.weight;
  const firstRpe = first?.rpe;
  const firstLogRpe = !!first?.logRpe;
  const firstAskWeight = !!first?.askWeight;
  const firstTimer = first?.timer;
  return {
    weight:
      firstWeight != null &&
      variations.every((v) =>
        v.sets.every(
          (s) => eq(s.weight, firstWeight) && s.askWeight === firstAskWeight,
        ),
      )
        ? firstWeight
        : undefined,
    askWeight: variations.every((v) =>
      v.sets.every((s) => eq(s.weight, firstWeight) && s.askWeight),
    ),
    rpe:
      firstRpe != null &&
      variations.every((v) =>
        v.sets.every((s) => s.rpe === firstRpe && s.logRpe === firstLogRpe),
      )
        ? firstRpe
        : undefined,
    logRpe: variations.every((v) =>
      v.sets.every((s) => s.rpe === firstRpe && s.logRpe),
    ),
    timer:
      firstTimer != null &&
      variations.every((v) => v.sets.every((s) => s.timer === firstTimer))
        ? firstTimer
        : undefined,
  };
}

const weightExprToStr = (weightExpr?: IWeight | IDynamicWeight): string =>
  weightExpr ? print(weightExpr) : "";
//#endregion

//#region ScriptRunner

export function validateScript(
  script: string,
  state: IProgramState,
  bindings: IScriptBindings,
  fns: IScriptFunctions,
  mode: "planner" | "update",
): void {
  const trackedVarNames = new Set<string>();
  const [firstError, ..._rest] = validate(
    parseBound(LiftoscriptParser, script),
    {
      knownFunctions: Object.keys(fns),
      knownBindings: Object.keys(bindings),
      knownStateVariables: Object.keys(state),
      mode: mode,
      onError: (message, node) => {
        const { line, offset, from, to } = node.getPointer();
        throw new LiftoscriptSyntaxError(message, line, offset, from, to);
      },
      trackVariable: (name) => trackedVarNames.add(name),
      isKnownVariable: (name) => trackedVarNames.has(name),
    },
  );
  // @todo This seems odd. I should push the decision to throw up as far as it can go.
  if (firstError) {
    throw firstError;
  }
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
//#endregion
