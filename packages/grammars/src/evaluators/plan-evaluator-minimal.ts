import { memoize } from "micro-memoize";
import { z } from "zod";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  CollectionUtils_compact,
  CollectionUtils_sortBy,
} from "../utils/collection";
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
  ObjectUtils_values,
} from "@/utils/object";
import { StringUtils_unindent } from "@/utils/string";
import type { IAssignmentOp, ILiftoscriptEvaluatorUpdate } from "@/logic/types";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";
import {
  LiftoscriptEvaluator,
  LiftoscriptSyntaxError,
} from "@/evaluators/logic-evaluator.ts";
import {
  applyOp,
  build,
  eq,
  type IDynamicWeight,
  type IUnit,
  type IWeight,
  parse,
  parsePct,
  percentORM,
  print,
  roundConvertTo,
  roundTo005,
  rpeMultiplier,
  rpePct,
  TDynamicWeight,
  TWeight,
  typeOf,
  w,
} from "@/quantities/weight.ts";
import {
  type IExerciseDataValue,
  type IPlannerSettings,
  type IProgramState,
  type IScriptFnContext,
  type IScriptFunctions,
  TProgramState,
  TSet,
} from "@/common-types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import {
  Exercise_findByName,
  Exercise_findByNameAndEquipment,
  Exercise_findByNameEquipment,
  Exercise_fullName,
  getExerciseOrDefault,
  getOrmOrStartingWeight,
  type IAllCustomExercises,
  type IExercise,
  type IExerciseType,
  isUnilateral,
  TExerciseType,
  toKey,
} from "@/exercises";
import { equipmentName, type IAllEquipment } from "@/equipment";
import {
  getCurrentEquipment,
  getPreferredUnit,
  type ISettings,
} from "@/user-settings";
import { PlannerNodeName } from "@/planner/parsing/guards.ts";
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
import { parseBound, type SourcedSyntaxNode } from "@/utils/lezer.ts";
import { isEqual, omitBy, pick } from "es-toolkit";
import type { Tagged } from "type-fest";

//#region Program

interface IEvaluatedProgramWeek {
  name: string;
  description?: string;
  days: IEvaluatedProgramDay[];
}

interface IEvaluatedProgramDay {
  name: string;
  dayData: Required<IDayData>;
  description?: string;
  exercises: IPlannerProgramExercise[];
}

interface IEvaluatedProgramError {
  error: PlannerSyntaxError;
  dayData: Required<IDayData>;
}

interface IEvaluatedProgram {
  id: string;
  planner: IPlannerProgram;
  name: string;
  nextDay: number;
  errors: IEvaluatedProgramError[];
  weeks: IEvaluatedProgramWeek[];
  states: IByTag<IProgramState>;
}

type IProgramMode = "planner" | "update";

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
      Program_numberOfDays(program),
      Math.max(1, (dayIndex || program.nextDay) ?? 0),
    ),
  );
  const dayData = Program_getDayData(program, day);
  const { week, dayInWeek } = dayData;

  const fullDayName = Program_getDayName(program, day);
  const now = Date.now();
  const programDay = Program_getProgramDay(program, day);
  const dayExercises = programDay
    ? Program_getProgramDayUsedExercises(programDay)
    : [];
  const sortedDayExercises = CollectionUtils_sortBy(dayExercises, "order");
  const entries = sortedDayExercises.map((exercise, i) => {
    return Program_nextHistoryEntry(
      program,
      dayData,
      i,
      exercise,
      stats,
      settings,
    );
  });
  return {
    id: 0,
    date: new Date().toISOString(),
    programId: program.id,
    programName: program.name,
    intervals: [],
    day,
    week,
    dayInWeek,
    dayName: fullDayName,
    startTime: now,
    updatedAt: now,
    entries,
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

  const newState: IProgramState = {
    ...state,
    ...userPromptedStateVars,
  };
  const otherStates = structuredClone(program.states);

  const script =
    PlannerProgramExercise_getProgressScript(programExercise) || "";
  let updates: ILiftoscriptEvaluatorUpdate[] = [];
  try {
    const runner = new ScriptRunner(
      script,
      newState,
      otherStates,
      bindings,
      fns,
      settings.units,
      {
        exerciseType: programExercise.exerciseType,
        unit: settings.units,
        prints: [],
      },
      "planner",
    );
    runner.execute();
    updates = runner.getUpdates();
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
  const programDay = program ? Program_getProgramDay(program, day) : undefined;
  const dayExercises = programDay
    ? Program_getProgramDayUsedExercises(programDay)
    : [];
  let programExercise = dayExercises.find((pe) => pe.key === key);
  if (programExercise == null) {
    const allExercises = program
      ? Program_getAllProgramExercisesWithType(program)
      : [];
    programExercise = allExercises.find((pe) => pe.key === key);
    if (programExercise != null) {
      programExercise = {
        ...programExercise,
        dayData: Program_getDayData(program, day),
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
  const exerciseData: IExerciseData = {};
  const newEvaluatedProgram = Program_forceEvaluate(program, settings);
  const dayData = Progress_getDayData(progress);
  const programDay = Program_getProgramDay(newEvaluatedProgram, progress.day);
  if (!programDay) {
    return { program, exerciseData };
  }
  for (const entry of progress.entries) {
    if (
      entry != null &&
      !entry.isSuppressed &&
      entry.sets.some((s) => s.isCompleted)
    ) {
      const programExercise =
        program && entry.programExerciseId
          ? Program_getProgramExerciseForKeyAndDay(
              newEvaluatedProgram,
              dayData.day,
              entry.programExerciseId,
            )
          : undefined;
      if (programExercise) {
        const newStateResult = Program_runFinishDayScript(
          programExercise,
          newEvaluatedProgram,
          dayData,
          entry,
          settings,
          stats,
          progress.userPromptedStateVars?.[programExercise.key],
        );
        if (newStateResult.success) {
          const { state, updates, bindings, otherStates } = newStateResult.data;
          const exerciseKey = toKey(entry.exercise);
          if (
            !eq(bindings.rm1, getOrmOrStartingWeight(entry.exercise, settings))
          ) {
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
            forExerciseInEvaluatedWeeks(
              newEvaluatedProgram.weeks,
              (exercise) => {
                if (exercise.tags?.includes(Number(key)) && exercise.progress) {
                  exercise.progress.state = {
                    ...exercise.progress.state,
                    ...otherStates[key],
                  };
                }
              },
            );
          }
        } else {
        }
      }
    }
  }
  const theNextDay = Program_nextDay(newEvaluatedProgram, progress.day);
  const newPlanner = convertToPlanner(newEvaluatedProgram, settings);
  const newProgram = structuredClone(program);
  newProgram.nextDay = theNextDay;
  newProgram.planner = newPlanner;

  return {
    program: newProgram,
    exerciseData,
  };
}

function Program_getAllProgramExercises(
  evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExercise[] {
  return evaluatedProgram.weeks.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  );
}

function Program_getAllProgramExercisesWithType(
  evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExerciseWithType[] {
  const used = Program_getAllProgramExercises(evaluatedProgram).filter(
    (e) => e.exerciseType != null,
  );
  return used as IPlannerProgramExerciseWithType[];
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
  const { evaluatedWeeks } = PlannerEvaluator_forceEvaluate(
    program.planner!,
    settings,
  );
  let dayNum = 0;
  const errors: IEvaluatedProgramError[] = [];
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

function Program_numberOfDays(program: IEvaluatedProgram): number {
  return program.weeks.reduce((sum, week) => sum + week.days.length, 0);
}

function Program_getWeekFromDay(
  program: IEvaluatedProgram,
  day: number,
): number {
  let daysTotal = 0;
  for (let i = 0; i < program.weeks.length; i += 1) {
    const weekDays = program.weeks[i].days.length;
    daysTotal += weekDays;
    if (daysTotal >= day) {
      return i + 1;
    }
  }
  return 1;
}

function Program_getDayData(
  program: IEvaluatedProgram,
  day: number,
): Required<IDayData> {
  return {
    day,
    week: Program_getWeekFromDay(program, day),
    dayInWeek: Program_getDayInWeek(program, day),
  };
}

function Program_getDayInWeek(program: IEvaluatedProgram, day: number): number {
  let daysTotal = 0;
  for (const week of program.weeks) {
    daysTotal += week.days.length;
    if (daysTotal >= day) {
      return day - (daysTotal - week.days.length);
    }
  }
  return 1;
}

function Program_getDayName(program: IEvaluatedProgram, day: number): string {
  const dayData = Program_getDayData(program, day);
  const programDay = Program_getProgramDay(program, day);
  const week = program.weeks[(dayData.week || 1) - 1];
  const isMultiweek = program.weeks.length > 1 && week != null;
  return `${isMultiweek ? `${week.name} - ` : ""}${programDay?.name}`;
}

function Program_getProgramDay(
  program: IEvaluatedProgram,
  day: number,
): IEvaluatedProgramDay | undefined {
  let aDay = 0;
  for (const week of program.weeks || []) {
    for (const d of week.days) {
      aDay += 1;
      if (day === aDay) {
        return d;
      }
    }
  }
  return undefined;
}

function Program_getProgramDayExercises(
  programDay: IEvaluatedProgramDay,
): IPlannerProgramExerciseWithType[] {
  const list = programDay.exercises.filter((e) => e.exerciseType != null);
  return list as IPlannerProgramExerciseWithType[];
}

function Program_getProgramDayUsedExercises(
  programDay: IEvaluatedProgramDay,
): IPlannerProgramExerciseWithType[] {
  const list = programDay.exercises.filter(
    (e) => !e.notused && e.exerciseType != null,
  );
  return list as IPlannerProgramExerciseWithType[];
}

export function Program_applyEvaluatedProgram(
  program: IProgram,
  evaluatedProgram: IEvaluatedProgram,
  settings: ISettings,
): IProgram {
  const newProgram = structuredClone(program);
  newProgram.planner = convertToPlanner(evaluatedProgram, settings);
  newProgram.nextDay = evaluatedProgram.nextDay;
  return newProgram;
}

function Program_getProgramExercise(
  day: number,
  program?: IEvaluatedProgram,
  key?: string,
): IPlannerProgramExercise | undefined {
  if (key == null || program == null) {
    return undefined;
  }
  const programDay = Program_getProgramDay(program, day);
  return programDay?.exercises.find((e) => e.key === key);
}

function Program_nextDay(program: IEvaluatedProgram, day?: number): number {
  const nd = (day != null ? day % Program_numberOfDays(program) : 0) + 1;
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

//#region Settings
function Settings_programContentBuild(): Pick<
  ISettings,
  "timers" | "units" | "planner"
> {
  return {
    timers: {
      warmup: 90,
      workout: 180,
      reminder: 900,
    },
    units: "lb",
    planner: Settings_buildPlannerSettings(),
  };
}

export function Settings_defaultEquipment(): IAllEquipment {
  return {
    barbell: {
      multiplier: 2,
      bar: {
        lb: w`45lb`,
        kg: w`20kg`,
      },
      plates: [
        { weight: w`45lb`, num: 8 },
        { weight: w`25lb`, num: 4 },
        { weight: w`10lb`, num: 4 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`20kg`, num: 8 },
        { weight: w`10kg`, num: 4 },
        { weight: w`5kg`, num: 4 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    trapbar: {
      multiplier: 2,
      bar: {
        lb: w`45lb`,
        kg: w`20kg`,
      },
      plates: [
        { weight: w`45lb`, num: 8 },
        { weight: w`25lb`, num: 4 },
        { weight: w`10lb`, num: 4 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`20kg`, num: 8 },
        { weight: w`10kg`, num: 4 },
        { weight: w`5kg`, num: 4 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    leverageMachine: {
      multiplier: 1,
      bar: {
        lb: w`0lb`,
        kg: w`0kg`,
      },
      plates: [
        { weight: w`45lb`, num: 8 },
        { weight: w`25lb`, num: 4 },
        { weight: w`10lb`, num: 4 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`20kg`, num: 8 },
        { weight: w`10kg`, num: 4 },
        { weight: w`5kg`, num: 4 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    smith: {
      multiplier: 2,
      bar: {
        lb: w`45lb`,
        kg: w`20kg`,
      },
      plates: [
        { weight: w`45lb`, num: 8 },
        { weight: w`25lb`, num: 4 },
        { weight: w`10lb`, num: 4 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`20kg`, num: 8 },
        { weight: w`10kg`, num: 4 },
        { weight: w`5kg`, num: 4 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    dumbbell: {
      multiplier: 2,
      bar: {
        lb: w`10lb`,
        kg: w`5kg`,
      },
      plates: [
        { weight: w`10lb`, num: 8 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`5kg`, num: 8 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [
        w`10lb`,
        w`15lb`,
        w`20lb`,
        w`25lb`,
        w`30lb`,
        w`35lb`,
        w`40lb`,
        w`4kg`,
        w`6kg`,
        w`8kg`,
        w`10kg`,
        w`12kg`,
        w`14kg`,
        w`20kg`,
      ],
      isFixed: false,
    },
    ezbar: {
      multiplier: 2,
      bar: {
        lb: w`20lb`,
        kg: w`10kg`,
      },
      plates: [
        { weight: w`45lb`, num: 8 },
        { weight: w`25lb`, num: 4 },
        { weight: w`10lb`, num: 4 },
        { weight: w`5lb`, num: 4 },
        { weight: w`2.5lb`, num: 4 },
        { weight: w`1.25lb`, num: 2 },
        { weight: w`20kg`, num: 8 },
        { weight: w`10kg`, num: 4 },
        { weight: w`5kg`, num: 4 },
        { weight: w`2.5kg`, num: 4 },
        { weight: w`1.25kg`, num: 4 },
        { weight: w`0.5kg`, num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    cable: {
      multiplier: 1,
      bar: {
        lb: w`0lb`,
        kg: w`0kg`,
      },
      plates: [
        {
          weight: w`10lb`,
          num: 20,
        },
        {
          weight: w`5lb`,
          num: 10,
        },
        {
          weight: w`5kg`,
          num: 20,
        },
        {
          weight: w`2.5kg`,
          num: 10,
        },
      ],
      fixed: [],
      isFixed: false,
    },
    kettlebell: {
      multiplier: 1,
      bar: {
        lb: w`0lb`,
        kg: w`0kg`,
      },
      plates: [],
      fixed: [
        w`10lb`,
        w`15lb`,
        w`20lb`,
        w`25lb`,
        w`30lb`,
        w`35lb`,
        w`40lb`,
        w`4kg`,
        w`8kg`,
        w`12kg`,
        w`16kg`,
        w`24kg`,
      ],
      isFixed: true,
    },
  };
}

export function Settings_build(): ISettings {
  return {
    ...Settings_programContentBuild(),
    graphsSettings: {
      isSameXAxis: false,
      isWithBodyweight: false,
      isWithOneRm: true,
    },
    exerciseData: {},
    graphOptions: {},
    exerciseStatsSettings: {
      ascendingSort: false,
    },
    gyms: [
      {
        id: "default",
        name: "Main",
        equipment: Settings_defaultEquipment(),
      },
    ],
    deletedGyms: [],
    volume: 1.0,
    vibration: false,
    startWeekFromMonday: false,
    lengthUnits: "in",
    workoutSettings: {
      targetType: "target",
    },
    exercises: {},
    planner: Settings_buildPlannerSettings(),
    muscleGroups: {
      data: {},
    },
  };
}

function Settings_buildPlannerSettings(): IPlannerSettings {
  return {
    strengthSetsPct: 30,
    hypertrophySetsPct: 70,
    weeklyRangeSets: {
      shoulders: [10, 12],
      triceps: [10, 12],
      back: [10, 12],
      abs: [10, 12],
      glutes: [10, 12],
      hamstrings: [10, 12],
      quadriceps: [10, 12],
      chest: [10, 12],
      biceps: [10, 12],
      calves: [10, 12],
      forearms: [10, 12],
    },
    weeklyFrequency: {
      shoulders: 2,
      triceps: 2,
      back: 2,
      abs: 2,
      glutes: 2,
      hamstrings: 2,
      quadriceps: 2,
      chest: 2,
      biceps: 2,
      calves: 2,
      forearms: 2,
    },
    synergistMultiplier: 0.5,
  };
}

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
    if (ex.key === programExerciseId) {
      for (const setVariation of ex.evaluatedSetVariations) {
        for (const set of setVariation.sets) {
          const weightChange = weightChanges.find((wc) =>
            eq(wc.originalWeight, set.weight),
          );
          if (weightChange != null) {
            set.weight = weightChange.weight;
          }
        }
      }
    }
  });
  return newEvalutedProgram;
}

function PlannerProgram_replaceExercise(
  planner: IPlannerProgram,
  key: string,
  newLabel: string | undefined,
  toExerciseType: IExerciseType | string,
  settings: ISettings,
  dayData?: Required<IDayData>,
): IPlannerProgram {
  const evaluatedProgram = structuredClone(
    Program_evaluate({ ...Program_create("Temp"), planner }, settings),
  );
  const allExercises = Program_getAllProgramExercises(evaluatedProgram);
  let labelSuffix: string | undefined = undefined;
  let noConflicts = false;

  function getLabel(label?: string): string | undefined {
    return (newLabel ?? label) || labelSuffix
      ? CollectionUtils_compact([newLabel ?? label, labelSuffix]).join("-")
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

  const renameMapping: Record<
    string,
    { to: string; dayData?: Required<IDayData> }
  > = {};
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
  dayData?: Required<IDayData>,
): IEither<IProgram, string> {
  const newPlanner = PlannerProgram_replaceExercise(
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

function PlannerProgram_compact(
  oldPlannerProgram: IPlannerProgram,
  plannerProgram: IPlannerProgram,
  settings: ISettings,
  additionalRepeatingExercises?: Set<string>,
): IPlannerProgram {
  let dayIndex = 0;
  const repeatingExercises = new Set<string>();
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
  for (const ex of additionalRepeatingExercises || []) {
    repeatingExercises.add(ex);
  }

  const lastDescriptions: OpenRecord<string, number> = {};
  plannerProgram.weeks.forEach((week) => {
    week.days.forEach((day, dayInWeekIndex) => {
      if (lastDescriptions[dayInWeekIndex] == null) {
        lastDescriptions[dayInWeekIndex] = day.description;
      } else if (lastDescriptions[dayInWeekIndex] === day.description) {
        day.description = undefined;
      } else {
        lastDescriptions[dayInWeekIndex] = day.description;
      }
    });
  });

  const mapping = plannerProgram.weeks.map((week, weekIndex) => {
    return week.days.map((day, dayInWeekIndex) => {
      const evaluator = new PlannerExerciseEvaluator(settings, "perday", {
        day: dayIndex + 1,
        dayInWeek: dayInWeekIndex + 1,
        week: weekIndex + 1,
      });
      dayIndex += 1;

      return evaluator.topLineMap(
        parseBound(plannerExerciseParser, day.exerciseText),
      );
    });
  });

  for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
    const week = mapping[weekIndex];
    for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
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
    for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
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

function PlannerProgram_groupedTopLines(
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

function PlannerProgram_topLineItems(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): IPlannerTopLineItem[][][] {
  let dayIndex = 0;

  const mapping = plannerProgram.weeks.map((week, weekIndex) => {
    return week.days.map((day, dayInWeekIndex) => {
      const evaluator = new PlannerExerciseEvaluator(settings, "perday", {
        day: dayIndex + 1,
        dayInWeek: dayInWeekIndex + 1,
        week: weekIndex + 1,
      });
      dayIndex += 1;

      return evaluator.topLineMap(
        parseBound(plannerExerciseParser, day.exerciseText),
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

export function PlannerProgram_evaluate(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): { evaluatedWeeks: IPlannerEvalResult[][]; exerciseFullNames: string[] } {
  return PlannerEvaluator_evaluate(plannerProgram, settings);
}

export function PlannerProgram_evaluateText(
  fullProgramText: string,
): IPlannerProgramWeek[] {
  const evaluator = new PlannerExerciseEvaluator(Settings_build(), "fulltext");
  const data = evaluator.evaluatePreservingSource(
    parseBound(plannerExerciseParser, fullProgramText),
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
  let fullText = "";
  for (const week of weeks) {
    if (week.description != null) {
      fullText +=
        week.description
          .split("\n")
          .map((l) => (l ? `// ${l}` : "//"))
          .join("\n") + "\n";
    }
    fullText += `# ${week.name}\n`;
    for (const day of week.days) {
      if (day.description != null) {
        fullText +=
          day.description
            .split("\n")
            .map((l) => `// ${l}`)
            .join("\n") + "\n";
      }
      fullText += `## ${day.name}\n`;
      fullText += `${day.exerciseText}\n\n`;
    }
    fullText += "\n";
  }
  return fullText;
}

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

type IDayData = {
  week?: number;
  day: number;
  dayInWeek?: number;
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
  return CollectionUtils_sortBy(ObjectUtils_values(results), "current", true);
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
    const target = value.target;
    const [week, day, variation, set] = target;
    let dayIndex = 0;
    for (let weekIndex = 0; weekIndex < program.weeks.length; weekIndex += 1) {
      const programWeek = program.weeks[weekIndex];
      for (
        let dayInWeekIndex = 0;
        dayInWeekIndex < programWeek.days.length;
        dayInWeekIndex += 1
      ) {
        const programDay = programWeek.days[dayInWeekIndex];
        const dayExercises = Program_getProgramDayExercises(programDay);
        for (const exercise of dayExercises) {
          if (exercise.key !== programExerciseKey) {
            continue;
          }
          for (
            let variationIndex = 0;
            variationIndex < exercise.evaluatedSetVariations.length;
            variationIndex += 1
          ) {
            const setVariation =
              exercise.evaluatedSetVariations[variationIndex];
            const sets = setVariation.sets;
            if (
              (week === "*" || week === weekIndex + 1) &&
              (day === "*" || day === dayInWeekIndex + 1) &&
              (variation === "*" || variation === variationIndex + 1)
            ) {
              if (key === "numberOfSets" && typeof value.value === "number") {
                const newValue = MathUtils_applyOp(
                  sets.length,
                  value.value,
                  value.op,
                );
                const defaultSet: IPlannerProgramExerciseEvaluatedSet = {
                  maxrep: 1,
                  weight: w`100lb`,
                  logRpe: false,
                  isAmrap: false,
                  isQuickAddSet: false,
                  askWeight: false,
                };
                const lastSet = sets[sets.length - 1] || defaultSet;
                sets.splice(newValue);
                for (let i = sets.length; i < newValue; i += 1) {
                  sets.push(structuredClone(lastSet));
                }
              }
            }
            for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
              if (
                (week === "*" || week === weekIndex + 1) &&
                (day === "*" || day === dayInWeekIndex + 1) &&
                (variation === "*" || variation === variationIndex + 1) &&
                (set === "*" || set === setIndex + 1)
              ) {
                if (key === "RPE") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "rpe",
                    value.value,
                    value.op,
                  );
                } else if (key === "reps") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "maxrep",
                    value.value,
                    value.op,
                  );
                } else if (key === "minReps") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "minrep",
                    value.value,
                    value.op,
                  );
                } else if (key === "timers") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "timer",
                    value.value,
                    value.op,
                  );
                } else if (key === "weights") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "weight",
                    value.value,
                    value.op,
                  );
                } else if (key === "amraps") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "isAmrap",
                    value.value,
                    value.op,
                  );
                } else if (key === "logrpes") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "logRpe",
                    value.value,
                    value.op,
                  );
                } else if (key === "askweights") {
                  operation(
                    exercise,
                    sets[setIndex],
                    settings,
                    "askWeight",
                    value.value,
                    value.op,
                  );
                }
              }
            }
          }
          if (
            (week === "*" || week === weekIndex + 1) &&
            (day === "*" || day === dayInWeekIndex + 1)
          ) {
            if (
              key === "setVariationIndex" &&
              typeof update.value.value === "number"
            ) {
              let indexValue: number;
              if (update.value.op === "=") {
                indexValue = update.value.value - 1;
              } else {
                const currentSetVariationIndex =
                  PlannerProgramExercise_currentEvaluatedSetVariationIndex(
                    exercise,
                  );
                indexValue = applyOp(
                  undefined,
                  currentSetVariationIndex,
                  update.value.value,
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
            } else if (
              key === "descriptionIndex" &&
              typeof update.value.value === "number"
            ) {
              let indexValue: number;
              if (update.value.op === "=") {
                indexValue = update.value.value - 1;
              } else {
                const currentDescriptionIndex =
                  PlannerProgramExercise_currentDescriptionIndex(exercise);
                indexValue = applyOp(
                  undefined,
                  currentDescriptionIndex,
                  update.value.value,
                  update.value.op,
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
            }
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
  const oldValue =
    set[key] ??
    ProgramSet_getEvaluatedWeight(set, programExercise.exerciseType, settings);
  const valueToAssign = applyOp(
    getOrmOrStartingWeight(programExercise.exerciseType, settings),
    oldValue,
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

function PlannerKey_fromPlannerExercise(
  plannerExercise: IPlannerProgramExercise,
  settings: ISettings,
): PlannerKey {
  if (plannerExercise.exerciseType) {
    return PlannerKey_fromExerciseType(
      plannerExercise.exerciseType,
      plannerExercise.label,
    );
  } else {
    return PlannerKey_fromFullName(
      plannerExercise.fullName,
      settings.exercises,
    );
  }
}

function PlannerKey_fromExerciseType(
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

const PlannerKey_fromLabelNameAndEquipment = memoize(
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

type IPlannerProgramExercise = {
  id: string;
  key: string;
  fullName: string;
  shortName: string;
  dayData: Required<IDayData>;
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
    fullName: IPlannerSyntaxPointer;
    supersetPoint?: IPlannerSyntaxPointer;
    reuseSetPoint?: IPlannerSyntaxPointer;
    progressPoint?: IPlannerSyntaxPointer;
    updatePoint?: IPlannerSyntaxPointer;
    idPoint?: IPlannerSyntaxPointer;
    warmupPoint?: IPlannerSyntaxPointer;
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
  repRange?: IPlannerProgramExerciseRepRange;
  timer?: number;
  rpe?: number;
  logRpe?: boolean;
  percentage?: number;
  weight?: IWeight;
  label?: string;
  askWeight?: boolean;
}

interface IPlannerProgramExerciseWarmupSet {
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

interface IPlannerProgramReuse {
  fullName: string;
  source: IPlannerProgramReuseSource;
  week?: number;
  day?: number;
  exercise?: IPlannerProgramExercise;
}

type IProgramExerciseProgressType = "custom" | "lp" | "dp" | "sum" | "none";
type IProgramExerciseUpdateType = "custom" | "lp" | "dp" | "sum";

interface IProgramExerciseDescriptions {
  values: {
    value: string;
    isCurrent: boolean;
  }[];
  reuse?: IPlannerProgramReuse;
}

interface IProgramExerciseProgress {
  type: IProgramExerciseProgressType;
  state: IProgramState;
  stateMetadata: IProgramStateMetadata;
  script?: string;
  reuse?: IPlannerProgramReuse;
  liftoscriptNode?: SyntaxNode;
}

interface IProgramExerciseUpdate {
  type: IProgramExerciseUpdateType;
  script?: string;
  reuse?: IPlannerProgramReuse;
  liftoscriptNode?: SourcedSyntaxNode;
  meta?: {
    stateKeys?: Set<string>;
  };
}

interface IPlannerProgramExerciseRepRange {
  numberOfSets: number;
  maxrep?: number;
  minrep?: number;
  isAmrap: boolean;
  isQuickAddSet: boolean;
}

//#endregion

//#region Planner Exercise Evaluator
interface IPlannerTopLineItem {
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

type IPlannerSyntaxPointer = {
  line: number;
  offset: number;
  from: number;
  to: number;
};

export class PlannerSyntaxError extends SyntaxError {
  public readonly line: number;
  public readonly offset: number;
  public readonly from: number;
  public readonly to: number;

  public static fromPoint(
    fullName: string | undefined,
    message: string,
    point: IPlannerSyntaxPointer,
  ): PlannerSyntaxError {
    return new PlannerSyntaxError(
      `${fullName ? `${fullName}: ` : ""}${message} (${point.line}:${point.offset})`,
      point.line,
      point.offset,
      point.from,
      point.to,
    );
  }

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

  public toString(): string {
    return this.message;
  }
}

type IPlannerEvalResult = IEither<
  IPlannerProgramExercise[],
  PlannerSyntaxError
>;
type IPlannerEvalFullResult = IEither<
  IPlannerExerciseEvaluatorWeek[],
  PlannerSyntaxError
>;

function getChildren(node: SourcedSyntaxNode): SourcedSyntaxNode[] {
  const cur = node.cursor();
  const result: SourcedSyntaxNode[] = [];
  if (!cur.firstChild()) {
    return result;
  }
  do {
    result.push(cur.node);
  } while (cur.nextSibling());
  return result;
}

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
 * A program parsed into days and weeks, but with the exercises left as raw source code
 */
interface IPlannerExerciseEvaluatorTextWeek {
  name: string;
  description?: string;
  days: {
    name: string;
    description?: string;
    exercises: string[];
  }[];
}

type IPlannerNonExerciseFullTextLine = {
  type: "comment" | "triplelinecomment" | "empty";
  line: string;
};

/**
 * perday -> single-day exercise list
 * full -> full program with structured exercises
 * fulltext -> preserve raw source lines for round-trip text
 */
type IPlannerExerciseEvaluatorMode = "perday" | "full" | "fulltext";

function isEqualProgress(
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

function isEqualUpdate(
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
        ? parse(fnArgValStr)
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

// @todo used in testing? Don't delete until the test making use of this is converted
export function changeWeightsToCompletedWeights(oldScript: string): string {
  const node = plannerExerciseParser.parse(oldScript);
  const cursor = node.cursor();
  let script = oldScript;
  let shift = 0;
  do {
    if (cursor.node.type.name === PlannerNodeName.Liftoscript) {
      const value = LiftoscriptEvaluator.getValueRaw(oldScript, cursor.node);
      const from = cursor.node.from;
      const to = cursor.node.to;
      const newValue =
        LiftoscriptEvaluator.changeWeightsToCompleteWeights(value);
      script =
        script.substring(0, from + shift) +
        newValue +
        script.substring(to + shift);
      shift = shift + newValue.length - value.length;
    }
  } while (cursor.next());
  return script;
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

function getRepRange(
  setParts: string,
): IPlannerProgramExerciseRepRange | undefined {
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
    minrep: minrepStr != null ? parseInt(minrepStr, 10) : undefined,
    maxrep: parseInt(maxrepStr, 10),
    isAmrap: isAmrap,
    isQuickAddSet: numberOfSetsStr.endsWith("+"),
  };
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

function getNodeSourceEscapedWhiteSpace(node: SourcedSyntaxNode): string {
  return node.source.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

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

export class PlannerExerciseEvaluator {
  private readonly mode: IPlannerExerciseEvaluatorMode;
  private dayData: Required<IDayData>;
  private readonly settings: ISettings;
  private weeks: IPlannerExerciseEvaluatorWeek[] = [];
  private exerciseIndex: number = 0;

  private latestDescriptions: string[][] = [];

  /**
   *
   * @private
   */
  private weeksFullText: IPlannerExerciseEvaluatorTextWeek[] = [];
  private ongoingLinesFullText: IPlannerNonExerciseFullTextLine[] = [];

  constructor(
    settings: ISettings,
    mode: IPlannerExerciseEvaluatorMode,
    dayData?: Required<IDayData>,
  ) {
    this.settings = settings;
    this.dayData = dayData || { day: 1, week: 1, dayInWeek: 1 };
    this.mode = mode;
  }

  private getPoint(node: SourcedSyntaxNode): IPlannerSyntaxPointer {
    const [line, offset] = node.getLineAndOffset();
    return { line, offset, from: node.from, to: node.to };
  }

  private error(message: string, node: SourcedSyntaxNode): never {
    throw PlannerSyntaxError.fromPoint(undefined, message, this.getPoint(node));
  }

  public parse(expr: SourcedSyntaxNode): void {
    const cursor = expr.cursor();
    do {
      if (cursor.node.type.isError) {
        this.error("Syntax error", cursor.node);
      }
    } while (cursor.next());
  }

  private evaluateSet(expr: SourcedSyntaxNode): IPlannerProgramExerciseSet {
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
              getNodeSourceEscapedWhiteSpace(percentageNode).replace(
                /[%+]/,
                "",
              ),
            );
      const weight = getWeight(weightNode);
      const label = labelNode
        ? getChildren(labelNode)
            .map((n) => getNodeSourceEscapedWhiteSpace(n))
            .join(" ")
        : undefined;
      if (labelNode && label && label.length > 8) {
        this.error("Label length should be 8 chars max", labelNode);
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

  private evaluateId(expr: SourcedSyntaxNode): number[] {
    if (expr.type.name === PlannerNodeName.ExerciseProperty) {
      const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
      if (valueNode == null) {
        throw this.error(`Missing value for the property 'id'`, expr);
      }
      const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
      if (fnNameNode == null) {
        assert(PlannerNodeName.FunctionName);
      }
      const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
      if (["tags"].indexOf(fnName) === -1) {
        this.error(`There's no such id type - '${fnName}'`, fnNameNode);
      }
      const fnArgs = valueNode
        .getChildren(PlannerNodeName.FunctionArgument)
        .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
      if (fnName === "tags") {
        if (fnArgs.length === 0) {
          this.error(
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

  private evaluateUpdate(
    expr: SourcedSyntaxNode,
    exerciseType?: IExerciseType,
  ): IProgramExerciseUpdate {
    if (expr.type.name === PlannerNodeName.ExerciseProperty) {
      const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
      if (valueNode == null) {
        throw this.error(`Missing value for the property 'update'`, expr);
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
          this.error(
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
          const liftoscriptEvaluator = new ScriptRunner(
            script,
            {},
            {},
            Progress_createEmptyScriptBindings(this.dayData, this.settings),
            Progress_createScriptFunctions(this.settings),
            this.settings.units,
            { exerciseType, unit: this.settings.units, prints: [] },
            "update",
          );
          const stateKeys = liftoscriptEvaluator.getStateVariableKeys();
          meta = { stateKeys };
        }
        if (!script && !body) {
          this.error(
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
        this.error(
          `There's no such update progression exists - '${fnName}'`,
          fnNameNode,
        );
      }
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  }

  private validateProgress(
    fnName: string,
    fnArgs: string[],
    fnNameNode: SourcedSyntaxNode,
    valueNode: SourcedSyntaxNode,
  ): void {
    if (["lp", "sum", "dp", "custom", "none"].indexOf(fnName) === -1) {
      this.error(
        `There's no such progression exists - '${fnName}'`,
        fnNameNode,
      );
    }
    if (fnName === "lp") {
      if (fnArgs.length > 6) {
        this.error(
          `Linear Progression 'lp' only has 6 arguments max`,
          valueNode,
        );
      } else if (
        fnArgs[0] &&
        !fnArgs[0].endsWith("lb") &&
        !fnArgs[0].endsWith("kg") &&
        !fnArgs[0].endsWith("%")
      ) {
        this.error(
          `1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
          valueNode,
        );
      } else if (fnArgs[1] != null && isNaN(parseInt(fnArgs[1], 10))) {
        this.error(
          `2nd argument of 'lp' should be a number of attempts - i.e. a number`,
          valueNode,
        );
      } else if (fnArgs[2] != null && isNaN(parseInt(fnArgs[2], 10))) {
        this.error(
          `3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
          valueNode,
        );
      } else if (
        fnArgs[3] != null &&
        !fnArgs[3].endsWith("lb") &&
        !fnArgs[3].endsWith("kg") &&
        !fnArgs[3].endsWith("%")
      ) {
        this.error(
          `4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
          valueNode,
        );
      } else if (fnArgs[4] != null && isNaN(parseInt(fnArgs[4], 10))) {
        this.error(
          `5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
          valueNode,
        );
      } else if (fnArgs[5] != null && isNaN(parseInt(fnArgs[5], 10))) {
        this.error(
          `6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
          valueNode,
        );
      }
    } else if (fnName === "sum") {
      if (fnArgs.length > 2) {
        this.error(
          `Reps Sum Progression 'sum' only has 2 arguments max`,
          valueNode,
        );
      } else if (fnArgs[0] == null || isNaN(parseInt(fnArgs[0], 10))) {
        this.error(
          `1st argument of 'sum' should be a number of reps - i.e. a number`,
          valueNode,
        );
      } else if (
        fnArgs[1] == null ||
        (!fnArgs[1].endsWith("lb") &&
          !fnArgs[1].endsWith("kg") &&
          !fnArgs[1].endsWith("%"))
      ) {
        this.error(
          `2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
          valueNode,
        );
      }
    } else if (fnName === "dp") {
      if (fnArgs.length !== 3) {
        this.error(
          `Double Progression 'dp' should have 3 arguments`,
          valueNode,
        );
      } else if (
        fnArgs[0] == null ||
        (!fnArgs[0].endsWith("lb") &&
          !fnArgs[0].endsWith("kg") &&
          !fnArgs[0].endsWith("%"))
      ) {
        this.error(
          `1st argument of 'dp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
          valueNode,
        );
      } else if (fnArgs[1] == null || isNaN(parseInt(fnArgs[1], 10))) {
        this.error(
          `2nd argument of 'dp' should be min reps in the range - i.e. a number, like 8`,
          valueNode,
        );
      } else if (fnArgs[2] == null || isNaN(parseInt(fnArgs[2], 10))) {
        this.error(
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
      const body = reuseLiftoscriptNode
        ? reuseLiftoscriptNode.source
        : undefined;
      if (!script && !body) {
        this.error(
          `'custom' progression requires either to specify Liftoscript block or specify which one to reuse`,
          valueNode,
        );
      }
    }
  }

  private evaluateProgress(
    expr: SourcedSyntaxNode,
    exerciseType?: IExerciseType,
  ): IProgramExerciseProgress {
    const result = this.evaluateProgressImpl(expr, exerciseType);
    if (result.success) {
      return result.data;
    } else {
      throw this.error(result.error, expr);
    }
  }

  private evaluateProgressImpl(
    expr: SourcedSyntaxNode,
    exerciseType?: IExerciseType,
  ): IEither<IProgramExerciseProgress, string> {
    if (expr.type.name === PlannerNodeName.ExerciseProperty) {
      const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
      if (valueNode == null) {
        const none = expr.getChild(PlannerNodeName.None);
        if (none != null) {
          return PlannerProgramExercise_buildProgress("none", []);
        } else {
          throw this.error(`Missing value for the property 'progress'`, expr);
        }
      }
      const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
      if (fnNameNode == null) {
        assert(PlannerNodeName.FunctionName);
      }
      const fnName = getNodeSourceEscapedWhiteSpace(fnNameNode);
      const fnArgs = valueNode
        .getChildren(PlannerNodeName.FunctionArgument)
        .map((argNode) => getNodeSourceEscapedWhiteSpace(argNode));
      this.validateProgress(fnName, fnArgs, fnNameNode, valueNode);

      const type = fnName as IProgramExerciseProgressType;
      if (type === "custom") {
        const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
        const script = liftoscriptNode ? liftoscriptNode.source : undefined;
        const { state } = fnArgsToStateVars(fnArgs, (message) =>
          this.error(message, fnNameNode),
        );
        if (script) {
          const liftoscriptEvaluator = new ScriptRunner(
            script,
            state,
            {},
            Progress_createEmptyScriptBindings(this.dayData, this.settings),
            Progress_createScriptFunctions(this.settings),
            this.settings.units,
            { exerciseType, unit: this.settings.units, prints: [] },
            "planner",
          );
          try {
            liftoscriptEvaluator.parse();
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
        const reuseLiftoscriptNode = valueNode
          .getChild(PlannerNodeName.ReuseLiftoscript)
          ?.getChild(PlannerNodeName.ReuseSection)
          ?.getChild(PlannerNodeName.ExerciseName);
        const body = reuseLiftoscriptNode
          ? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
          : undefined;
        return PlannerProgramExercise_buildProgress(type, fnArgs, {
          script,
          reuseFullname: body,
        });
      } else {
        return PlannerProgramExercise_buildProgress(type, fnArgs);
      }
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  }

  private evaluateWarmup(
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

  private evaluateSuperset(expr: SourcedSyntaxNode): {
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

  private evaluateProperty(
    expr: SourcedSyntaxNode,
    exerciseType?: IExerciseType,
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
          data: this.evaluateProgress(expr, exerciseType),
        };
      } else if (name === "update") {
        return {
          type: "update",
          data: this.evaluateUpdate(expr, exerciseType),
        };
      } else if (name === "warmup") {
        return { type: "warmup", data: this.evaluateWarmup(expr) };
      } else if (name === "id") {
        return { type: "id", data: this.evaluateId(expr) };
      } else if (name === "used") {
        return { type: "used", data: "" };
      } else {
        this.error(`There's no such property exists - '${name}'`, nameNode);
      }
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  }

  private getReuseWeekDay(weekDayNode: SourcedSyntaxNode | null): {
    week?: number;
    day?: number;
  } {
    let week: number | undefined;
    let day: number | undefined;
    if (weekDayNode != null) {
      const result = weekDayNode
        .getChildren(PlannerNodeName.WeekOrDay)
        .map((n) => {
          const child = getChildren(n)[0];
          if (child.type.name === PlannerNodeName.Int) {
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

  private evaluateReuseNode(expr: SourcedSyntaxNode): {
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
      const { week, day } = this.getReuseWeekDay(
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

  private evaluateSection(
    expr: SourcedSyntaxNode,
    exerciseType?: IExerciseType,
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
        return this.evaluateReuseNode(reuseNode);
      }
      const setsNode = expr.getChild(PlannerNodeName.ExerciseSets);
      if (setsNode != null) {
        const sets = setsNode.getChildren(PlannerNodeName.ExerciseSet);
        const isCurrent =
          setsNode.getChild(PlannerNodeName.CurrentVariation) != null;
        if (sets.length > 0) {
          return {
            type: "sets",
            data: sets.map((set) => this.evaluateSet(set)),
            isCurrent,
          };
        }
      }
      const superset = expr.getChild(PlannerNodeName.Superset);
      if (superset != null) {
        return this.evaluateSuperset(superset);
      }
      const property = expr.getChild(PlannerNodeName.ExerciseProperty);
      if (property != null) {
        return this.evaluateProperty(property, exerciseType);
      } else {
        assert(PlannerNodeName.ExerciseProperty);
      }
    } else {
      assert(PlannerNodeName.ExerciseSection);
    }
  }

  private addDescription(value: string): void {
    value = value.replace(/^\/\//, "");
    if (this.latestDescriptions.length === 0) {
      this.latestDescriptions.push([]);
    }
    this.latestDescriptions[this.latestDescriptions.length - 1].push(value);
  }

  private getOrder(expr: SourcedSyntaxNode): number {
    if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const repeatNode = expr.getChild(PlannerNodeName.Repeat);
      if (repeatNode == null) {
        return 0;
      }
      const children = getChildren(repeatNode);
      for (const childNode of children) {
        if (childNode.type.name === PlannerNodeName.Rep) {
          return parseInt(getNodeSourceEscapedWhiteSpace(childNode), 10);
        }
      }
      return 0;
    } else {
      assert(PlannerNodeName.ExerciseExpression);
    }
  }

  private getRepeat(expr: SourcedSyntaxNode): number[] {
    if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const repeatNode = expr.getChild(PlannerNodeName.Repeat);
      if (repeatNode == null) {
        return [];
      }
      const result: Set<number> = new Set();
      const children = getChildren(repeatNode);
      for (const childNode of children) {
        if (childNode.type.name === PlannerNodeName.RepRange) {
          const [from, to] = getChildren(childNode).map((n) =>
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

  private getIsNotUsed(expr: SourcedSyntaxNode): boolean {
    if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const sections = expr.getChildren(PlannerNodeName.ExerciseSection);
      for (const section of sections) {
        const properties = section.getChildren(
          PlannerNodeName.ExerciseProperty,
        );
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

  private evaluateExercise(expr: SourcedSyntaxNode): void {
    if (
      expr.type.name === PlannerNodeName.EmptyExpression ||
      expr.type.name === PlannerNodeName.TripleLineComment
    ) {
      if (this.latestDescriptions.length > 0) {
        this.latestDescriptions.push([]);
      }
      return;
    } else if (expr.type.name === PlannerNodeName.Week) {
      if (this.mode === "perday") {
        this.error(
          `You cannot specify weeks in the per-day exercise lists. Switch to the full program mode for that.`,
          expr,
        );
      }
      const weekName = expr.source.replace(/^#+/, "").trim();
      const [line] = expr.getLineAndOffset();
      this.weeks.push({ name: weekName, line, days: [] });
      this.dayData = {
        day: this.dayData.day,
        week: this.weeks.length + 1,
        dayInWeek: 0,
      };
    } else if (expr.type.name === PlannerNodeName.Day) {
      if (this.mode === "perday") {
        this.error(
          `You cannot specify days in the per-day exercise lists. Switch to the full program mode for that.`,
          expr,
        );
      }
      if (this.weeks.length === 0) {
        this.error(`You need to specify a week before a day`, expr);
      }
      const dayName = expr.source.replace(/^#+/, "").trim();
      const [line] = expr.getLineAndOffset();
      this.weeks[this.weeks.length - 1].days.push({
        name: dayName,
        line,
        exercises: [],
      });
      this.dayData = {
        day: this.dayData.day + 1,
        week: this.dayData.week,
        dayInWeek: (this.dayData.dayInWeek || 0) + 1,
      };
      this.exerciseIndex = 0;
    } else if (expr.type.name === PlannerNodeName.LineComment) {
      const value = expr.source.trim();
      this.addDescription(value);
      return undefined;
    } else if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      if (
        this.mode === "full" &&
        (this.weeks.length === 0 ||
          this.weeks[this.weeks.length - 1].days.length === 0)
      ) {
        this.error(
          `You should first define a week and a day before listing exercises.`,
          expr,
        );
      } else if (this.weeks.length === 0) {
        this.weeks.push({
          name: "Week 1",
          line: 1,
          days: [{ name: "Day 1", line: 1, exercises: [] }],
        });
      }
      const nameNode = expr.getChild(PlannerNodeName.ExerciseName);
      if (nameNode == null) {
        assert("ExerciseName");
      }

      const fullName = getNodeSourceEscapedWhiteSpace(nameNode);

      let { label, name, equipment } = extractNameParts(
        fullName,
        this.settings.exercises,
      );
      const key = PlannerKey_fromFullName(fullName, this.settings.exercises);
      const shortName = PlannerProgramExercise_shortNameFromFullName(
        fullName,
        this.settings,
      );
      const exercise = Exercise_findByNameAndEquipment(
        shortName,
        this.settings.exercises,
      );
      let notused = this.getIsNotUsed(expr);
      const sectionNodes = expr.getChildren(PlannerNodeName.ExerciseSection);
      const setVariations: IPlannerProgramExerciseSetVariation[] = [];
      const allSets: IPlannerProgramExerciseSet[] = [];
      let allWarmupSets: IPlannerProgramExerciseWarmupSet[] | undefined;
      let reuse: IPlannerProgramReuse | undefined;
      const repeat = this.getRepeat(expr);
      const order = this.getOrder(expr);
      const text = expr.source.trim();
      let tags: number[] = [];
      let progress: IProgramExerciseProgress | undefined;
      let update: IProgramExerciseUpdate | undefined;
      let superset: IPlannerProgramExerciseSuperset | undefined;
      for (const sectionNode of sectionNodes) {
        const section = this.evaluateSection(
          sectionNode,
          exercise ? { id: exercise.id, equipment } : undefined,
        );
        if (section.type === "sets") {
          allSets.push(...section.data);
          if (section.data.some((set) => set.repRange != null)) {
            setVariations.push({
              sets: section.data,
              isCurrent: section.isCurrent,
            });
          }
        } else if (section.type === "warmup") {
          allWarmupSets = allWarmupSets || [];
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
      const [line] = expr.getLineAndOffset();
      const rawDescriptions: string[] = this.latestDescriptions.map((d) =>
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
      this.latestDescriptions = [];
      const fullNamePoint = this.getPoint(nameNode);

      const reuseSetsNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => n.getChild(PlannerNodeName.ReuseSectionWithWeekDay))
        .filter((n) => n)[0];
      const reuseSetPoint = reuseSetsNode
        ? this.getPoint(reuseSetsNode)
        : undefined;

      const progressNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "progress" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0];
      const progressPoint = progressNode
        ? this.getPoint(progressNode)
        : undefined;

      const updateNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "update" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0];
      const updatePoint = updateNode ? this.getPoint(updateNode) : undefined;

      const idNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => {
          const node = n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.ExercisePropertyName);
          return node != null && node.source === "id" ? node : undefined;
        })
        .flat(2)
        .filter((n) => n)[0];
      const idPoint = idNode ? this.getPoint(idNode) : undefined;

      const warmupNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) =>
          n
            .getChild(PlannerNodeName.ExerciseProperty)
            ?.getChild(PlannerNodeName.WarmupExerciseSets),
        )
        .flat(2)
        .filter((n) => n)[0];
      const warmupPoint = warmupNode ? this.getPoint(warmupNode) : undefined;

      const supersetNode = expr
        .getChildren(PlannerNodeName.ExerciseSection)
        .map((n) => n.getChild(PlannerNodeName.Superset))
        .filter((n) => n)[0];
      const supersetPoint = supersetNode
        ? this.getPoint(supersetNode)
        : undefined;

      const plannerExercise: IPlannerProgramExercise = {
        id: generateUid(8),
        key,
        fullName,
        shortName,
        exerciseType: exercise,
        label,
        dayData: this.dayData,
        text,
        repeat,
        repeating: [...repeat],
        order,
        superset,
        name,
        equipment,
        exerciseIndex: this.exerciseIndex,
        line,
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
          fullName: fullNamePoint,
          supersetPoint,
          reuseSetPoint,
          progressPoint,
          idPoint,
          updatePoint,
          warmupPoint,
        },
      };
      this.weeks[this.weeks.length - 1].days[
        this.weeks[this.weeks.length - 1].days.length - 1
      ].exercises.push(plannerExercise);
      if (!notused) {
        this.exerciseIndex += 1;
      }
    } else {
      this.error(`Unexpected node type ${expr.node.type.name}`, expr);
    }
  }

  private getWeekDayOngoingLinesFullText(): {
    linesToPreviousExercise: IPlannerNonExerciseFullTextLine[];
    nextLines: IPlannerNonExerciseFullTextLine[];
  } {
    const ongoingLines = [...this.ongoingLinesFullText];
    let anyCommentStarted = false;
    let commentStarted = false;
    const linesToPreviousExercise: IPlannerNonExerciseFullTextLine[] = [];
    const nextLines: IPlannerNonExerciseFullTextLine[] = [];
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

  private getWeekDayDescriptionAndFillLastDayFullText(): string | undefined {
    const { linesToPreviousExercise, nextLines } =
      this.getWeekDayOngoingLinesFullText();
    if (linesToPreviousExercise.length > 0) {
      const lastWeek = this.weeksFullText[this.weeksFullText.length - 1];
      const lastDay = lastWeek?.days[lastWeek.days.length - 1];
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

  private evaluateExerciseFullText(expr: SourcedSyntaxNode): void {
    if (expr.type.name === PlannerNodeName.Week) {
      const weekName = expr.source.replace(/^#+/, "").trim();
      const description = this.getWeekDayDescriptionAndFillLastDayFullText();
      this.weeksFullText.push({ name: weekName, description, days: [] });
      this.ongoingLinesFullText = [];
    } else if (expr.type.name === PlannerNodeName.Day) {
      const dayName = expr.source.replace(/^#+/, "").trim();
      const description = this.getWeekDayDescriptionAndFillLastDayFullText();
      this.weeksFullText[this.weeksFullText.length - 1].days.push({
        name: dayName,
        exercises: [],
        description,
      });
      this.ongoingLinesFullText = [];
    } else if (expr.type.name === PlannerNodeName.EmptyExpression) {
      this.ongoingLinesFullText.push({
        type: "empty",
        line: expr.source,
      });
    } else if (expr.type.name === PlannerNodeName.LineComment) {
      this.ongoingLinesFullText.push({
        type: "comment",
        line: expr.source,
      });
    } else if (expr.type.name === PlannerNodeName.TripleLineComment) {
      this.ongoingLinesFullText.push({
        type: "triplelinecomment",
        line: expr.source,
      });
    } else if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const lastWeek = this.weeksFullText[this.weeksFullText.length - 1];
      const lastDay = lastWeek
        ? lastWeek.days[lastWeek.days.length - 1]
        : undefined;
      const exercises = lastDay?.exercises;
      if (exercises) {
        for (const line of this.ongoingLinesFullText) {
          exercises.push(line.line);
        }
        exercises.push(expr.source);
        this.ongoingLinesFullText = [];
      }
    }
  }

  private evaluateProgram(
    expr: SourcedSyntaxNode,
  ): IPlannerExerciseEvaluatorWeek[] {
    if (expr.type.name === PlannerNodeName.Program) {
      this.weeks = [];
      this.exerciseIndex = 0;
      for (const child of CollectionUtils_compact(getChildren(expr))) {
        this.evaluateExercise(child);
      }
      return this.weeks;
    } else {
      this.error(`Unexpected node type ${expr.node.type.name}`, expr);
    }
  }

  public evaluate(programNode: SourcedSyntaxNode): IPlannerEvalFullResult {
    try {
      this.parse(programNode);
      const program = this.evaluateProgram(programNode);
      return { data: program, success: true };
    } catch (e) {
      if (e instanceof PlannerSyntaxError) {
        return { error: e, success: false };
      } else {
        throw e;
      }
    }
  }

  /**
   * Walks the program preserving raw lines (including comments) for each day’s exercise text.
   * Requires {@link IPlannerExerciseEvaluatorMode} `"fulltext"`.
   */
  public evaluatePreservingSource(
    programNode: SourcedSyntaxNode,
  ): IPlannerExerciseEvaluatorTextWeek[] {
    if (this.mode !== "fulltext") {
      throw new Error(
        'PlannerExerciseEvaluator.evaluatePreservingSource requires mode "fulltext"',
      );
    }
    if (programNode.type.name !== PlannerNodeName.Program) {
      throw new Error(`Unexpected node type ${programNode.type.name}`);
    }
    this.parse(programNode);
    this.ongoingLinesFullText = [];
    this.weeksFullText = [];
    for (const child of CollectionUtils_compact(getChildren(programNode))) {
      this.evaluateExerciseFullText(child);
    }
    return this.weeksFullText;
  }

  public topLineMap(programNode: SourcedSyntaxNode): IPlannerTopLineItem[] {
    if (programNode.type.name !== PlannerNodeName.Program) {
      this.error(
        `Unexpected node type ${programNode.type.name} - should be Program`,
        programNode,
      );
    }
    const children = getChildren(programNode);
    const result: IPlannerTopLineItem[] = [];
    let lastDescriptions: string[][] = [];
    let ongoingDescriptions = false;
    let exerciseIndex = 0;
    for (const child of children) {
      if (child.type.name === PlannerNodeName.ExerciseExpression) {
        ongoingDescriptions = false;
        const nameNode = child.getChild(PlannerNodeName.ExerciseName)!;
        const fullName = getNodeSourceEscapedWhiteSpace(nameNode);
        const key = PlannerKey_fromFullName(fullName, this.settings.exercises);
        const repeat = this.getRepeat(child);
        const repeatRanges = getRepeatRanges(repeat);
        const order = this.getOrder(child);
        const isUsed = !this.getIsNotUsed(child);
        const sectionsNode = child.getChildren(PlannerNodeName.ExerciseSection);
        const sections = sectionsNode
          .map((section) => section.source.trim())
          .join(" / ");
        const sectionsToReuse = sectionsNode
          .filter((section) => {
            const properties = section.getChild(
              PlannerNodeName.ExerciseProperty,
            );
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
        this.error(
          `Unexpected node type ${child.type.name}, should be only exercise, comment, description or empty line`,
          child,
        );
      }
    }
    return result;
  }
}

//#endregion

//#region Planner Evaluator
type IByTag<T> = Record<number, T>;
type IByExercise<T> = Record<string, T>;
type IByExerciseWeekDay<T> = Record<string, Record<number, Record<number, T>>>;
type IByWeekDayExercise<T> = Record<number, Record<number, Record<string, T>>>;

interface IPlannerEvalMetadata {
  byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>;
  byWeekDayExercise: IByWeekDayExercise<IPlannerProgramExercise>;
  fullNames: Set<string>;
  notused: Set<string>;
  properties: {
    id: IByExercise<{ property: number[]; dayData: Required<IDayData> }>;
    progress: IByExercise<{
      property: IProgramExerciseProgress;
      dayData: Required<IDayData>;
    }>;
    update: IByExercise<{
      property: IProgramExerciseUpdate;
      dayData: Required<IDayData>;
    }>;
    warmup: IByExercise<{
      warmupSets: IPlannerProgramExerciseWarmupSet[];
      dayData: Required<IDayData>;
    }>;
  };
}

function PlannerEvaluator_fillInMetadata(
  exercise: IPlannerProgramExercise,
  metadata: IPlannerEvalMetadata,
  dayData: Required<IDayData>,
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
  dayData: Required<IDayData>,
  settings: ISettings,
): IPlannerEvalResult {
  const evaluator = new PlannerExerciseEvaluator(settings, "perday", dayData);
  const result = evaluator.evaluate(
    parseBound(plannerExerciseParser, day.exerciseText),
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
      const exerciseType = PlannerProgramExercise_getExercise(
        exercise,
        settings,
      );
      const state = PlannerProgramExercise_getState(exercise);
      const liftoscriptEvaluator = new ScriptRunner(
        script,
        state,
        {},
        Progress_createEmptyScriptBindings(dayData, settings),
        Progress_createScriptFunctions(settings),
        settings.units,
        { exerciseType, unit: settings.units, prints: [] },
        "update",
      );
      try {
        liftoscriptEvaluator.parse();
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
    (weekIndex, dayInWeekIndex, dayIndex, exerciseIndex, exercise) => {
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
    (weekIndex, dayInWeekIndex, dayIndex, exerciseIndex, exercise) => {
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
    (weekIndex, dayInWeekIndex, dayIndex, exerciseIndex, exercise) => {
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
  const weekExercises = ObjectUtils_values(
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
): { exercise: IPlannerProgramExercise; dayData: Required<IDayData> }[] {
  const originalExercises: {
    exercise: IPlannerProgramExercise;
    dayData: Required<IDayData>;
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

const PlannerEvaluator_forceEvaluate = (
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

const PlannerEvaluator_evaluate = memoize(PlannerEvaluator_forceEvaluate, {
  maxSize: 10,
  isEqual: (a: IPlannerProgram | ISettings, b: IPlannerProgram | ISettings) => {
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
});

//#endregion

//#region Planner Program Exercise

function PlannerProgramExercise_getExercise(
  plannerExercise: IPlannerProgramExercise,
  settings: ISettings,
): IExercise | undefined {
  const exercise = Exercise_findByName(
    plannerExercise.name.trim(),
    settings.exercises,
  );
  if (exercise == null) {
    return undefined;
  }
  exercise.equipment =
    plannerExercise.equipment ||
    exercise?.equipment ||
    exercise?.defaultEquipment;
  return exercise;
}

function PlannerProgramExercise_setVariations(
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

function PlannerProgramExercise_warmups(
  exercise: IPlannerProgramExercise,
): IPlannerProgramExerciseWarmupSet[] | undefined {
  return exercise.warmupSets || exercise.reuse?.exercise?.warmupSets;
}

function PlannerProgramExercise_programWarmups(
  exercise: IPlannerProgramExercise,
  settings: ISettings,
): IProgramExerciseWarmupSet[] | undefined {
  const exerciseWarmups = PlannerProgramExercise_warmups(exercise);
  if (exerciseWarmups == null) {
    return undefined;
  }
  const sets: IProgramExerciseWarmupSet[] = [];
  for (const ws of exerciseWarmups) {
    for (let i = 0; i < ws.numberOfSets; i += 1) {
      let value: IWeight | number | undefined = ws.percentage
        ? ws.percentage / 100
        : undefined;
      if (value == null) {
        value = ws.weight;
      }
      if (value == null) {
        value = MathUtils_roundTo0005(rpeMultiplier(ws.reps, 4));
      }
      sets.push({
        reps: ws.reps,
        value,
        threshold: build(0, settings.units),
      });
    }
  }
  return sets;
}

function PlannerProgramExercise_evaluateSetVariations(
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

function PlannerProgramExercise_getState(
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

function PlannerProgramExercise_buildProgress(
  type: IProgramExerciseProgressType,
  args: string[],
  opts: {
    reuseFullname?: string;
    script?: string;
  } = {},
): IEither<IProgramExerciseProgress, string> {
  switch (type) {
    case "none": {
      return {
        success: true,
        data: {
          type: "none",
          state: {},
          stateMetadata: {},
        },
      };
    }
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

function Progress_createEmptyScriptBindings(
  dayData: IDayData,
  settings: ISettings,
  exercise?: IExerciseType,
): IScriptBindings {
  const rm1 = exercise ? getOrmOrStartingWeight(exercise, settings) : w`0lb`;
  return {
    day: dayData.day,
    week: dayData.week ?? 1,
    dayInWeek: dayData.dayInWeek ?? dayData.day,
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
    const runner = new ScriptRunner(
      script,
      state,
      structuredClone(otherStates),
      bindings,
      Progress_createScriptFunctions(settings),
      settings.units,
      fnContext,
      "update",
    );
    runner.execute();
    const newEntry = Progress_applyBindings(entry, bindings, settings);
    newEntry.state = { ...newEntry.state, ...state };
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
      if (entry.sets[i] == null) {
        entry.sets[i] = {
          id: generateUid(6),
          index: i,
          isUnilateral: isUnilateral(entry.exercise, settings),
          reps: 0,
          weight: w`0lb`,
          originalWeight: w`0lb`,
          askWeight: false,
          isCompleted: false,
        };
      }
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

function Progress_getDayData(progress: IHistoryRecord): IDayData {
  return {
    day: progress.day,
    week: progress.week,
    dayInWeek: progress.dayInWeek,
  };
}

function Progress_getEntryId(
  exerciseType: IExerciseType,
  label?: string,
): string {
  return CollectionUtils_compact([label, toKey(exerciseType)]).join("_");
}

//#endregion

//#region PP
function forExerciseInEvaluatedWeeks(
  evaluatedWeeks: IEvaluatedProgramWeek[],
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

function forExerciseInEvaluatedResults(
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
  renameMapping?: Record<string, { to: string; dayData?: Required<IDayData> }>;
  reorder?: {
    dayData: Required<IDayData>;
    fromIndex: number;
    toIndex: number;
  }[];
  add?: { dayData: Required<IDayData>; index: number; fullName: string }[];
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
function groupVariationSets(
  sets: IPlannerProgramExerciseEvaluatedSet[],
  exercise: IPlannerProgramExercise,
  index: number,
): [IPlannerProgramExerciseEvaluatedSet, number][] {
  if (sets.length === 0) {
    const originalSets = PlannerProgramExercise_sets(exercise, index)[0];
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
    const key = setToKey(set);
    if (lastKey == null || lastKey !== key) {
      groups.push([set, 0]);
    }
    groups[groups.length - 1][1] += 1;
    lastKey = key;
  }
  return groups;
}
function groupWarmupsSets(
  sets: IPlannerProgramExerciseWarmupSet[],
): [IPlannerProgramExerciseWarmupSet, number][] {
  let lastKey: string | undefined;
  const groups: [IPlannerProgramExerciseWarmupSet, number][] = [];
  for (const set of sets) {
    const key = warmupSetToKey(set);
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

function convertToPlanner(
  program: IEvaluatedProgram,
  settings: ISettings,
  opts: IPlannerToProgramConvertOpts = {},
): IPlannerProgram {
  const plannerWeeks: IPlannerProgramWeek[] = [];
  if (program.errors.length > 0) {
    const error = program.errors[0];
    console.log(PlannerProgram_generateFullText(program.planner.weeks));

    throw error.error;
  }
  const topLineMap = PlannerProgram_topLineItems(program.planner, settings);
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
              if (descriptionIndex == null) {
                descriptionIndex = 0;
              }
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
                plannerExercise += reuseToStr(evalExercise, settings);

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

              if (!addedWarmupsMap[key] && evalExercise?.warmupSets) {
                const warmupSets = getWarmupSets(evalExercise);
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

  return PlannerProgram_compact(
    program.planner,
    result,
    settings,
    repeatingExercises,
  );
}

function reuseToStr(
  programExercise: IPlannerProgramExercise,
  settings: ISettings,
): string {
  const reuseExercise = programExercise.reuse?.exercise;
  if (!reuseExercise) {
    throw new Error("reuse.exercise is required");
  }
  const reuse = programExercise.reuse;
  if (!reuse) {
    throw new Error("reuse is required");
  }
  let str = "...";
  if (reuseExercise.exerciseType) {
    const exercise = getExerciseOrDefault(
      reuseExercise.exerciseType,
      settings.exercises,
    );
    const reuseStr = Exercise_fullName(
      exercise,
      getCurrentEquipment(settings),
      reuseExercise.label,
    );
    str += reuseStr;
  } else {
    str += reuseExercise.fullName;
  }
  if (reuse.week || reuse.day) {
    const weekAndDay = CollectionUtils_compact([reuse.week, reuse.day]).join(
      ":",
    );
    str += `[${weekAndDay}]`;
  }
  return str;
}

function getWarmupSets(
  programExercise: IPlannerProgramExercise,
): string | undefined {
  const warmupSets = programExercise.warmupSets;
  if (warmupSets) {
    const groups = groupWarmupsSets(warmupSets);
    const strs: string[] = [];
    for (const [first, length] of groups) {
      const weight =
        first.weight ??
        (first.percentage != null ? percentORM(first.percentage) : w`0lb`);
      strs.push(`${length}x${first.reps} ${print(weight)}`);
    }
    return strs.length === 0 ? "none" : strs.join(", ");
  }
  return undefined;
}

function variationToString(
  variation: IPlannerProgramExerciseEvaluatedSetVariation,
  globals: IPlannerToProgram2Globals,
  index: number,
  exercise: IPlannerProgramExercise,
): string {
  const groupedVariationSets = groupVariationSets(
    variation.sets,
    exercise,
    index,
  );
  const result: string[] = [];
  for (const group of groupedVariationSets) {
    const set = group[0];
    let setStr = "";
    setStr += `${group[1]}${set.isQuickAddSet ? "+" : ""}x`;
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
    if (globals.rpe == null) {
      setStr += set.rpe != null ? ` @${n(Math.max(0, set.rpe))}` : "";
      setStr += set.rpe != null && set.logRpe ? "+" : "";
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

function getGlobals(
  exercise: IPlannerProgramExercise,
): IPlannerToProgram2Globals {
  const variations = exercise.evaluatedSetVariations;
  if (variations.length === 0 || variations[0].sets.length === 0) {
    const globals = exercise.globals;
    const reusedGlobals = exercise.reuse?.exercise?.globals || {};
    return {
      weight: globals?.weight ?? reusedGlobals.weight,
      rpe: globals?.rpe ?? reusedGlobals.rpe,
      timer: globals?.timer ?? reusedGlobals.timer,
      logRpe: globals?.logRpe ?? reusedGlobals.logRpe,
      askWeight: globals?.askWeight ?? reusedGlobals.askWeight,
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
function warmupSetToKey(set: IPlannerProgramExerciseWarmupSet): string {
  return `${set.reps}-${print(set.weight || set.percentage || 0)}`;
}

function setToKey(set: IPlannerProgramExerciseEvaluatedSet): string {
  return `${set.maxrep}-${set.minrep}-${print(set.weight)}-${set.isAmrap}-${set.rpe}-${set.logRpe}-${
    set.timer
  }-${set.label}-${set.askWeight}`;
}
//#endregion

//#region ScriptRunner

class ScriptRunner {
  private readonly script: string;
  private readonly state: IProgramState;
  private readonly otherStates: Record<number, IProgramState>;
  private readonly bindings: IScriptBindings;
  private readonly fns: IScriptFunctions;
  private readonly units: IUnit;
  private readonly context: IScriptFnContext;
  private readonly mode: IProgramMode;
  private updates: ILiftoscriptEvaluatorUpdate[] = [];

  constructor(
    script: string,
    state: IProgramState,
    otherStates: Record<number, IProgramState>,
    bindings: IScriptBindings,
    fns: IScriptFunctions,
    units: IUnit,
    context: IScriptFnContext,
    mode: IProgramMode,
  ) {
    this.script = script;
    this.state = state;
    this.otherStates = otherStates;
    this.bindings = bindings;
    this.fns = fns;
    this.units = units;
    this.context = context;
    this.mode = mode;
  }

  public parse(): [LiftoscriptEvaluator, Tree] {
    const liftoscriptTree = LiftoscriptParser.parse(this.script);
    const liftoscriptEvaluator = new LiftoscriptEvaluator(
      this.script,
      this.state,
      this.otherStates,
      this.bindings,
      this.fns,
      this.context,
      this.units,
      this.mode,
    );
    liftoscriptEvaluator.parse(liftoscriptTree.topNode);
    return [liftoscriptEvaluator, liftoscriptTree];
  }

  public getStateVariableKeys(): Set<string> {
    const liftoscriptTree = LiftoscriptParser.parse(this.script);
    const liftoscriptEvaluator = new LiftoscriptEvaluator(
      this.script,
      this.state,
      this.otherStates,
      this.bindings,
      this.fns,
      this.context,
      this.units,
      this.mode,
    );
    return liftoscriptEvaluator.getStateVariableKeys(liftoscriptTree.topNode);
  }

  public execute(type?: undefined): number | IWeight | boolean;
  public execute(
    type?: "reps" | "weight" | "timer" | "rpe",
  ): number | IWeight | IDynamicWeight | boolean {
    const [liftoscriptEvaluator, liftoscriptTree] = this.parse();
    const rawResult = liftoscriptEvaluator.evaluate(liftoscriptTree.topNode);
    let result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
    if (result == null) {
      result = 0;
    }
    const output = this.convertResult(type, result);
    this.updates = liftoscriptEvaluator.updates;

    return output;
  }

  public getUpdates(): ILiftoscriptEvaluatorUpdate[] {
    return this.updates;
  }

  private convertResult(
    type: "reps" | "weight" | "timer" | "rpe" | undefined,
    result: number | IWeight | IDynamicWeight | boolean,
  ): number | IWeight | IDynamicWeight | boolean {
    if (type === "reps" || type === "timer") {
      if (typeof result !== "number") {
        throw new LiftoscriptSyntaxError(
          "Expected to get number as a result",
          0,
          0,
          0,
          0,
        );
      } else if (result < 0) {
        return 0;
      } else {
        return result;
      }
    } else if (type === "rpe") {
      if (typeof result !== "number") {
        throw new LiftoscriptSyntaxError(
          "Expected to get number as a result",
          0,
          0,
          0,
          0,
        );
      } else {
        return Math.round(Math.min(10, Math.max(0, result)) / 0.5) * 0.5;
      }
    } else if (type === "weight") {
      if (typeof result === "boolean") {
        throw new LiftoscriptSyntaxError(
          "Expected to get number, percentage or weight as a result",
          0,
          0,
          0,
          0,
        );
      } else if (typeof result === "number") {
        return build(result, this.units);
      } else {
        if (result.value < 0) {
          return build(0, this.units);
        } else {
          return result;
        }
      }
    } else {
      return result;
    }
  }
}
//#endregion
