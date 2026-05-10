import { memoize } from "micro-memoize";
import * as t from "io-ts";
import type { SyntaxNode, Tree } from "@lezer/common";
import { unsafeCoerce } from "fp-ts/lib/function";
import {
  CollectionUtils_compact,
  CollectionUtils_sortBy,
  CollectionUtils_findIndexReverse,
  CollectionUtils_sort,
} from "../utils/collection";
import { UidFactory_generateUid } from "@/utils/generator";
import {
  MathUtils_applyOp,
  n,
  MathUtils_roundTo005,
  MathUtils_round,
  MathUtils_roundFloat,
  MathUtils_roundTo000005,
  MathUtils_roundTo0005,
} from "@/utils/math";
import type { IEither, IArrayElement } from "@/utils/types";
import {
  ObjectUtils_pick,
  ObjectUtils_isEqual,
  ObjectUtils_clone,
  ObjectUtils_keys,
  ObjectUtils_values,
  ObjectUtils_filter,
  ObjectUtils_diff,
  ObjectUtils_entries,
} from "@/utils/object";
import { StringUtils_unindent } from "@/utils/string";
import type { ILiftoscriptEvaluatorUpdate } from "@/logic/types";
import { parser as plannerExerciseParser } from "@/parsers/workout-plan.ts";
import { parser as LiftoscriptParser } from "@/parsers/logic";
import {
  LiftoscriptEvaluator,
  LiftoscriptSyntaxError,
} from "@/evaluators/logic-evaluator.ts";
import type { IAssignmentOp } from "@/logic/types";

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
  type: "evaluatedProgram";
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
  const exercise = programExercise.exerciseType;
  const programSets =
    PlannerProgramExercise_currentEvaluatedSetVariation(programExercise)?.sets;
  const warmupSets = PlannerProgramExercise_programWarmups(
    programExercise,
    settings,
  );
  const sets: ISet[] = [];
  for (let i = 0; i < programSets.length; i++) {
    const programSet = programSets[i];
    const minReps =
      programSet.minrep != null && programSet.minrep !== programSet.maxrep
        ? programSet.minrep
        : undefined;
    const weight = ProgramSet_getEvaluatedWeight(
      programSet,
      programExercise.exerciseType,
      settings,
    );
    sets.push({
      vtype: "set",
      id: UidFactory_generateUid(6),
      reps: programSet.maxrep,
      index: i,
      minReps,
      weight,
      isUnilateral: Exercise_getIsUnilateral(exercise, settings),
      rpe: programSet.rpe,
      timer: programSet.timer,
      logRpe: programSet.logRpe,
      askWeight: programSet.askWeight,
      originalWeight: programSet.weight,
      isAmrap: programSet.isAmrap,
      label: programSet.label,
      isCompleted: false,
      programSetIndex: i,
    });
  }

  const entry: IHistoryEntry = {
    vtype: "history_entry",
    id: Progress_getEntryId(exercise, programExercise.label),
    index,
    exercise: exercise,
    programExerciseId: programExercise.key,
    sets,
    superset: programExercise.superset?.name,
    warmupSets: Exercise_getWarmupSets(
      exercise,
      sets[0]?.weight,
      settings,
      warmupSets,
    ),
  };
  const newEntry = Progress_runUpdateScriptForEntry(
    entry,
    dayData,
    programExercise,
    program.states,
    -1,
    settings,
    stats,
  );
  return newEntry;
}

export function Program_nextHistoryRecord(
  aProgram: IProgram,
  settings: ISettings,
  stats: IStats,
  dayIndex?: number,
): IHistoryRecord {
  const program = Program_evaluate(aProgram, settings);
  return Program_nextHistoryRecordFromEvaluated(
    program,
    settings,
    stats,
    dayIndex,
  );
}

function Program_nextHistoryRecordFromEvaluated(
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
    vtype: "progress",
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
    ui: {},
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
    Stats_getCurrentMovingAverageBodyweight(stats, settings),
    undefined,
    setVariationIndex + 1,
    descriptionIndex + 1,
  );
  const fns = Progress_createScriptFunctions(settings);

  const newState: IProgramState = {
    ...state,
    ...userPromptedStateVars,
  };
  const otherStates = ObjectUtils_clone(program.states);

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
      const diffState = ObjectUtils_keys(
        otherStates[key],
      ).reduce<IProgramState>((memo2, key2) => {
        if (!Weight_eq(otherStates[key][key2], program.states[key][key2])) {
          memo2[key2] = otherStates[key][key2];
        }
        return memo2;
      }, {});
      memo[key] = diffState;
    }
    return memo;
  }, {});

  const stateDiff = ObjectUtils_diff(state, newState);
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
          const exerciseKey = Exercise_toKey(entry.exercise);
          const onerm = Exercise_onerm(entry.exercise, settings);
          if (!Weight_eq(bindings.rm1, onerm)) {
            exerciseData[exerciseKey] = {
              rm1: Weight_roundTo005(bindings.rm1),
            };
          }
          PP_iterate2(newEvaluatedProgram.weeks, (exercise) => {
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
            PP_iterate2(newEvaluatedProgram.weeks, (exercise) => {
              if (exercise.tags?.includes(Number(key)) && exercise.progress) {
                exercise.progress.state = {
                  ...exercise.progress.state,
                  ...otherStates[key],
                };
              }
            });
          }
        } else {
        }
      }
    }
  }
  const theNextDay = Program_nextDay(newEvaluatedProgram, progress.day);
  const newPlanner = new ProgramToPlanner(
    newEvaluatedProgram,
    settings,
  ).convertToPlanner();
  const newProgram = ObjectUtils_clone(program);
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
      type: "evaluatedProgram",
      id: program.id,
      planner: {
        vtype: "planner",
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
  PP_iterate(evaluatedWeeks, (exercise) => {
    for (const tag of exercise.tags) {
      states[tag] = {
        ...states[tag],
        ...PlannerProgramExercise_getState(exercise),
      };
    }
  });
  const result: IEvaluatedProgram = {
    type: "evaluatedProgram",
    id: program.id,
    errors,
    planner,
    name: program.name,
    nextDay: program.nextDay,
    weeks: weeks,
    states,
  };

  return result;
}

function Program_numberOfDays(program: IEvaluatedProgram): number {
  return program.weeks.reduce((memo, week) => memo + week.days.length, 0);
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
  const newProgram = ObjectUtils_clone(program);
  newProgram.planner = new ProgramToPlanner(
    evaluatedProgram,
    settings,
  ).convertToPlanner();
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
    vtype: "program" as const,
    id: id || UidFactory_generateUid(8),
    name: name,
    url: "",
    author: "",
    shortDescription: "",
    description: "",
    nextDay: 1,
    weeks: [],
    isMultiweek: false,
    days: [{ id: UidFactory_generateUid(8), name: "Day 1", exercises: [] }],
    exercises: [],
    tags: [],
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
      vtype: "equipment_data",
      multiplier: 2,
      bar: {
        lb: Weight_build(45, "lb"),
        kg: Weight_build(20, "kg"),
      },
      plates: [
        { weight: Weight_build(45, "lb"), num: 8 },
        { weight: Weight_build(25, "lb"), num: 4 },
        { weight: Weight_build(10, "lb"), num: 4 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(20, "kg"), num: 8 },
        { weight: Weight_build(10, "kg"), num: 4 },
        { weight: Weight_build(5, "kg"), num: 4 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    trapbar: {
      vtype: "equipment_data",
      multiplier: 2,
      bar: {
        lb: Weight_build(45, "lb"),
        kg: Weight_build(20, "kg"),
      },
      plates: [
        { weight: Weight_build(45, "lb"), num: 8 },
        { weight: Weight_build(25, "lb"), num: 4 },
        { weight: Weight_build(10, "lb"), num: 4 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(20, "kg"), num: 8 },
        { weight: Weight_build(10, "kg"), num: 4 },
        { weight: Weight_build(5, "kg"), num: 4 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    leverageMachine: {
      vtype: "equipment_data",
      multiplier: 1,
      bar: {
        lb: Weight_build(0, "lb"),
        kg: Weight_build(0, "kg"),
      },
      plates: [
        { weight: Weight_build(45, "lb"), num: 8 },
        { weight: Weight_build(25, "lb"), num: 4 },
        { weight: Weight_build(10, "lb"), num: 4 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(20, "kg"), num: 8 },
        { weight: Weight_build(10, "kg"), num: 4 },
        { weight: Weight_build(5, "kg"), num: 4 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    smith: {
      vtype: "equipment_data",
      multiplier: 2,
      bar: {
        lb: Weight_build(45, "lb"),
        kg: Weight_build(20, "kg"),
      },
      plates: [
        { weight: Weight_build(45, "lb"), num: 8 },
        { weight: Weight_build(25, "lb"), num: 4 },
        { weight: Weight_build(10, "lb"), num: 4 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(20, "kg"), num: 8 },
        { weight: Weight_build(10, "kg"), num: 4 },
        { weight: Weight_build(5, "kg"), num: 4 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    dumbbell: {
      vtype: "equipment_data",
      multiplier: 2,
      bar: {
        lb: Weight_build(10, "lb"),
        kg: Weight_build(5, "kg"),
      },
      plates: [
        { weight: Weight_build(10, "lb"), num: 8 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(5, "kg"), num: 8 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [
        Weight_build(10, "lb"),
        Weight_build(15, "lb"),
        Weight_build(20, "lb"),
        Weight_build(25, "lb"),
        Weight_build(30, "lb"),
        Weight_build(35, "lb"),
        Weight_build(40, "lb"),
        Weight_build(4, "kg"),
        Weight_build(6, "kg"),
        Weight_build(8, "kg"),
        Weight_build(10, "kg"),
        Weight_build(12, "kg"),
        Weight_build(14, "kg"),
        Weight_build(20, "kg"),
      ],
      isFixed: false,
    },
    ezbar: {
      vtype: "equipment_data",
      multiplier: 2,
      bar: {
        lb: Weight_build(20, "lb"),
        kg: Weight_build(10, "kg"),
      },
      plates: [
        { weight: Weight_build(45, "lb"), num: 8 },
        { weight: Weight_build(25, "lb"), num: 4 },
        { weight: Weight_build(10, "lb"), num: 4 },
        { weight: Weight_build(5, "lb"), num: 4 },
        { weight: Weight_build(2.5, "lb"), num: 4 },
        { weight: Weight_build(1.25, "lb"), num: 2 },
        { weight: Weight_build(20, "kg"), num: 8 },
        { weight: Weight_build(10, "kg"), num: 4 },
        { weight: Weight_build(5, "kg"), num: 4 },
        { weight: Weight_build(2.5, "kg"), num: 4 },
        { weight: Weight_build(1.25, "kg"), num: 4 },
        { weight: Weight_build(0.5, "kg"), num: 2 },
      ],
      fixed: [],
      isFixed: false,
    },
    cable: {
      vtype: "equipment_data",
      multiplier: 1,
      bar: {
        lb: Weight_build(0, "lb"),
        kg: Weight_build(0, "kg"),
      },
      plates: [
        {
          weight: Weight_build(10, "lb"),
          num: 20,
        },
        {
          weight: Weight_build(5, "lb"),
          num: 10,
        },
        {
          weight: Weight_build(5, "kg"),
          num: 20,
        },
        {
          weight: Weight_build(2.5, "kg"),
          num: 10,
        },
      ],
      fixed: [],
      isFixed: false,
    },
    kettlebell: {
      vtype: "equipment_data",
      multiplier: 1,
      bar: {
        lb: Weight_build(0, "lb"),
        kg: Weight_build(0, "kg"),
      },
      plates: [],
      fixed: [
        Weight_build(10, "lb"),
        Weight_build(15, "lb"),
        Weight_build(20, "lb"),
        Weight_build(25, "lb"),
        Weight_build(30, "lb"),
        Weight_build(35, "lb"),
        Weight_build(40, "lb"),
        Weight_build(4, "kg"),
        Weight_build(8, "kg"),
        Weight_build(12, "kg"),
        Weight_build(16, "kg"),
        Weight_build(24, "kg"),
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
        vtype: "gym",
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
    statsEnabled: { weight: { weight: true }, length: {}, percentage: {} },
    exercises: {},
    graphs: { graphs: [], vtype: "graphs" },
    planner: Settings_buildPlannerSettings(),
    muscleGroups: {
      vtype: "muscle_groups_settings",
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
  const newEvalutedProgram = ObjectUtils_clone(program);
  PP_iterate2(newEvalutedProgram.weeks, (ex) => {
    if (ex.key === programExerciseId) {
      for (const setVariation of ex.evaluatedSetVariations) {
        for (const set of setVariation.sets) {
          const weightChange = weightChanges.find((wc) =>
            Weight_eqNull(wc.originalWeight, set.weight),
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
  const evaluatedProgram = ObjectUtils_clone(
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
      labelSuffix = UidFactory_generateUid(3);
    } else {
      noConflicts = true;
    }
  }

  const renameMapping: Record<
    string,
    { to: string; dayData?: Required<IDayData> }
  > = {};
  PP_iterate2(evaluatedProgram.weeks, (exercise, weekIndex, dayInWeekIndex) => {
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
  });
  return new ProgramToPlanner(evaluatedProgram, settings).convertToPlanner({
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

export function PlannerProgram_switchToUnit(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): IPlannerProgram {
  const newPlannerProgram = ObjectUtils_clone(plannerProgram);
  for (const week of newPlannerProgram.weeks) {
    for (const day of week.days) {
      const evaluator = new PlannerExerciseEvaluator(
        day.exerciseText,
        settings,
        "perday",
      );
      const tree = plannerExerciseParser.parse(day.exerciseText);
      day.exerciseText = evaluator.switchWeightsToUnit(tree.topNode, settings);
    }
  }
  return newPlannerProgram;
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
    ObjectUtils_clone(oldPlannerProgram),
    settings,
  );
  const { evaluatedWeeks: newEvaluatedWeeks } = PlannerProgram_evaluate(
    ObjectUtils_clone(plannerProgram),
    settings,
  );
  for (const ev of [evaluatedWeeks, newEvaluatedWeeks]) {
    PP_iterate(ev, (exercise) => {
      if (exercise.repeat != null && exercise.repeat.length > 0) {
        repeatingExercises.add(exercise.key);
      }
    });
  }
  for (const ex of additionalRepeatingExercises || []) {
    repeatingExercises.add(ex);
  }

  const lastDescriptions: Partial<Record<number, string | undefined>> = {};
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
      const tree = plannerExerciseParser.parse(day.exerciseText);
      const evaluator = new PlannerExerciseEvaluator(
        day.exerciseText,
        settings,
        "perday",
        {
          day: dayIndex + 1,
          dayInWeek: dayInWeekIndex + 1,
          week: weekIndex + 1,
        },
      );
      dayIndex += 1;
      const map = evaluator.topLineMap(tree.topNode);
      return map;
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
      const tree = plannerExerciseParser.parse(day.exerciseText);
      const evaluator = new PlannerExerciseEvaluator(
        day.exerciseText,
        settings,
        "perday",
        {
          day: dayIndex + 1,
          dayInWeek: dayInWeekIndex + 1,
          week: weekIndex + 1,
        },
      );
      dayIndex += 1;
      const map = evaluator.topLineMap(tree.topNode);
      return map;
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
  const evaluator = new PlannerExerciseEvaluatorText(fullProgramText);
  const tree = plannerExerciseParser.parse(fullProgramText);
  const data = evaluator.evaluate(tree.topNode);
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

type IDictionaryC<D extends t.Mixed, C extends t.Mixed> = t.DictionaryType<
  D,
  C,
  {
    [K in t.TypeOf<D>]?: t.TypeOf<C>;
  },
  {
    [K in t.OutputOf<D>]?: t.OutputOf<C>;
  },
  unknown
>;

const dictionary = <D extends t.Mixed, C extends t.Mixed>(
  domain: D,
  codomain: C,
  name?: string,
): IDictionaryC<D, C> => {
  return unsafeCoerce(t.record(t.union([domain, t.undefined]), codomain, name));
};

const equipments = [
  "barbell",
  "cable",
  "dumbbell",
  "smith",
  "band",
  "kettlebell",
  "bodyweight",
  "leverageMachine",
  "medicineball",
  "ezbar",
  "trapbar",
] as const;
const TBuiltinEquipment = t.keyof(
  equipments.reduce<Record<IArrayElement<typeof equipments>, null>>(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof equipments>, null>,
  ),
  "TBuiltinEquipment",
);

const availableMuscles = [
  "Adductor Brevis",
  "Adductor Longus",
  "Adductor Magnus",
  "Biceps Brachii",
  "Brachialis",
  "Brachioradialis",
  "Deltoid Anterior",
  "Deltoid Lateral",
  "Deltoid Posterior",
  "Erector Spinae",
  "Gastrocnemius",
  "Gluteus Maximus",
  "Gluteus Medius",
  "Hamstrings",
  "Iliopsoas",
  "Infraspinatus",
  "Latissimus Dorsi",
  "Levator Scapulae",
  "Obliques",
  "Pectineous",
  "Pectoralis Major Clavicular Head",
  "Pectoralis Major Sternal Head",
  "Quadriceps",
  "Rectus Abdominis",
  "Sartorius",
  "Serratus Anterior",
  "Soleus",
  "Splenius",
  "Sternocleidomastoid",
  "Tensor Fasciae Latae",
  "Teres Major",
  "Teres Minor",
  "Tibialis Anterior",
  "Trapezius Lower Fibers",
  "Trapezius Middle Fibers",
  "Trapezius Upper Fibers",
  "Triceps Brachii",
  "Wrist Extensors",
  "Wrist Flexors",
] as const;

const TMuscle = t.keyof(
  availableMuscles.reduce<Record<IArrayElement<typeof availableMuscles>, null>>(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof availableMuscles>, null>,
  ),
  "TMuscle",
);

const availableBodyParts = [
  "Back",
  "Calves",
  "Chest",
  "Forearms",
  "Hips",
  "Shoulders",
  "Thighs",
  "Upper Arms",
  "Waist",
];

const exerciseKinds = [
  "core",
  "pull",
  "push",
  "legs",
  "upper",
  "lower",
] as const;
const TExerciseKind = t.keyof(
  exerciseKinds.reduce<Record<IArrayElement<typeof exerciseKinds>, null>>(
    (memo, kind) => {
      memo[kind] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof exerciseKinds>, null>,
  ),
  "TExerciseKind",
);

const TBodyPart = t.keyof(
  availableBodyParts.reduce<
    Record<IArrayElement<typeof availableBodyParts>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof availableBodyParts>, null>,
  ),
  "TBodyPart",
);

const graphExerciseSelectedTypes = ["weight", "volume"] as const;
const TGraphExerciseSelectedType = t.keyof(
  graphExerciseSelectedTypes.reduce<
    Record<IArrayElement<typeof graphExerciseSelectedTypes>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof graphExerciseSelectedTypes>, null>,
  ),
  "TGraphExerciseSelectedType",
);

const graphMuscleGroupSelectedTypes = ["volume", "sets"] as const;
const TGraphMuscleGroupSelectedType = t.keyof(
  graphMuscleGroupSelectedTypes.reduce<
    Record<IArrayElement<typeof graphMuscleGroupSelectedTypes>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof graphMuscleGroupSelectedTypes>, null>,
  ),
  "TGraphMuscleGroupSelectedType",
);

const TEquipment = t.string;
type IEquipment = t.TypeOf<typeof TEquipment>;

const TExerciseId = t.string;
type IExerciseId = t.TypeOf<typeof TExerciseId>;

const TMetaExercises = t.intersection(
  [
    t.interface({
      bodyParts: t.array(TBodyPart),
      targetMuscles: t.array(TMuscle),
      synergistMuscles: t.array(TMuscle),
    }),
    t.partial({
      sortedEquipment: t.array(TEquipment),
    }),
  ],
  "TMetaExercises",
);

const TExerciseType = t.intersection(
  [
    t.interface({
      id: TExerciseId,
    }),
    t.partial({
      equipment: TEquipment,
    }),
  ],
  "TExerciseType",
);
export type IExerciseType = t.TypeOf<typeof TExerciseType>;

const TCustomExercise = t.intersection(
  [
    t.interface({
      vtype: t.literal("custom_exercise"),
      id: TExerciseId,
      name: t.string,
      isDeleted: t.boolean,
      meta: TMetaExercises,
    }),
    t.partial({
      defaultEquipment: TEquipment,
      types: t.array(TExerciseKind),
      clonedFrom: TExerciseType,
      reuseImageFrom: TExerciseType,
      largeImageUrl: t.string,
      smallImageUrl: t.string,
    }),
  ],
  "TCustomExercise",
);
type ICustomExercise = t.TypeOf<typeof TCustomExercise>;
type IAllCustomExercises = Partial<Record<string, ICustomExercise>>;

const units = ["kg", "lb"] as const;

const TUnit = t.keyof(
  units.reduce<Record<IArrayElement<typeof units>, null>>(
    (memo, exerciseType) => {
      memo[exerciseType] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof units>, null>,
  ),
  "TUnit",
);
export type IUnit = t.TypeOf<typeof TUnit>;

const TWeight = t.type(
  {
    value: t.number,
    unit: TUnit,
  },
  "TWeight",
);
export type IWeight = t.TypeOf<typeof TWeight>;

const TPlate = t.type(
  {
    weight: TWeight,
    num: t.number,
  },
  "TPlate",
);
type IPlate = t.TypeOf<typeof TPlate>;

const percentageUnits = ["%"] as const;

const TPercentageUnit = t.keyof(
  percentageUnits.reduce<Record<IArrayElement<typeof percentageUnits>, null>>(
    (memo, exerciseType) => {
      memo[exerciseType] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof percentageUnits>, null>,
  ),
  "TPercentageUnit",
);

const TPercentage = t.type(
  { value: t.number, unit: TPercentageUnit },
  "TPercentage",
);
type IPercentage = t.TypeOf<typeof TPercentage>;

const TSet = t.intersection(
  [
    t.interface({
      vtype: t.literal("set"),
      index: t.number,
      id: t.string,
    }),
    t.partial({
      reps: t.number,
      originalWeight: t.union([TWeight, TPercentage]),
      weight: TWeight,
      minReps: t.number,
      rpe: t.number,
      logRpe: t.boolean,
      timestamp: t.number,
      isAmrap: t.boolean,
      label: t.string,
      timer: t.number,
      askWeight: t.boolean,
      isCompleted: t.boolean,
      isUnilateral: t.boolean,
      completedRepsLeft: t.number,
      completedReps: t.number,
      completedWeight: TWeight,
      completedRpe: t.number,
      programSetIndex: t.number,
    }),
  ],
  "TSet",
);
type ISet = t.TypeOf<typeof TSet>;

const TProgramState = t.dictionary(
  t.string,
  t.union([t.number, TWeight, TPercentage]),
  "TProgramState",
);
type IProgramState = t.TypeOf<typeof TProgramState>;

const THistoryEntry = t.intersection(
  [
    t.interface({
      vtype: t.literal("history_entry"),
      exercise: TExerciseType,
      sets: t.array(TSet),
      warmupSets: t.array(TSet),
      index: t.number,
      id: t.string,
    }),
    t.partial({
      programExerciseId: t.string,
      state: TProgramState,
      vars: TProgramState,
      notes: t.string,
      changed: t.boolean,
      isSuppressed: t.boolean,
      superset: t.string,
      updatePrints: t.array(t.array(t.union([t.number, TWeight, TPercentage]))),
    }),
  ],
  "THistoryEntry",
);
type IHistoryEntry = t.TypeOf<typeof THistoryEntry>;

const TProgramStateMetadataValue = t.partial(
  {
    userPrompted: t.boolean,
  },
  "TProgramStateMetadataValue",
);

const TProgramStateMetadata = dictionary(t.string, TProgramStateMetadataValue);
type IProgramStateMetadata = t.TypeOf<typeof TProgramStateMetadata>;

const TProgramSet = t.intersection(
  [
    t.interface({
      repsExpr: t.string,
      weightExpr: t.string,
    }),
    t.partial({
      isAmrap: t.boolean,
      rpeExpr: t.string,
      minRepsExpr: t.string,
      logRpe: t.boolean,
      askWeight: t.boolean,
      label: t.string,
      timerExpr: t.string,
    }),
  ],
  "TProgramSet",
);

const TProgramExerciseVariation = t.intersection(
  [
    t.interface({
      sets: t.array(TProgramSet),
    }),
    t.partial({
      quickAddSets: t.boolean,
    }),
  ],
  "TProgramExerciseVariation",
);

const TProgramExerciseWarmupSet = t.type(
  {
    reps: t.number,
    value: t.union([TWeight, t.number]),
    threshold: TWeight,
  },
  "TProgramExerciseWarmupSet",
);
type IProgramExerciseWarmupSet = Readonly<
  t.TypeOf<typeof TProgramExerciseWarmupSet>
>;

const TProgramExerciseReuseLogic = t.type(
  {
    selected: t.union([t.string, t.undefined]),
    states: t.record(t.string, TProgramState),
  },
  "TProgramExerciseReuseLogic",
);

const TProgramExercise = t.intersection(
  [
    t.interface({
      exerciseType: TExerciseType,
      id: t.string,
      name: t.string,
      variations: t.array(TProgramExerciseVariation),
      state: TProgramState,
      variationExpr: t.string,
      finishDayExpr: t.string,
      descriptions: t.array(t.string),
    }),
    t.partial({
      tags: t.array(t.number),
      updateDayExpr: t.string,
      diffPaths: t.array(t.string),
      description: t.string,
      descriptionExpr: t.string,
      quickAddSets: t.boolean,
      enableRepRanges: t.boolean,
      enableRpe: t.boolean,
      stateMetadata: TProgramStateMetadata,
      timerExpr: t.string,
      reuseLogic: TProgramExerciseReuseLogic,
      warmupSets: t.array(TProgramExerciseWarmupSet),
      reuseFinishDayScript: t.string,
      reuseUpdateDayScript: t.string,
    }),
  ],
  "TProgramExercise",
);

const exercisePickerScreens = [
  "exercisePicker",
  "customExercise",
  "filter",
  "settings",
] as const;
const TExercisePickerScreen = t.keyof(
  exercisePickerScreens.reduce<
    Record<IArrayElement<typeof exercisePickerScreens>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof exercisePickerScreens>, null>,
  ),
  "TExercisePickerScreen",
);

const exercisePickerSorts = ["name_asc", "similar_muscles"] as const;
const TExercisePickerSort = t.keyof(
  exercisePickerSorts.reduce<
    Record<IArrayElement<typeof exercisePickerSorts>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof exercisePickerSorts>, null>,
  ),
  "TExercisePickerSort",
);

const TExercisePickerFilters = t.partial(
  {
    equipment: t.array(TBuiltinEquipment),
    type: t.array(TExerciseKind),
    muscles: t.array(TMuscle),
    isStarred: t.boolean,
  },
  "TExercisePickerFilters",
);

const TExercisePickerProgramExercise = t.type(
  {
    type: t.literal("program"),
    exerciseType: TExerciseType,
    week: t.number,
    dayInWeek: t.number,
  },
  "TExercisePickerProgramExercise",
);

const TExercisePickerAdhocExercise = t.intersection(
  [
    t.interface({
      type: t.literal("adhoc"),
      exerciseType: TExerciseType,
    }),
    t.partial({
      label: t.string,
    }),
  ],
  "ExercisePickerAdhocExercise",
);

const TExercisePickerTemplate = t.intersection(
  [
    t.interface({
      type: t.literal("template"),
      name: t.string,
    }),
    t.partial({
      label: t.string,
    }),
  ],
  "ExercisePickerTemplate",
);

const TExercisePickerSelectedExercise = t.union([
  TExercisePickerProgramExercise,
  TExercisePickerAdhocExercise,
  TExercisePickerTemplate,
]);

const TExercisePickerState = t.intersection([
  t.interface({
    screenStack: t.array(TExercisePickerScreen),
    sort: TExercisePickerSort,
    filters: TExercisePickerFilters,
    selectedExercises: t.array(TExercisePickerSelectedExercise),
    mode: t.union([t.literal("workout"), t.literal("program")]),
  }),
  t.partial({
    showMuscles: t.boolean,
    customExerciseName: t.string,
    label: t.string,
    templateName: t.string,
    selectedTab: t.number,
    editCustomExercise: TCustomExercise,
    search: t.string,
    exerciseType: TExerciseType,
    entryIndex: t.number,
  }),
]);

const TProgressUi = t.partial(
  {
    vtype: t.literal("progress_ui"),
    id: t.string,
    amrapModal: t.intersection([
      t.interface({
        entryIndex: t.number,
        setIndex: t.number,
      }),
      t.partial({
        isAmrap: t.boolean,
        logRpe: t.boolean,
        askWeight: t.boolean,
        userVars: t.boolean,
        nonce: t.number,
      }),
    ]),
    editModal: t.type({
      programExerciseId: t.string,
      entryIndex: t.number,
    }),
    dateModal: t.type({
      date: t.string,
      time: t.number,
    }),
    exercisePicker: t.partial({
      state: TExercisePickerState,
    }),
    equipmentModal: t.partial({
      exerciseType: TExerciseType,
    }),
    rm1Modal: t.partial({
      exerciseType: TExerciseType,
    }),
    editSetModal: t.type({
      isWarmup: t.boolean,
      entryIndex: t.number,
      exerciseType: t.union([TExerciseType, t.undefined]),
      programExerciseId: t.union([t.string, t.undefined]),
      set: TSet,
      setIndex: t.union([t.number, t.undefined]),
    }),
    exerciseBottomSheet: t.type({
      entryIndex: t.number,
    }),
    entryIndexEditMode: t.number,
    currentEntryIndex: t.number,
    showSupersetPicker: THistoryEntry,
    forceUpdateEntryIndex: t.boolean,
    isExternal: t.boolean,
    nativeNotificationScheduled: t.boolean,
  },
  "TProgressUi",
);

const TProgressMode = t.keyof(
  {
    warmup: null,
    workout: null,
  },
  "TProgressMode",
);

const TIntervals = t.array(
  t.tuple([t.number, t.union([t.number, t.undefined, t.null])]),
  "TIntervals",
);

const historyRecordChange = ["order"] as const;
const THistoryRecordChange = t.keyof(
  historyRecordChange.reduce<
    Record<IArrayElement<typeof historyRecordChange>, null>
  >(
    (memo, muscle) => {
      memo[muscle] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof historyRecordChange>, null>,
  ),
  "THistoryRecordChange",
);

const historyRecordRequiredFields = {
  date: t.string,
  programId: t.string,
  programName: t.string,
  day: t.number,
  dayName: t.string,
  entries: t.array(THistoryEntry),
  startTime: t.number,
  id: t.number,
};
const historyRecordOptionalFields = {
  endTime: t.number,
  week: t.number,
  dayInWeek: t.number,
  ui: TProgressUi,
  intervals: TIntervals,
  deletedProgramExercises: dictionary(t.string, t.boolean),
  userPromptedStateVars: dictionary(t.string, TProgramState),
  changes: t.array(THistoryRecordChange),
  timerSince: t.number,
  timerMode: TProgressMode,
  timer: t.number,
  timerEntryIndex: t.number,
  timerSetIndex: t.number,
  notes: t.string,
  updatedAt: t.number,
};

const THistoryRecord = t.intersection(
  [
    t.interface({
      vtype: t.union([t.literal("history_record"), t.literal("progress")]),
      ...historyRecordRequiredFields,
    }),
    t.partial(historyRecordOptionalFields),
  ],
  "THistoryRecord",
);
type IHistoryRecord = t.TypeOf<typeof THistoryRecord>;

const TProgramWeek = t.intersection(
  [
    t.interface({
      id: t.string,
      name: t.string,
      days: t.array(
        t.type({
          id: t.string,
        }),
      ),
    }),
    t.partial({
      description: t.string,
    }),
  ],
  "TProgramWeek",
);

const TProgramDay = t.intersection(
  [
    t.interface({
      id: t.string,
      name: t.string,
      exercises: t.array(
        t.type({
          id: t.string,
        }),
      ),
    }),
    t.partial({ description: t.string }),
  ],
  "TProgramDay",
);

const tags = [
  "first-starter",
  "beginner",
  "barbell",
  "dumbbell",
  "intermediate",
  "woman",
  "ppl",
  "hypertrophy",
] as const;

const TProgramTag = t.keyof(
  tags.reduce<Record<IArrayElement<typeof tags>, null>>(
    (memo, barKey) => {
      memo[barKey] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof tags>, null>,
  ),
  "TProgramTag",
);

const TPlannerProgramDay = t.intersection(
  [
    t.interface({
      name: t.string,
      exerciseText: t.string,
    }),
    t.partial({
      id: t.string,
      description: t.string,
    }),
  ],
  "TPlannerProgramDay",
);
type IPlannerProgramDay = t.TypeOf<typeof TPlannerProgramDay>;

const TPlannerProgramWeek = t.intersection(
  [
    t.interface({
      name: t.string,
      days: t.array(TPlannerProgramDay),
    }),
    t.partial({
      id: t.string,
      description: t.string,
    }),
  ],
  "TPlannerProgramWeek",
);
type IPlannerProgramWeek = Readonly<t.TypeOf<typeof TPlannerProgramWeek>>;

const TPlannerProgram = t.type(
  {
    vtype: t.literal("planner"),
    name: t.string,
    weeks: t.array(TPlannerProgramWeek),
  },
  "TPlannerProgram",
);
export type IPlannerProgram = Readonly<t.TypeOf<typeof TPlannerProgram>>;

const TProgram = t.intersection(
  [
    t.interface({
      vtype: t.literal("program"),
      exercises: t.array(TProgramExercise),
      id: t.string,
      name: t.string,
      description: t.string,
      url: t.string,
      author: t.string,
      nextDay: t.number,
      days: t.array(TProgramDay),
      weeks: t.array(TProgramWeek),
      isMultiweek: t.boolean,
      tags: t.array(TProgramTag),
    }),
    t.partial({
      deletedDays: t.array(t.string),
      deletedWeeks: t.array(t.string),
      deletedExercises: t.array(t.string),
      clonedAt: t.number,
      shortDescription: t.string,
      planner: TPlannerProgram,
      updatedAt: t.number,
      authorid: t.union([t.string, t.null]),
      source: t.union([t.string, t.null]),
    }),
  ],
  "TProgram",
);
export type IProgram = t.TypeOf<typeof TProgram>;

const lengthUnits = ["in", "cm"] as const;

const TLengthUnit = t.keyof(
  lengthUnits.reduce<Record<IArrayElement<typeof lengthUnits>, null>>(
    (memo, exerciseType) => {
      memo[exerciseType] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof lengthUnits>, null>,
  ),
  "TUnit",
);

const TLength = t.type({ value: t.number, unit: TLengthUnit }, "TLength");

const TStatsWeightValue = t.intersection(
  [
    t.interface({
      vtype: t.literal("stat"),
      value: TWeight,
      timestamp: t.number,
    }),
    t.partial({ updatedAt: t.number, appleUuid: t.string }),
  ],
  "TStatsWeightValue",
);

const statsWeightDef = {
  weight: t.array(TStatsWeightValue),
};
const TStatsWeight = t.partial(statsWeightDef, "TStatsWeight");
type IStatsWeight = t.TypeOf<typeof TStatsWeight>;

const TStatsLengthValue = t.intersection(
  [
    t.interface({
      vtype: t.literal("stat"),
      value: TLength,
      timestamp: t.number,
    }),
    t.partial({ updatedAt: t.number, appleUuid: t.string }),
  ],
  "TStatsLengthValue",
);

const statsLengthDef = {
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
const TStatsLength = t.partial(statsLengthDef, "TStatsLength");
type IStatsLength = t.TypeOf<typeof TStatsLength>;

const TStatsPercentageValue = t.intersection(
  [
    t.interface({
      vtype: t.literal("stat"),
      value: TPercentage,
      timestamp: t.number,
    }),
    t.partial({ updatedAt: t.number, appleUuid: t.string }),
  ],
  "TStatsPercentageValue",
);

const statsPercentageDef = {
  bodyfat: t.array(TStatsPercentageValue),
};
const TStatsPercentage = t.partial(statsPercentageDef, "TStatsPercentage");
type IStatsPercentage = t.TypeOf<typeof TStatsPercentage>;

const TStatsWeightEnabled = t.partial(
  ObjectUtils_keys(statsWeightDef).reduce<
    Record<keyof IStatsWeight, t.BooleanC>
  >(
    (memo, key) => {
      memo[key] = t.boolean;
      return memo;
    },
    {} as Record<keyof IStatsWeight, t.BooleanC>,
  ),
  "TStatsWeightEnabled",
);

const TStatsLengthEnabled = t.partial(
  ObjectUtils_keys(statsLengthDef).reduce<
    Record<keyof IStatsLength, t.BooleanC>
  >(
    (memo, key) => {
      memo[key] = t.boolean;
      return memo;
    },
    {} as Record<keyof IStatsLength, t.BooleanC>,
  ),
  "TStatsLengthEnabled",
);

const TStatsPercentageEnabled = t.partial(
  ObjectUtils_keys(statsPercentageDef).reduce<
    Record<keyof IStatsPercentage, t.BooleanC>
  >(
    (memo, key) => {
      memo[key] = t.boolean;
      return memo;
    },
    {} as Record<keyof IStatsPercentage, t.BooleanC>,
  ),
  "TStatsPercentageEnabled",
);

const TStatsEnabled = t.type(
  {
    weight: TStatsWeightEnabled,
    length: TStatsLengthEnabled,
    percentage: TStatsPercentageEnabled,
  },
  "TStatsEnabled",
);

const TSettingsTimers = t.intersection(
  [
    t.interface({
      warmup: t.union([t.number, t.undefined, t.null]),
      workout: t.union([t.number, t.undefined, t.null]),
    }),
    t.partial({
      reminder: t.number,
      superset: t.number,
    }),
  ],
  "TSettingsTimers",
);

const TGraph = t.union([
  t.type({
    vtype: t.literal("graph"),
    type: t.literal("exercise"),
    id: TExerciseId,
  }),
  t.type({
    vtype: t.literal("graph"),
    type: t.literal("statsWeight"),
    id: t.keyof(statsWeightDef),
  }),
  t.type({
    vtype: t.literal("graph"),
    type: t.literal("statsLength"),
    id: t.keyof(statsLengthDef),
  }),
  t.type({
    vtype: t.literal("graph"),
    type: t.literal("statsPercentage"),
    id: t.keyof(statsPercentageDef),
  }),
  t.type({
    vtype: t.literal("graph"),
    type: t.literal("muscleGroup"),
    id: t.string,
  }),
]);

const TEquipmentData = t.intersection(
  [
    t.interface({
      vtype: t.literal("equipment_data"),
      bar: t.type({
        lb: TWeight,
        kg: TWeight,
      }),
      multiplier: t.number,
      plates: t.array(t.type({ weight: TWeight, num: t.number })),
      fixed: t.array(TWeight),
      isFixed: t.boolean,
    }),
    t.partial({
      unit: TUnit,
      name: t.string,
      similarTo: t.string,
      isDeleted: t.boolean,
      useBodyweightForBar: t.boolean,
      isAssisting: t.boolean,
      notes: t.string,
    }),
  ],
  "TEquipmentData",
);
type IEquipmentData = t.TypeOf<typeof TEquipmentData>;
type IAllEquipment = Partial<Record<string, IEquipmentData>>;

const TGraphOptions = t.partial({
  movingAverageWindowSize: t.number,
});

const TExerciseDataValue = t.partial(
  {
    rm1: TWeight,
    rounding: t.number,
    equipment: dictionary(t.string, t.union([t.string, t.undefined])),
    notes: t.string,
    muscleMultipliers: dictionary(TMuscle, t.union([t.number, t.undefined])),
    isUnilateral: t.boolean,
  },
  "TExerciseDataValue",
);
type IExerciseDataValue = t.TypeOf<typeof TExerciseDataValue>;
type IExerciseData = Partial<Record<string, IExerciseDataValue>>;

const screenMuscles: string[] = [
  "shoulders",
  "triceps",
  "back",
  "abs",
  "glutes",
  "hamstrings",
  "quadriceps",
  "chest",
  "biceps",
  "calves",
  "forearms",
];

const TScreenMuscle = t.union(
  [
    t.keyof(
      screenMuscles.reduce<Record<IArrayElement<typeof screenMuscles>, null>>(
        (memo, muscle) => {
          memo[muscle] = null;
          return memo;
        },
        {} as Record<IArrayElement<typeof screenMuscles>, null>,
      ),
    ),
    t.string,
  ],
  "TScreenMuscle",
);

const TPlannerSettings = t.type(
  {
    synergistMultiplier: t.number,
    strengthSetsPct: t.number,
    hypertrophySetsPct: t.number,
    weeklyRangeSets: dictionary(TScreenMuscle, t.tuple([t.number, t.number])),
    weeklyFrequency: dictionary(TScreenMuscle, t.number),
  },
  "TPlannerSettings",
);
type IPlannerSettings = t.TypeOf<typeof TPlannerSettings>;

const TGym = t.type(
  {
    vtype: t.literal("gym"),
    id: t.string,
    name: t.string,
    equipment: dictionary(TEquipment, TEquipmentData),
  },
  "TGym",
);
type IGym = t.TypeOf<typeof TGym>;

const targetTypes = ["target", "lasttime", "platescalculator", "e1rm"] as const;
const TTargetType = t.keyof(
  targetTypes.reduce<Record<IArrayElement<typeof targetTypes>, null>>(
    (memo, exerciseType) => {
      memo[exerciseType] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof targetTypes>, null>,
  ),
  "TTargetType",
);

const TWorkoutSettings = t.intersection(
  [
    t.interface({
      targetType: TTargetType,
    }),
    t.partial({
      shouldHideGraphs: t.boolean,
      shouldKeepProgramExerciseId: t.boolean,
      shouldShowInvisibleEquipment: t.boolean,
      pickerSort: TExercisePickerSort,
    }),
  ],
  "TWorkoutSettings",
);

const TGraphs = t.type({
  vtype: t.literal("graphs"),
  graphs: t.array(TGraph),
});

const TMuscleGroupsSettings = t.type({
  vtype: t.literal("muscle_groups_settings"),
  data: t.dictionary(
    t.string,
    t.partial({
      name: t.string,
      isHidden: t.boolean,
      muscles: t.array(TMuscle),
    }),
  ),
});

const TSettings = t.intersection(
  [
    t.interface({
      timers: TSettingsTimers,
      gyms: t.array(TGym),
      deletedGyms: t.array(t.string),
      graphs: TGraphs,
      graphOptions: dictionary(t.string, TGraphOptions),
      graphsSettings: t.partial({
        isSameXAxis: t.boolean,
        isWithBodyweight: t.boolean,
        isWithOneRm: t.boolean,
        isWithProgramLines: t.boolean,
        defaultType: TGraphExerciseSelectedType,
        defaultMuscleGroupType: TGraphMuscleGroupSelectedType,
      }),
      exerciseStatsSettings: t.partial({
        ascendingSort: t.boolean,
        hideWithoutWorkoutNotes: t.boolean,
        hideWithoutExerciseNotes: t.boolean,
      }),
      exercises: dictionary(t.string, TCustomExercise),
      statsEnabled: TStatsEnabled,
      units: TUnit,
      lengthUnits: TLengthUnit,
      volume: t.number,
      exerciseData: dictionary(t.string, TExerciseDataValue),
      planner: TPlannerSettings,
      workoutSettings: TWorkoutSettings,
      muscleGroups: TMuscleGroupsSettings,
    }),
    t.partial({
      appleHealthSyncWorkout: t.boolean,
      appleHealthSyncMeasurements: t.boolean,
      appleHealthAnchor: t.string,
      googleHealthSyncWorkout: t.boolean,
      googleHealthSyncMeasurements: t.boolean,
      googleHealthAnchor: t.string,
      healthConfirmation: t.boolean,
      ignoreDoNotDisturb: t.boolean,
      currentGymId: t.string,
      isPublicProfile: t.boolean,
      nickname: t.string,
      alwaysOnDisplay: t.boolean,
      vibration: t.boolean,
      startWeekFromMonday: t.boolean,
      textSize: t.number,
      starredExercises: dictionary(TExerciseId, t.boolean),
      theme: t.union([t.literal("dark"), t.literal("light")]),
      currentBodyweight: TWeight,
      affiliateEnabled: t.boolean,
    }),
  ],
  "TSettings",
);

export type ISettings = t.TypeOf<typeof TSettings>;

const TStats = t.type(
  {
    weight: TStatsWeight,
    length: TStatsLength,
    percentage: TStatsPercentage,
  },
  "TStats",
);
export type IStats = t.TypeOf<typeof TStats>;

type IDayData = {
  week?: number;
  day: number;
  dayInWeek?: number;
};

//#endregion

//#region Program Exercise

export interface IWeightChange {
  originalWeight: IWeight | IPercentage;
  weight: IWeight | IPercentage;
  current: boolean;
}

export function ProgramExercise_weightChanges(
  program: IEvaluatedProgram,
  programExerciseKey: string,
): IWeightChange[] {
  const results: Record<string, IWeightChange> = {};
  PP_iterate2(program.weeks, (exercise) => {
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
            const key = Weight_print(set.weight);
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
                  weight: Weight_build(100, "lb"),
                  logRpe: false,
                  isAmrap: false,
                  isQuickAddSet: false,
                  askWeight: false,
                };
                const lastSet = sets[sets.length - 1] || defaultSet;
                sets.splice(newValue);
                for (let i = sets.length; i < newValue; i += 1) {
                  sets.push(ObjectUtils_clone(lastSet));
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
                indexValue = Weight_applyOp(
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
                indexValue = Weight_applyOp(
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
  value: IWeight | IPercentage | number,
  op: IAssignmentOp,
): void {
  if (op === "=") {
    if (key === "weight" && (Weight_is(value) || Weight_isPct(value))) {
      set[key] = value;
    } else if (
      typeof value === "number" &&
      (key === "maxrep" || key === "minrep" || key === "timer" || key === "rpe")
    ) {
      set[key] = value;
    } else if (
      typeof value === "number" &&
      (key === "askWeight" || key === "isAmrap" || key === "logRpe")
    ) {
      set[key] = value !== 0;
    }
  } else {
    const onerm = Exercise_onerm(programExercise.exerciseType, settings);
    let oldValue =
      typeof set[key] === "boolean" ? (set[key] ? 1 : 0) : set[key];
    if (oldValue == null && ProgramSet_isEligibleForInferredWeight(set)) {
      const inferredWeight = ProgramSet_getEvaluatedWeight(
        set,
        programExercise.exerciseType,
        settings,
      );
      oldValue = inferredWeight;
    }
    const newValue = Weight_applyOp(onerm, oldValue ?? 0, value, op);
    if (key === "weight" && (Weight_is(newValue) || Weight_isPct(newValue))) {
      set[key] = newValue;
    } else if (
      typeof newValue === "number" &&
      (key === "maxrep" || key === "minrep" || key === "timer" || key === "rpe")
    ) {
      set[key] = newValue;
    } else if (
      typeof newValue === "number" &&
      (key === "askWeight" || key === "isAmrap" || key === "logRpe")
    ) {
      set[key] = newValue !== 0;
    }
  }
}

//#endregion

//#region Planner Key

function PlannerKey_fromPlannerExercise(
  plannerExercise: IPlannerProgramExercise,
  settings: ISettings,
): string {
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
): string {
  const key = Exercise_toKey(exerciseType);
  const plannerKey = `${label ? `${label}-` : ""}${key}`.toLowerCase();
  return plannerKey;
}

export const PlannerKey_fromFullName = memoize(
  (fullName: string, exercises: IAllCustomExercises): string => {
    const { label, name, equipment } =
      PlannerExerciseEvaluator.extractNameParts(fullName, exercises);
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
  ): string => {
    const exercise = Exercise_findByNameEquipment(exercises, name, equipment);
    const key = exercise ? Exercise_toKey(exercise) : name;
    const plannerKey = `${label ? `${label}-` : ""}${key}`.toLowerCase();
    return plannerKey;
  },
  {
    maxSize: 1000,
  },
);

//#endregion

//#region Stats

function Stats_getCurrentBodyweight(stats: IStats): IWeight | undefined {
  const weights = CollectionUtils_sortBy(
    stats.weight.weight || [],
    "timestamp",
    true,
  );
  return weights[0]?.value;
}

function Stats_getCurrentMovingAverageBodyweight(
  stats: IStats,
  settings: ISettings,
): IWeight | undefined {
  const movingAverageWindowSize =
    settings.graphOptions.weight?.movingAverageWindowSize;
  if (!movingAverageWindowSize) {
    return Stats_getCurrentBodyweight(stats);
  }
  const weights = CollectionUtils_sortBy(
    stats.weight.weight || [],
    "timestamp",
    true,
  );
  if (weights.length < movingAverageWindowSize) {
    return Stats_getCurrentBodyweight(stats);
  }
  const recentWeights = weights.slice(0, movingAverageWindowSize);
  const totalWeight = recentWeights.reduce(
    (sum, item) => Weight_add(sum, item.value),
    Weight_build(0, settings.units),
  );
  return Weight_divide(totalWeight, recentWeights.length);
}

export function Stats_getEmpty(): IStats {
  return {
    weight: {},
    percentage: {},
    length: {},
  };
}

//#endregion

//#region Pages Planner Model Types
interface IPlannerProgramExerciseDescription {
  value: string;
  isCurrent: boolean;
}

interface IPlannerProgramExerciseGlobals {
  logRpe?: boolean;
  rpe?: number;
  timer?: number;
  percentage?: number;
  weight?: IWeight;
  askWeight?: boolean;
}

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
  globals: IPlannerProgramExerciseGlobals;
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
  weight?: IWeight | IPercentage;
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
  values: IPlannerProgramExerciseDescription[];
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
  liftoscriptNode?: SyntaxNode;
  meta?: {
    stateKeys?: Set<string>;
  };
}

interface IPlannerProgramProperty {
  name: string;
  fnName: string;
  fnArgs: string[];
  script?: string;
  body?: string;
  reuse?: IPlannerProgramProperty;
  liftoscriptNode?: SyntaxNode;
  exerciseType?: IExerciseType;
  exerciseLabel?: string;
  exerciseKey?: string;
  label?: string;
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

type IPlannerExerciseEvaluatorMode = "perday" | "full" | "onset";

export class PlannerExerciseEvaluator {
  private readonly script: string;
  private readonly mode: IPlannerExerciseEvaluatorMode;
  private dayData: Required<IDayData>;
  private readonly settings: ISettings;
  private weeks: IPlannerExerciseEvaluatorWeek[] = [];
  private exerciseIndex: number = 0;

  private latestDescriptions: string[][] = [];

  constructor(
    script: string,
    settings: ISettings,
    mode: IPlannerExerciseEvaluatorMode,
    dayData?: Required<IDayData>,
  ) {
    this.script = script;
    this.settings = settings;
    this.dayData = dayData || { day: 1, week: 1, dayInWeek: 1 };
    this.mode = mode;
  }

  private getValue(node: SyntaxNode): string {
    return this.getValueTrim(node).replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  }

  private getValueTrim(node: SyntaxNode): string {
    return this.script.slice(node.from, node.to);
  }

  public static applyChangesToScript(
    script: string,
    ranges: [number, number, string][],
  ): string {
    let offset = 0;
    while (ranges.length > 0) {
      const [from, to, replacement] = ranges.shift()!;
      script =
        script.slice(0, from + offset) +
        replacement +
        script.slice(to + offset);
      offset += replacement.length - (to - from);
    }
    return script;
  }

  public static isEqualProperty(
    a: IPlannerProgramProperty,
    b: IPlannerProgramProperty,
  ): boolean {
    return (
      a.fnName === b.fnName &&
      a.fnArgs.join() === b.fnArgs.join() &&
      a.script === b.script &&
      a.body === b.body
    );
  }

  public static isEqualProgress(
    a: IProgramExerciseProgress,
    b: IProgramExerciseProgress,
  ): boolean {
    const pickA = {
      ...ObjectUtils_pick(a, ["type", "state", "stateMetadata", "script"]),
      reuse: a.reuse?.fullName,
    };
    const pickB = {
      ...ObjectUtils_pick(b, ["type", "state", "stateMetadata", "script"]),
      reuse: b.reuse?.fullName,
    };
    return ObjectUtils_isEqual(pickA, pickB);
  }

  public static isEqualUpdate(
    a: IProgramExerciseUpdate,
    b: IProgramExerciseUpdate,
  ): boolean {
    const pickA = {
      ...ObjectUtils_pick(a, ["type", "script"]),
      reuse: a.reuse?.fullName,
    };
    const pickB = {
      ...ObjectUtils_pick(b, ["type", "script"]),
      reuse: b.reuse?.fullName,
    };
    return ObjectUtils_isEqual(pickA, pickB);
  }

  private getPoint(node: SyntaxNode): IPlannerSyntaxPointer {
    const [line, offset] = this.getLineAndOffset(node);
    return { line, offset, from: node.from, to: node.to };
  }

  private error(message: string, node: SyntaxNode): never {
    const point = this.getPoint(node);
    throw PlannerSyntaxError.fromPoint(undefined, message, point);
  }

  public static getLineAndOffset(
    script: string,
    node: SyntaxNode,
  ): [number, number] {
    const linesLengths = script.split("\n").map((l) => l.length + 1);
    let offset = 0;
    for (let i = 0; i < linesLengths.length; i++) {
      const lineLength = linesLengths[i];
      if (node.from >= offset && node.from < offset + lineLength) {
        return [i + 1, node.from - offset];
      }
      offset += lineLength;
    }
    return [linesLengths.length, linesLengths[linesLengths.length - 1]];
  }

  private getLineAndOffset(node: SyntaxNode): [number, number] {
    return PlannerExerciseEvaluator.getLineAndOffset(this.script, node);
  }

  public parse(expr: SyntaxNode): void {
    const cursor = expr.cursor();
    do {
      if (cursor.node.type.isError) {
        this.error("Syntax error", cursor.node);
      }
    } while (cursor.next());
  }

  private getWarmupReps(setParts: string): {
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

  private getRepRange(
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

  private getWeight(expr?: SyntaxNode | null): IWeight | undefined {
    if (
      expr?.type.name === PlannerNodeName.WeightWithPlus ||
      expr?.type.name === PlannerNodeName.Weight
    ) {
      const value = this.getValue(expr).replace("+", "");
      const unit = value.indexOf("kg") !== -1 ? "kg" : "lb";
      return Weight_build(parseFloat(value), unit);
    } else {
      return undefined;
    }
  }

  private evaluateWarmupSet(
    expr: SyntaxNode,
  ): IPlannerProgramExerciseWarmupSet {
    if (expr.type.name === PlannerNodeName.WarmupExerciseSet) {
      const setPartNodes = expr.getChildren(PlannerNodeName.WarmupSetPart);
      const setParts = setPartNodes
        .map((setPartNode) => this.getValue(setPartNode))
        .join("");
      const { numberOfSets, reps } = this.getWarmupReps(setParts);
      const percentageNode = expr.getChild(PlannerNodeName.Percentage);
      const weightNode = expr.getChild(PlannerNodeName.Weight);
      const percentage =
        percentageNode == null
          ? undefined
          : parseFloat(this.getValue(percentageNode).replace("%", ""));
      const weight = this.getWeight(weightNode);
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

  public static fnArgsToStateVars(
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
          ? Weight_parse(fnArgValStr)
          : fnArgValStr.match(/%/)
            ? Weight_buildPct(parseFloat(fnArgValStr))
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

  private evaluateSet(expr: SyntaxNode): IPlannerProgramExerciseSet {
    if (expr.type.name === PlannerNodeName.ExerciseSet) {
      const setPartNodes = expr.getChildren(PlannerNodeName.SetPart);
      const setParts = setPartNodes
        .map((setPartNode) => this.getValue(setPartNode))
        .join("");
      const repRange = this.getRepRange(setParts);
      const rpeNode = expr.getChild(PlannerNodeName.Rpe);
      const timerNode = expr.getChild(PlannerNodeName.Timer);
      const percentageNode = expr.getChild(PlannerNodeName.PercentageWithPlus);
      const weightNode = expr.getChild(PlannerNodeName.WeightWithPlus);
      const labelNode = expr.getChild(PlannerNodeName.SetLabel);
      const askWeightNode = expr.getChild(PlannerNodeName.AskWeight);
      const askWeight =
        askWeightNode != null ||
        (weightNode != null && this.getValue(weightNode).indexOf("+") !== -1) ||
        (percentageNode != null &&
          this.getValue(percentageNode).indexOf("+") !== -1);
      const logRpe =
        rpeNode == null
          ? undefined
          : this.getValue(rpeNode).indexOf("+") !== -1;
      let rpe =
        rpeNode == null
          ? undefined
          : parseFloat(
              this.getValue(rpeNode).replace("@", "").replace("+", ""),
            );
      if (rpe != null && isNaN(rpe)) {
        rpe = undefined;
      }
      const timer =
        timerNode == null
          ? undefined
          : parseInt(this.getValue(timerNode).replace("s", ""), 10);
      const percentage =
        percentageNode == null
          ? undefined
          : parseFloat(this.getValue(percentageNode).replace(/[%\+]/, ""));
      const weight = this.getWeight(weightNode);
      const label = labelNode
        ? getChildren(labelNode)
            .map((n) => this.getValue(n))
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

  private evaluateId(expr: SyntaxNode): number[] {
    if (expr.type.name === PlannerNodeName.ExerciseProperty) {
      const valueNode = expr.getChild(PlannerNodeName.FunctionExpression);
      if (valueNode == null) {
        throw this.error(`Missing value for the property 'id'`, expr);
      }
      const fnNameNode = valueNode.getChild(PlannerNodeName.FunctionName);
      if (fnNameNode == null) {
        assert(PlannerNodeName.FunctionName);
      }
      const fnName = this.getValue(fnNameNode);
      if (["tags"].indexOf(fnName) === -1) {
        this.error(`There's no such id type - '${fnName}'`, fnNameNode);
      }
      const fnArgs = valueNode
        .getChildren(PlannerNodeName.FunctionArgument)
        .map((argNode) => this.getValue(argNode));
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
    expr: SyntaxNode,
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
      const fnName = this.getValue(fnNameNode);
      const fnArgs = valueNode
        .getChildren(PlannerNodeName.FunctionArgument)
        .map((argNode) => this.getValue(argNode));
      let script: string | undefined;
      let body: string | undefined;
      let meta: { stateKeys: Set<string> } | undefined;
      let liftoscriptNode: SyntaxNode | undefined;
      if (fnName === "custom") {
        liftoscriptNode =
          valueNode.getChild(PlannerNodeName.Liftoscript) || undefined;
        script = liftoscriptNode
          ? this.getValueTrim(liftoscriptNode)
          : undefined;
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
          ? this.getValue(reuseLiftoscriptNode)
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
    fnNameNode: SyntaxNode,
    valueNode: SyntaxNode,
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
      const script = liftoscriptNode
        ? this.getValueTrim(liftoscriptNode)
        : undefined;
      const reuseLiftoscriptNode = valueNode
        .getChild(PlannerNodeName.ReuseLiftoscript)
        ?.getChild(PlannerNodeName.ReuseSection)
        ?.getChild(PlannerNodeName.ExerciseName);
      const body = reuseLiftoscriptNode
        ? this.getValue(reuseLiftoscriptNode)
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
    expr: SyntaxNode,
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
    expr: SyntaxNode,
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
      const fnName = this.getValue(fnNameNode);
      const fnArgs = valueNode
        .getChildren(PlannerNodeName.FunctionArgument)
        .map((argNode) => this.getValue(argNode));
      this.validateProgress(fnName, fnArgs, fnNameNode, valueNode);

      const type = fnName as IProgramExerciseProgressType;
      if (type === "custom") {
        const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
        const script = liftoscriptNode
          ? this.getValueTrim(liftoscriptNode)
          : undefined;
        const { state } = PlannerExerciseEvaluator.fnArgsToStateVars(
          fnArgs,
          (message) => this.error(message, fnNameNode),
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
              const [line] = this.getLineAndOffset(liftoscriptNode);
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
          ? this.getValue(reuseLiftoscriptNode)
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

  private evaluateWarmup(expr: SyntaxNode): IPlannerProgramExerciseWarmupSet[] {
    if (expr.type.name === PlannerNodeName.ExerciseProperty) {
      const none = expr.getChild(PlannerNodeName.None);
      if (none != null) {
        return [];
      }
      const setsNode = expr.getChild(PlannerNodeName.WarmupExerciseSets);
      if (setsNode != null) {
        const sets = setsNode.getChildren(PlannerNodeName.WarmupExerciseSet);
        if (sets.length > 0) {
          return sets.map((set) => this.evaluateWarmupSet(set));
        }
      }
      return [];
    } else {
      assert(PlannerNodeName.ExerciseProperty);
    }
  }

  private evaluateSuperset(expr: SyntaxNode): {
    type: "superset";
    data: IPlannerProgramExerciseSuperset;
  } {
    if (expr.type.name === PlannerNodeName.Superset) {
      const exerciseNameNode = expr.getChild(PlannerNodeName.ExerciseName);
      if (exerciseNameNode != null) {
        const name = this.getValue(exerciseNameNode);
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
    expr: SyntaxNode,
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
      const name = this.getValue(nameNode);
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

  private getReuseWeekDay(weekDayNode: SyntaxNode | null): {
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
            return parseInt(this.getValue(child), 10);
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

  private evaluateReuseNode(expr: SyntaxNode): {
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
      const name = this.getValue(nameNode);
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
    expr: SyntaxNode,
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

  public static extractNameParts = memoize(
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

  private addDescription(value: string): void {
    value = value.replace(/^\/\//, "");
    if (this.latestDescriptions.length === 0) {
      this.latestDescriptions.push([]);
    }
    this.latestDescriptions[this.latestDescriptions.length - 1].push(value);
  }

  private getOrder(expr: SyntaxNode): number {
    if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const repeatNode = expr.getChild(PlannerNodeName.Repeat);
      if (repeatNode == null) {
        return 0;
      }
      const children = getChildren(repeatNode);
      for (const childNode of children) {
        if (childNode.type.name === PlannerNodeName.Rep) {
          return parseInt(this.getValue(childNode), 10);
        }
      }
      return 0;
    } else {
      assert(PlannerNodeName.ExerciseExpression);
    }
  }

  private getRepeat(expr: SyntaxNode): number[] {
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
            parseInt(this.getValue(n), 10),
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

  private getRepeatRanges(numbers: number[]): string[] {
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

  private getIsNotUsed(expr: SyntaxNode): boolean {
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
          const name = nameNode ? this.getValueTrim(nameNode) : undefined;
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

  private evaluateExercise(expr: SyntaxNode): void {
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
      const weekName = this.getValueTrim(expr).replace(/^#+/, "").trim();
      const [line] = this.getLineAndOffset(expr);
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
      const dayName = this.getValueTrim(expr).replace(/^#+/, "").trim();
      const [line] = this.getLineAndOffset(expr);
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
      const value = this.getValueTrim(expr).trim();
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

      const fullName = this.getValue(nameNode);

      let { label, name, equipment } =
        PlannerExerciseEvaluator.extractNameParts(
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
      const text = this.getValueTrim(expr).trim();
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
      const [line] = this.getLineAndOffset(expr);
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
          return node != null && this.getValueTrim(node) === "progress"
            ? node
            : undefined;
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
          return node != null && this.getValueTrim(node) === "update"
            ? node
            : undefined;
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
          return node != null && this.getValueTrim(node) === "id"
            ? node
            : undefined;
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
        id: UidFactory_generateUid(8),
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

  private evaluateProgram(expr: SyntaxNode): IPlannerExerciseEvaluatorWeek[] {
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

  public evaluate(programNode: SyntaxNode): IPlannerEvalFullResult {
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

  public hasWeightInUnit(programNode: SyntaxNode, unit: IUnit): boolean {
    const cursor = programNode.cursor();
    do {
      const weight = this.getWeight(cursor.node);
      if (weight != null) {
        if (weight.unit === unit) {
          return true;
        }
      }
    } while (cursor.next());
    return false;
  }

  public switchWeightsToUnit(
    programNode: SyntaxNode,
    settings: ISettings,
  ): string {
    const cursor = programNode.cursor();
    let script = this.script;
    let shift = 0;
    do {
      if (cursor.node.type.name === PlannerNodeName.Weight) {
        const weight = this.getWeight(cursor.node);
        if (weight != null) {
          if (weight.unit !== settings.units) {
            const from = cursor.node.from;
            const to = cursor.node.to;
            const oldWeightStr = Weight_print(weight);
            const newWeightStr = Weight_print(
              Weight_smartConvert(weight, settings.units),
            );
            script =
              script.substring(0, from + shift) +
              newWeightStr +
              script.substring(to + shift);
            shift = shift + newWeightStr.length - oldWeightStr.length;
          }
        }
      } else if (cursor.node.type.name === PlannerNodeName.Liftoscript) {
        const oldLiftoscript = this.getValueTrim(cursor.node);
        const liftoscriptEvaluator = new ScriptRunner(
          oldLiftoscript,
          {},
          {},
          Progress_createEmptyScriptBindings(
            { day: 1, week: 1, dayInWeek: 1 },
            settings,
          ),
          Progress_createScriptFunctions(settings),
          settings.units,
          { unit: settings.units, prints: [] },
          "planner",
        );
        const newLiftoscript = liftoscriptEvaluator.switchWeightsToUnit(
          settings.units,
        );
        script =
          script.substring(0, cursor.node.from + shift) +
          newLiftoscript +
          script.substring(cursor.node.to + shift);
        shift = shift + newLiftoscript.length - oldLiftoscript.length;
      }
    } while (cursor.next());
    return script;
  }

  public changeExerciseName(
    node: SyntaxNode,
    from: string,
    to: string,
  ): string {
    const cursor = node.cursor();
    let script = this.script;
    let shift = 0;
    do {
      if (cursor.node.type.name === PlannerNodeName.ExerciseName) {
        const name = this.getValue(cursor.node);
        if (name === from) {
          const fromNode = cursor.node.from;
          const toNode = cursor.node.to;
          script =
            script.substring(0, fromNode + shift) +
            to +
            script.substring(toNode + shift);
          shift = shift + to.length - name.length;
        }
      }
    } while (cursor.next());
    return script;
  }

  public static changeWeightsToCompletedWeights(oldScript: string): string {
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

  public topLineMap(programNode: SyntaxNode): IPlannerTopLineItem[] {
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
        const fullName = this.getValue(nameNode);
        const key = PlannerKey_fromFullName(fullName, this.settings.exercises);
        const repeat = this.getRepeat(child);
        const repeatRanges = this.getRepeatRanges(repeat);
        const order = this.getOrder(child);
        const isUsed = !this.getIsNotUsed(child);
        const sectionsNode = child.getChildren(PlannerNodeName.ExerciseSection);
        const sections = sectionsNode
          .map((section) => this.getValueTrim(section).trim())
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
              ? this.getValue(propertyNameNode)
              : undefined;
            if (propertyName === "progress") {
              const none = properties.getChild(PlannerNodeName.None);
              return none != null;
            }
            return false;
          })
          .map((section) => this.getValueTrim(section).trim())
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
        const description = this.getValueTrim(child).trim();
        if (lastDescriptions.length === 0) {
          lastDescriptions.push([]);
        }
        lastDescriptions[lastDescriptions.length - 1].push(description);
        result.push({ type: "description", value: description });
      } else if (child.type.name === PlannerNodeName.TripleLineComment) {
        result.push({
          type: "comment",
          value: this.getValueTrim(child).trim(),
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
      !PlannerExerciseEvaluator.isEqualProgress(
        progressProp,
        existingProgress.property,
      )
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
      !PlannerExerciseEvaluator.isEqualUpdate(
        updateProp,
        existingUpdate.property,
      )
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
  const tree = plannerExerciseParser.parse(day.exerciseText);
  const evaluator = new PlannerExerciseEvaluator(
    day.exerciseText,
    settings,
    "perday",
    dayData,
  );
  const result = evaluator.evaluate(tree.topNode);
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
      reuse.week ?? weekIndex + 1 ?? 1,
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
            state: ObjectUtils_clone(originalProgress.state),
            stateMetadata: ObjectUtils_clone(originalProgress.stateMetadata),
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
  const evaluatedSetVariations = PlannerProgramExercise_evaluateSetVariations(
    exercise,
    setVariations,
  );
  exercise.evaluatedSetVariations = evaluatedSetVariations;
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
      exercise.descriptions = ObjectUtils_clone(lastWeekExercise.descriptions);
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
        values: [...ObjectUtils_clone(descriptions.values)],
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
        if (
          state[key] != null &&
          Weight_type(value) !== Weight_type(state[stateKey])
        ) {
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
          const [line] = PlannerExerciseEvaluator.getLineAndOffset(
            script,
            liftoscriptNode,
          );
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
    plannerExercise.name,
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
        value = MathUtils_roundTo0005(Weight_rpeMultiplier(ws.reps, 4));
      }
      sets.push({
        reps: ws.reps,
        value,
        threshold: Weight_build(0, settings.units),
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
              ? Weight_buildPct(aSet.percentage)
              : undefined,
          timer: aSet.timer,
          rpe: aSet.rpe,
          logRpe: !!aSet.logRpe,
          label: aSet.label,
          isAmrap: !!aSet.repRange.isAmrap,
          isQuickAddSet: !!aSet.repRange.isQuickAddSet,
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
    const set: IPlannerProgramExerciseSet = ObjectUtils_clone(aSet);
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

function PlannerProgramExercise_currentEvaluatedSetVariation(
  exercise: IPlannerProgramExercise,
): IPlannerProgramExerciseEvaluatedSetVariation {
  const index =
    PlannerProgramExercise_currentEvaluatedSetVariationIndex(exercise);
  return exercise.evaluatedSetVariations[index];
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
      !Weight_eq(originalState[key], value) ||
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
      const increment = args[0]
        ? Weight_parsePct(args[0])
        : Weight_build(0, "lb");
      const decrement = args[3]
        ? Weight_parsePct(args[3])
        : Weight_build(0, "lb");
      const state: IProgramState = {
        increment: increment ?? Weight_build(0, "lb"),
        successes: args[1] ? parseInt(args[1], 10) : 1,
        successCounter: args[2] ? parseInt(args[2], 10) : 0,
        decrement: decrement ?? Weight_build(0, "lb"),
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
      const increment = args[0]
        ? Weight_parsePct(args[0])
        : Weight_build(0, "lb");
      const state: IProgramState = {
        increment: increment ?? Weight_build(0, "lb"),
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
      const increment = args[1]
        ? Weight_parsePct(args[1])
        : Weight_build(0, "lb");
      const state: IProgramState = {
        reps: args[0] ? parseInt(args[0], 10) : 0,
        increment: increment ?? Weight_build(0, "lb"),
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
      const { state, stateMetadata } =
        PlannerExerciseEvaluator.fnArgsToStateVars(args, (message) => {
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
  const { name, equipment } = PlannerExerciseEvaluator.extractNameParts(
    fullName,
    settings.exercises,
  );
  const shortName = `${name}${equipment ? `, ${equipmentName(equipment)}` : ""}`;
  return shortName;
}

//#endregion

//#region Program Set

function ProgramSet_isEligibleForInferredWeight(
  set: IPlannerProgramExerciseEvaluatedSet,
): boolean {
  return set.weight == null && set.maxrep != null && set.rpe != null;
}

function ProgramSet_getEvaluatedWeight(
  programSet: IPlannerProgramExerciseEvaluatedSet,
  exerciseType: IExerciseType,
  settings: ISettings,
): IWeight | undefined {
  const originalWeight = programSet.weight;
  const unit = Equipment_getUnitOrDefaultForExerciseType(
    settings,
    exerciseType,
  );
  const evaluatedWeight = originalWeight
    ? Weight_evaluateWeight(originalWeight, exerciseType, settings)
    : ProgramSet_isEligibleForInferredWeight(programSet) &&
        programSet.maxrep != null &&
        programSet.rpe != null
      ? Weight_evaluateWeight(
          Weight_rpePct(programSet.maxrep, programSet.rpe),
          exerciseType,
          settings,
        )
      : undefined;
  return evaluatedWeight
    ? Weight_roundConvertTo(evaluatedWeight, settings, unit, exerciseType)
    : undefined;
}
//#endregion

//#region Exercise
const allExercisesList: Record<IExerciseId, IExercise> = {
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

function equipmentName(
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

type IExerciseKind = "core" | "pull" | "push" | "legs" | "upper" | "lower";

type IExercise = {
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

function warmupValues(
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

function Exercise_fullName(
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

function Exercise_findById(
  id: IExerciseId,
  customExercises: IAllCustomExercises,
): IExercise | undefined {
  return maybeGetExercise(id, customExercises);
}

function Exercise_findIdByName(
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

function Exercise_get(
  type: IExerciseType,
  customExercises: IAllCustomExercises,
): IExercise {
  const exercise = getExercise(type.id, customExercises);
  return { ...exercise, equipment: type.equipment };
}

function Exercise_onerm(type: IExerciseType, settings: ISettings): IWeight {
  const rm = settings.exerciseData[Exercise_toKey(type)]?.rm1;
  if (rm) {
    return Weight_convertTo(rm, settings.units);
  }
  const exercise = Exercise_get(type, settings.exercises);
  return settings.units === "kg"
    ? exercise.startingWeightKg
    : exercise.startingWeightLb;
}

function Exercise_defaultRounding(
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

function Exercise_findByNameEquipment(
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

function Exercise_findByNameAndEquipment(
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

function Exercise_getIsUnilateral(
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

function Exercise_findByName(
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

function Exercise_getWarmupSets(
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

function Exercise_toKey(type: IExerciseType): string {
  return `${type.id}${type.equipment ? `_${type.equipment}` : ""}`;
}

//#endregion

//#region Progress

interface IScriptBindings {
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

interface IScriptFnContext {
  prints: (number | IWeight | IPercentage)[][];
  unit: IUnit;
  exerciseType?: IExerciseType;
}

interface IScriptFunctions {
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

function floor(num: number): number;
function floor(num: IWeight): IWeight;
function floor(num: IWeight | number): IWeight | number {
  if (num == null) {
    return 0;
  }
  return typeof num === "number"
    ? Math.floor(num)
    : Weight_build(Math.floor(num.value), num.unit);
}

function ceil(num: number): number;
function ceil(num: IWeight): IWeight;
function ceil(num: IWeight | number): IWeight | number {
  if (num == null) {
    return 0;
  }
  return typeof num === "number"
    ? Math.ceil(num)
    : Weight_build(Math.ceil(num.value), num.unit);
}

function round(num: number): number;
function round(num: IWeight): IWeight;
function round(num: IWeight | number): IWeight | number {
  if (num == null) {
    return 0;
  }
  return typeof num === "number"
    ? Math.round(num)
    : Weight_build(Math.round(num.value), num.unit);
}

type IScriptArg = number | IWeight | IPercentage;

function isScriptValue(v: unknown): v is IScriptArg {
  return typeof v === "number" || Weight_is(v) || Weight_isPct(v);
}

function flattenScriptArgs(args: unknown[]): IScriptArg[] {
  const result: IScriptArg[] = [];
  for (const arg of args) {
    if (Array.isArray(arg)) {
      for (const item of arg) {
        if (isScriptValue(item)) {
          result.push(item);
        }
      }
    } else if (isScriptValue(arg)) {
      result.push(arg);
    }
  }
  return result;
}

function sum(...args: unknown[]): IWeight | IPercentage | number {
  const flat = flattenScriptArgs(args);
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<IScriptArg>(
    (acc, a) => Weight_op(undefined, acc, a, (x, y) => x + y),
    0,
  );
}

function min(...args: unknown[]): IWeight | IPercentage | number {
  const flat = flattenScriptArgs(args);
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<IScriptArg>(
    (acc, a) => (Weight_lt(a, acc) ? a : acc),
    flat[0],
  );
}

function max(...args: unknown[]): IWeight | IPercentage | number {
  const flat = flattenScriptArgs(args);
  if (flat.length === 0) {
    return 0;
  }
  return flat.reduce<IScriptArg>(
    (acc, a) => (Weight_lt(acc, a) ? a : acc),
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
      !Weight_eq(aVal, 0) &&
      Weight_lt(aVal, bVal)
    ) {
      return false;
    }
  }
  return true;
}

function Progress_createEmptyScriptBindings(
  dayData: IDayData,
  settings: ISettings,
  exercise?: IExerciseType,
): IScriptBindings {
  const rm1 = exercise
    ? Exercise_onerm(exercise, settings)
    : Weight_build(0, "lb");
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
    bodyweight: Weight_build(0, settings.units),
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
      set.originalWeight ?? Weight_build(0, settings.units),
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
  bindings.bodyweight = bodyweight ?? Weight_build(0, settings.units);
  return bindings;
}

function Progress_createScriptFunctions(settings: ISettings): IScriptFunctions {
  function increment(vals: number, context: IScriptFnContext): number;
  function increment(vals: IWeight, context: IScriptFnContext): IWeight;
  function increment(vals: IPercentage, context: IScriptFnContext): IPercentage;
  function increment(
    vals: IWeight | IPercentage | number,
    context: IScriptFnContext,
  ): IWeight | IPercentage | number {
    if (typeof vals === "number") {
      const weight = Weight_build(vals, context.unit);
      return Weight_increment(weight, settings, context.exerciseType);
    } else if (Weight_isPct(vals)) {
      return Weight_buildPct(vals.value + 1);
    } else {
      return Weight_increment(vals, settings, context.exerciseType);
    }
  }

  function decrement(vals: number, context: IScriptFnContext): number;
  function decrement(vals: IWeight, context: IScriptFnContext): IWeight;
  function decrement(vals: IPercentage, context: IScriptFnContext): IPercentage;
  function decrement(
    vals: IWeight | IPercentage | number,
    context: IScriptFnContext,
  ): IWeight | IPercentage | number {
    if (typeof vals === "number") {
      const weight = Weight_build(vals, context.unit);
      return Weight_decrement(weight, settings, context.exerciseType);
    } else if (Weight_isPct(vals)) {
      return Weight_buildPct(vals.value - 1);
    } else {
      return Weight_decrement(vals, settings, context.exerciseType);
    }
  }

  const fns: IScriptFunctions = {
    roundWeight: (num, context) => {
      if (!Weight_is(num)) {
        num = Weight_build(num, settings.units);
      }
      const unit = Equipment_getUnitForExerciseType(
        settings,
        context?.exerciseType,
      );
      return Weight_round(
        num,
        settings,
        unit ?? settings.units,
        context?.exerciseType,
      );
    },
    roundConvertWeight: (num, context) => {
      if (!Weight_is(num)) {
        num = Weight_build(num, settings.units);
      }
      const unit = Equipment_getUnitForExerciseType(
        settings,
        context?.exerciseType,
      );
      return Weight_roundConvertTo(
        num,
        settings,
        unit ?? settings.units,
        context?.exerciseType,
      );
    },
    calculateTrainingMax: (weight, reps, context) => {
      if (!Weight_is(weight)) {
        weight = Weight_build(weight, settings.units);
      }
      return Weight_getTrainingMax(weight, reps || 0, settings);
    },
    calculate1RM: (weight, reps, context) => {
      if (!Weight_is(weight)) {
        weight = Weight_build(weight, settings.units);
      }
      return Weight_getOneRepMax(weight, reps);
    },
    rpeMultiplier: (repsRaw, rpeRawOrContext, context) => {
      const reps = Weight_is(repsRaw)
        ? repsRaw.value
        : typeof repsRaw === "number"
          ? repsRaw
          : 1;
      const rpe =
        typeof rpeRawOrContext === "number" && context != null
          ? Weight_is(rpeRawOrContext)
            ? rpeRawOrContext.value
            : typeof rpeRawOrContext === "number"
              ? rpeRawOrContext
              : 10
          : 10;
      return Weight_rpeMultiplier(reps, rpe);
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
      const args = [...fnArgs.flat()] as (number | IWeight | IPercentage)[];
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
      weight: IWeight | IPercentage | number,
      timer: number,
      rpe: number,
      logRpe: number,
      context: IScriptFnContext,
      bindings: IScriptBindings,
    ): number {
      for (let i = 0; i < bindings.numberOfSets; i++) {
        if (i >= from - 1 && i < to) {
          const weightValue = Weight_convertToWeight(
            bindings.rm1,
            weight,
            context.unit,
          );
          bindings.minReps[i] = reps !== minReps ? minReps : undefined;
          bindings.reps[i] = reps;
          bindings.originalWeights[i] = weightValue;
          bindings.weights[i] = Weight_round(
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
  const state = ObjectUtils_clone(
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
    Stats_getCurrentMovingAverageBodyweight(stats, settings),
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
      ObjectUtils_clone(otherStates),
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
  const entry = ObjectUtils_clone(oldEntry);
  const lastCompletedIndex =
    CollectionUtils_findIndexReverse(bindings.completedReps, (r) => r != null) +
    1;
  entry.sets = entry.sets.slice(
    0,
    Math.max(lastCompletedIndex, bindings.numberOfSets, 0),
  );
  for (const key of keys) {
    for (let i = 0; i < bindings[key].length; i += 1) {
      if (entry.sets[i] == null) {
        entry.sets[i] = {
          vtype: "set",
          id: UidFactory_generateUid(6),
          index: i,
          isUnilateral: Exercise_getIsUnilateral(entry.exercise, settings),
          reps: 0,
          weight: Weight_build(0, "lb"),
          originalWeight: Weight_build(0, "lb"),
          askWeight: false,
          isCompleted: false,
        };
      }
      if (!entry.sets[i].isCompleted) {
        if (key === "RPE") {
          const value = bindings.RPE[i];
          entry.sets[i].rpe = value !== 0 ? value : undefined;
        } else if (key === "reps") {
          const value = bindings.reps[i];
          entry.sets[i].reps = value;
        } else if (key === "minReps") {
          const value = bindings.minReps[i];
          entry.sets[i].minReps = value !== 0 ? value : undefined;
        } else if (key === "weights") {
          const value = bindings.weights[i];
          entry.sets[i].weight = value;
        } else if (key === "originalWeights") {
          const value = bindings.originalWeights[i];
          entry.sets[i].originalWeight = value;
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
  return CollectionUtils_compact([label, Exercise_toKey(exerciseType)]).join(
    "_",
  );
}

//#endregion

//#region Weight
const prebuiltWeights: Partial<Record<string, IWeight>> = {};

function Weight_rpePct(reps: number, rpe: number): IPercentage {
  return Weight_buildPct(
    MathUtils_roundTo005(Weight_rpeMultiplier(reps, rpe) * 100),
  );
}

function Weight_evaluateWeight(
  weight: IWeight | IPercentage,
  exerciseType: IExerciseType,
  settings: ISettings,
): IWeight {
  if (Weight_is(weight)) {
    return weight;
  } else if (Weight_isPct(weight)) {
    const exercise = Exercise_get(exerciseType, settings.exercises);
    const onerm = Exercise_onerm(exercise, settings);
    return Weight_multiply(onerm, weight.value / 100);
  } else {
    const unit = Equipment_getUnitOrDefaultForExerciseType(
      settings,
      exerciseType,
    );
    return Weight_build(0, unit);
  }
}

function Weight_smartConvert(weight: IWeight, toUnit: IUnit): IWeight {
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

function Weight_print(weight: IWeight | IPercentage | number): string {
  if (typeof weight === "number") {
    return `${n(weight)}`;
  } else {
    return `${n(weight.value)}${weight.unit}`;
  }
}

function Weight_printNull(
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

function Weight_parsePct(str?: string): IPercentage | IWeight | undefined {
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

function Weight_parse(str: string): IWeight | undefined {
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

function Weight_buildPct(value: number): IPercentage {
  return { value, unit: "%" };
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

function Weight_is(object: unknown): object is IWeight {
  const objWeight = object as IWeight;
  return (
    objWeight &&
    typeof objWeight === "object" &&
    "unit" in objWeight &&
    "value" in objWeight &&
    (objWeight.unit === "kg" || objWeight.unit === "lb")
  );
}

function Weight_isPct(object: unknown): object is IPercentage {
  const objWeight = object as IPercentage;
  return (
    objWeight &&
    typeof objWeight === "object" &&
    "unit" in objWeight &&
    "value" in objWeight &&
    objWeight.unit === "%"
  );
}

function Weight_round(
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

function Weight_increment(
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

function Weight_decrement(
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

function Weight_getOneRepMax(
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

function Weight_getTrainingMax(
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

function Weight_roundTo005(weight: IWeight): IWeight {
  return Weight_build(MathUtils_roundTo005(weight.value), weight.unit);
}

function Weight_roundTo000005(weight: IWeight): IWeight {
  return Weight_build(MathUtils_roundTo000005(weight.value), weight.unit);
}

function Weight_calculatePlates(
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

function Weight_abs(weight: IWeight): IWeight {
  return Weight_build(Math.abs(weight.value), weight.unit);
}

function Weight_invert(weight: IWeight): IWeight {
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

function Weight_add(weight: IWeight, value: IWeight | number): IWeight {
  return Weight_operation(weight, value, (a, b) => a + b);
}

function Weight_subtract(weight: IWeight, value: IWeight | number): IWeight {
  return Weight_operation(weight, value, (a, b) => a - b);
}

function Weight_multiply(weight: IWeight, value: IWeight | number): IWeight {
  return Weight_operation(weight, value, (a, b) => a * b);
}

function Weight_divide(weight: IWeight, value: IWeight | number): IWeight {
  return Weight_operation(weight, value, (a, b) => a / b);
}

function Weight_gt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a > b);
}

function Weight_lt(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a < b);
}

function Weight_lte(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a <= b);
}

function Weight_eqNull(
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

function Weight_eq(
  weight: IWeight | number | IPercentage,
  value: IWeight | number | IPercentage,
): boolean {
  return comparison(weight, value, (a, b) => a === b);
}

function Weight_roundConvertTo(
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

function Weight_type(
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

function Weight_convertTo(weight: IWeight, unit: IUnit): IWeight;

function Weight_convertTo(
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

function Weight_compare(a: IWeight, b: IWeight): number {
  return a.value - Weight_convertTo(b, a.unit).value;
}

function Weight_compareReverse(a: IWeight, b: IWeight): number {
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

function Weight_applyOp(
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

function Weight_op(
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

function Weight_operation(
  weight: IWeight,
  value: IWeight | number,
  o: (a: number, b: number) => number,
): IWeight;
function Weight_operation(
  weight: IWeight | number,
  value: IWeight,
  o: (a: number, b: number) => number,
): IWeight;
function Weight_operation(
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

function Weight_convertToWeight(
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

function Weight_rpeMultiplier(reps: number, rpe: number): number {
  if (reps === 1 && rpe === 10) {
    return 1;
  }
  reps = Math.max(Math.min(reps, 24), 1);
  rpe = Math.max(Math.min(rpe, 10), 1);

  const x = 10.0 - rpe + (reps - 1);
  if (x >= 16) {
    return 0.5;
  }

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

const Weight_zero: IWeight = { value: 0, unit: "lb" } as const;
//#endregion

//#region PP
function PP_iterate2(
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

function PP_iterate(
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
  weight?: IWeight | IPercentage;
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

class ProgramToPlanner {
  constructor(
    private readonly program: IEvaluatedProgram,
    private readonly settings: ISettings,
  ) {}

  private getCurrentDescriptionExercise(
    key: string,
    weekIndex: number,
    dayInWeekIndex: number,
  ): IPlannerProgramExercise | undefined {
    return this.program.weeks[weekIndex]?.days[dayInWeekIndex]?.exercises?.find(
      (e) => e.key === key,
    );
  }

  private getCurrentDescriptionIndex(
    key: string,
    weekIndex: number,
    dayInWeekIndex: number,
  ): number {
    const exercise = this.getCurrentDescriptionExercise(
      key,
      weekIndex,
      dayInWeekIndex,
    );
    const descriptions = exercise?.descriptions.values || [];
    const index = descriptions.findIndex((s) => s.isCurrent);
    return index === -1 ? 0 : index;
  }

  private shouldReuseSets(programExercise: IPlannerProgramExercise): boolean {
    return !!programExercise.reuse;
  }

  private getDereuseDecisions(
    programExercise: IPlannerProgramExercise,
  ): IDereuseDecision[] {
    const dereuseDecisions: Set<IDereuseDecision> = new Set();
    const reuseExercise = programExercise.reuse?.exercise;
    if (!reuseExercise) {
      return Array.from(dereuseDecisions);
    }
    const globals = this.getGlobals(programExercise);
    const reusedGlobals = this.getGlobals(reuseExercise);
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
          : programExercise.progress.script !==
            reuseExercise.progress.script) ||
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
      for (
        let i = 0;
        i < programExercise.evaluatedSetVariations.length;
        i += 1
      ) {
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
              ? !Weight_eqNull(programSet.weight, reuseSet.weight) ||
                programSet.askWeight !== reuseSet.askWeight
              : !Weight_eq(
                  globals.weight || Weight_zero,
                  reusedGlobals.weight || Weight_zero,
                ) || globals.askWeight !== reusedGlobals.askWeight
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

  private reorderGroupedTopLine(
    groupedTopLine: IPlannerTopLineItem[][][][],
    reorders: IPlannerToProgramConvertOpts["reorder"],
  ): IPlannerTopLineItem[][][][] {
    if (!reorders) {
      return groupedTopLine;
    }
    for (const reorder of reorders) {
      const groupedDay =
        groupedTopLine[reorder.dayData.week - 1]?.[
          reorder.dayData.dayInWeek - 1
        ];
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

  private addGroupedTopLine(
    groupedTopLine: IPlannerTopLineItem[][][][],
    adds: IPlannerToProgramConvertOpts["add"],
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
            value: PlannerKey_fromFullName(
              add.fullName,
              this.settings.exercises,
            ),
          },
        ]);
      }
    }
    return groupedTopLine;
  }

  private getRenamedValue(
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

  private addExerciseDescriptions(
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
      const currentIndex = this.getCurrentDescriptionIndex(
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
      const currentWeekReusedExercisesCount = this.program.weeks[
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

  public convertToPlanner(
    opts: IPlannerToProgramConvertOpts = {},
  ): IPlannerProgram {
    const plannerWeeks: IPlannerProgramWeek[] = [];
    const plannerProgram = this.program.planner;
    if (this.program.errors.length > 0) {
      const error = this.program.errors[0];
      console.log(PlannerProgram_generateFullText(plannerProgram.weeks));

      throw error.error;
    }
    const topLineMap = PlannerProgram_topLineItems(
      plannerProgram,
      this.settings,
    );
    let groupedTopLineMap = PlannerProgram_groupedTopLines(topLineMap);
    groupedTopLineMap = opts.reorder
      ? this.reorderGroupedTopLine(groupedTopLineMap, opts.reorder)
      : groupedTopLineMap;
    groupedTopLineMap = opts.add
      ? this.addGroupedTopLine(groupedTopLineMap, opts.add)
      : groupedTopLineMap;
    let dayIndex = 0;
    const addedProgressMap: Record<string, boolean> = {};
    const addedUpdateMap: Record<string, boolean> = {};
    const addedWarmupsMap: Record<string, boolean> = {};
    const addedIdMap: Record<string, boolean> = {};

    for (
      let weekIndex = 0;
      weekIndex < this.program.weeks.length;
      weekIndex += 1
    ) {
      const week = this.program.weeks[weekIndex];
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
                    key = this.getRenamedValue(
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
                  const exercise = this.getCurrentDescriptionExercise(
                    key,
                    weekIndex,
                    dayInWeekIndex,
                  );
                  const result = this.addExerciseDescriptions(
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
                    const currentIndex = this.getCurrentDescriptionIndex(
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
                const value = this.getRenamedValue(
                  opts,
                  line,
                  weekIndex,
                  dayInWeekIndex,
                );
                const evalExercise = Program_getProgramExercise(
                  dayIndex + 1,
                  this.program,
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
                  const result = this.addExerciseDescriptions(
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

                let plannerExercise = "";
                plannerExercise += this.getExerciseName(evalExercise);
                plannerExercise += " / ";
                if (evalExercise.notused) {
                  plannerExercise += "used: none / ";
                }
                const variations = evalExercise.evaluatedSetVariations;
                const globals = this.getGlobals(evalExercise);

                const shouldReuseSets = this.shouldReuseSets(evalExercise);
                const dereuseDecisions = shouldReuseSets
                  ? this.getDereuseDecisions(evalExercise)
                  : [];
                if (shouldReuseSets) {
                  plannerExercise += this.reuseToStr(evalExercise);

                  if (dereuseDecisions.includes("sets")) {
                    plannerExercise +=
                      ` / ` +
                      variations
                        .map((v, i) => {
                          return this.variationToString(
                            v,
                            globals,
                            i,
                            evalExercise,
                          );
                        })
                        .join(" / ");
                  }

                  const overriddenGlobals: string[] = [];
                  if (
                    dereuseDecisions.includes("weight") &&
                    globals.weight != null
                  ) {
                    overriddenGlobals.push(
                      `${this.weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
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
                        this.variationToString(v, globals, i, evalExercise),
                      )
                      .join(" / ");
                  }

                  const globalsStr: string[] = [];
                  if (globals.weight != null) {
                    globalsStr.push(
                      `${this.weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
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
                  const warmupSets = this.getWarmupSets(evalExercise);
                  if (warmupSets != null) {
                    plannerExercise += ` / warmup: ${warmupSets}`;
                    addedWarmupsMap[key] = true;
                  }
                }

                if (!addedIdMap[key] && (evalExercise.tags || []).length > 0) {
                  plannerExercise += this.getId(evalExercise);
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
                    const updateStr = ProgramToPlanner.getUpdate(
                      evalExercise,
                      this.settings,
                    );
                    if (updateStr) {
                      plannerExercise += ` / ${updateStr}`;
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
                    const progressStr = ProgramToPlanner.getProgress(
                      evalExercise,
                      this.settings,
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
      vtype: "planner",
      name: this.program.name,
      weeks: plannerWeeks,
    };
    const repeatingExercises = new Set<string>();
    PP_iterate2(this.program.weeks, (exercise) => {
      if (exercise.repeat != null && exercise.repeat.length > 0) {
        const key = PlannerKey_fromPlannerExercise(exercise, this.settings);
        repeatingExercises.add(key);
      }
    });
    const newPlanner = PlannerProgram_compact(
      this.program.planner,
      result,
      this.settings,
      repeatingExercises,
    );

    return newPlanner;
  }

  private getExerciseName(programExercise: IPlannerProgramExercise): string {
    if (programExercise.exerciseType) {
      const exercise = Exercise_get(
        programExercise.exerciseType,
        this.settings.exercises,
      );
      let name = Exercise_fullName(
        exercise,
        this.settings,
        programExercise.label,
      );
      if (programExercise.order > 0) {
        name = `${name}[${programExercise.order}]`;
      }
      return name;
    } else {
      return programExercise.fullName;
    }
  }

  private reuseToStr(programExercise: IPlannerProgramExercise): string {
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
      const exercise = Exercise_get(
        reuseExercise.exerciseType,
        this.settings.exercises,
      );
      const reuseStr = Exercise_fullName(
        exercise,
        this.settings,
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

  public static getUpdate(
    programExercise: IPlannerProgramExercise,
    settings: ISettings,
    hideScript?: boolean,
  ): string {
    const update = programExercise.update;
    if (!update) {
      return "";
    }
    if (update.reuse) {
      if (update.reuse.exercise?.exerciseType) {
        const exercise = Exercise_get(
          update.reuse.exercise.exerciseType,
          settings.exercises,
        );
        const fullName = Exercise_fullName(
          exercise,
          settings,
          update.reuse.exercise.label,
        );
        return `update: custom() { ...${fullName} }`;
      } else {
        return ` / update: custom() { ...${update.reuse.exercise?.fullName || update.reuse.fullName} }`;
      }
    } else {
      return `update: custom() ${hideScript ? "{~ ... ~}" : update.script}`;
    }
  }

  private getId(programExercise: IPlannerProgramExercise): string {
    return ` / id: tags(${(programExercise.tags || []).join(", ")})`;
  }

  public static getProgress(
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
          return `${k}${stateMetadata[k]?.userPrompted ? "+" : ""}: ${Weight_print(v)}`;
        })
        .join(", ")})`;
    } else if (progress.type === "lp") {
      const increment = state.increment as IWeight | IPercentage;
      const successes = state.successes as number;
      const successCounter = state.successCounter as number;
      const decrement = state.decrement as IWeight | IPercentage;
      const failures = state.failures as number;
      const failureCounter = state.failureCounter as number;
      const args: string[] = [];
      args.push(Weight_print(increment));
      if (successes > 1 || decrement.value > 0) {
        args.push(`${successes}`);
      }
      if (successes > 1 || decrement.value > 0) {
        args.push(`${successCounter}`);
      }
      if (decrement.value > 0) {
        args.push(Weight_print(decrement));
      }
      if (failures > 1) {
        args.push(`${failures}`);
      }
      if (failures > 1) {
        args.push(`${failureCounter}`);
      }
      progressStr += `(${args.join(", ")})`;
    } else if (progress.type === "dp") {
      const increment = state.increment as IWeight | IPercentage;
      const minReps = state.minReps as number;
      const maxReps = state.maxReps as number;
      const args = [Weight_print(increment), `${minReps}`, `${maxReps}`];
      progressStr += `(${args.join(", ")})`;
    } else if (progress.type === "sum") {
      const reps = state.reps as number;
      const increment = state.increment as IWeight | IPercentage;
      const args = [`${reps}`, Weight_print(increment)];
      progressStr += `(${args.join(", ")})`;
    }
    if (progress.type === "custom") {
      if (progress.reuse) {
        if (progress.reuse.exercise?.exerciseType) {
          const exercise = Exercise_get(
            progress.reuse.exercise.exerciseType,
            settings.exercises,
          );
          const fullName = Exercise_fullName(
            exercise,
            settings,
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

  private getGlobals(
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
    const firstWeight = variations[0]?.sets[0]?.weight;
    const firstRpe = variations[0]?.sets[0]?.rpe;
    const firstLogRpe = !!variations[0]?.sets[0]?.logRpe;
    const firstAskWeight = !!variations[0]?.sets[0]?.askWeight;
    const firstTimer = variations[0]?.sets[0]?.timer;
    return {
      weight:
        firstWeight != null &&
        variations.every((v) =>
          v.sets.every(
            (s) =>
              Weight_eqNull(s.weight, firstWeight) &&
              !!s.askWeight === firstAskWeight,
          ),
        )
          ? firstWeight
          : undefined,
      askWeight: variations.every((v) =>
        v.sets.every(
          (s) => Weight_eqNull(s.weight, firstWeight) && !!s.askWeight,
        ),
      ),
      rpe:
        firstRpe != null &&
        variations.every((v) =>
          v.sets.every((s) => s.rpe === firstRpe && !!s.logRpe === firstLogRpe),
        )
          ? firstRpe
          : undefined,
      logRpe: variations.every((v) =>
        v.sets.every((s) => s.rpe === firstRpe && !!s.logRpe),
      ),
      timer:
        firstTimer != null &&
        variations.every((v) => v.sets.every((s) => s.timer === firstTimer))
          ? firstTimer
          : undefined,
    };
  }

  private groupVariationSets(
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
            weight: originalSets?.weight || Weight_zero,
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
      const key = this.setToKey(set);
      if (lastKey == null || lastKey !== key) {
        groups.push([set, 0]);
      }
      groups[groups.length - 1][1] += 1;
      lastKey = key;
    }
    return groups;
  }

  private groupWarmupsSets(
    sets: IPlannerProgramExerciseWarmupSet[],
  ): [IPlannerProgramExerciseWarmupSet, number][] {
    let lastKey: string | undefined;
    const groups: [IPlannerProgramExerciseWarmupSet, number][] = [];
    for (const set of sets) {
      const key = this.warmupSetToKey(set);
      if (lastKey == null || lastKey !== key) {
        groups.push([set, 0]);
      }
      groups[groups.length - 1][1] += set.numberOfSets;
      lastKey = key;
    }
    return groups;
  }

  private getWarmupSets(
    programExercise: IPlannerProgramExercise,
  ): string | undefined {
    const warmupSets = programExercise.warmupSets;
    if (warmupSets) {
      const groups = this.groupWarmupsSets(warmupSets);
      const strs: string[] = [];
      for (const group of groups) {
        const first = group[0];
        const length = group[1];
        const weight =
          first.weight ??
          (first.percentage != null
            ? Weight_buildPct(first.percentage)
            : Weight_build(0, "lb"));
        strs.push(`${length}x${first.reps} ${Weight_print(weight)}`);
      }
      return strs.length === 0 ? "none" : strs.join(", ");
    }
    return undefined;
  }

  private weightExprToStr(weightExpr?: IWeight | IPercentage): string {
    if (weightExpr != null) {
      return Weight_print(weightExpr);
    }
    return "";
  }

  private variationToString(
    variation: IPlannerProgramExerciseEvaluatedSetVariation,
    globals: IPlannerToProgram2Globals,
    index: number,
    exercise: IPlannerProgramExercise,
  ): string {
    const groupedVariationSets = this.groupVariationSets(
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
        const weightValue = this.weightExprToStr(set.weight);
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

  private warmupSetToKey(set: IPlannerProgramExerciseWarmupSet): string {
    return `${set.reps}-${Weight_print(set.weight || set.percentage || 0)}`;
  }

  private setToKey(set: IPlannerProgramExerciseEvaluatedSet): string {
    return `${set.maxrep}-${set.minrep}-${Weight_printNull(set.weight)}-${set.isAmrap}-${set.rpe}-${set.logRpe}-${
      set.timer
    }-${set.label}-${set.askWeight}`;
  }
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

  public switchWeightsToUnit(toUnit: IUnit): string {
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
    return liftoscriptEvaluator.switchWeightsToUnit(
      liftoscriptTree.topNode,
      toUnit,
    );
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
  ): number | IWeight | IPercentage | boolean {
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
    result: number | IWeight | IPercentage | boolean,
  ): number | IWeight | IPercentage | boolean {
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
        return Weight_build(result, this.units);
      } else {
        if (result.value < 0) {
          return Weight_build(0, this.units);
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

//#region PlannerExerciseEvaluatorText
function PEET_getChildren(node: SyntaxNode): SyntaxNode[] {
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

interface IPlannerExerciseEvaluatorTextWeek {
  name: string;
  description?: string;
  days: IPlannerExerciseEvaluatorTextDay[];
}

interface IPlannerExerciseEvaluatorTextDay {
  name: string;
  description?: string;
  exercises: string[];
}

type IPlannerNonExerciseFullTextLine =
  | { type: "comment"; line: string }
  | { type: "triplelinecomment"; line: string }
  | { type: "empty"; line: string };

function fullTextLineToWeekdayDescription(
  line: IPlannerNonExerciseFullTextLine,
): string {
  switch (line.type) {
    case "comment":
      return line.line.replace(/^\s*\/\/\s*/, "").trim();
    case "triplelinecomment":
      return line.line.replace(/^\s*\/\/\/\s*/, "").trim();
    case "empty":
      return "";
  }
}

class PlannerExerciseEvaluatorText {
  private readonly script: string;
  private weeks: IPlannerExerciseEvaluatorTextWeek[] = [];
  private ongoingLines: IPlannerNonExerciseFullTextLine[] = [];

  constructor(script: string) {
    this.script = script;
  }

  private getValue(node: SyntaxNode): string {
    return this.script.slice(node.from, node.to);
  }

  private getWeekDayOngoingLines(): {
    linesToPreviousExercise: IPlannerNonExerciseFullTextLine[];
    nextLines: IPlannerNonExerciseFullTextLine[];
  } {
    const ongoingLines = [...this.ongoingLines];
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

  private getWeekDayDescriptionAndFillLastDay(): string | undefined {
    const { linesToPreviousExercise, nextLines } =
      this.getWeekDayOngoingLines();
    if (linesToPreviousExercise.length > 0) {
      const lastDay = this.getLastDay();
      if (lastDay) {
        lastDay.exercises.push(
          ...linesToPreviousExercise.map((line) => line.line),
        );
      }
    }
    const description =
      nextLines.length > 0
        ? nextLines.map(fullTextLineToWeekdayDescription).join("\n").trim()
        : undefined;
    return description;
  }

  private getLastDay(): IPlannerExerciseEvaluatorTextDay | undefined {
    const lastWeek = this.weeks[this.weeks.length - 1];
    return lastWeek?.days[lastWeek.days.length - 1];
  }

  private evaluateLine(expr: SyntaxNode): void {
    if (expr.type.name === PlannerNodeName.Week) {
      const weekName = this.getValue(expr).replace(/^#+/, "").trim();
      const description = this.getWeekDayDescriptionAndFillLastDay();
      this.weeks.push({ name: weekName, description, days: [] });
      this.ongoingLines = [];
    } else if (expr.type.name === PlannerNodeName.Day) {
      const dayName = this.getValue(expr).replace(/^#+/, "").trim();
      const description = this.getWeekDayDescriptionAndFillLastDay();
      this.weeks[this.weeks.length - 1].days.push({
        name: dayName,
        exercises: [],
        description,
      });
      this.ongoingLines = [];
    } else if (expr.type.name === PlannerNodeName.EmptyExpression) {
      this.ongoingLines.push({ type: "empty", line: this.getValue(expr) });
    } else if (expr.type.name === PlannerNodeName.LineComment) {
      this.ongoingLines.push({ type: "comment", line: this.getValue(expr) });
    } else if (expr.type.name === PlannerNodeName.TripleLineComment) {
      this.ongoingLines.push({
        type: "triplelinecomment",
        line: this.getValue(expr),
      });
    } else if (expr.type.name === PlannerNodeName.ExerciseExpression) {
      const lastWeek = this.weeks[this.weeks.length - 1];
      const lastDay = lastWeek
        ? lastWeek.days[lastWeek.days.length - 1]
        : undefined;
      const exercises = lastDay?.exercises;
      if (exercises) {
        for (const line of this.ongoingLines) {
          exercises.push(line.line);
        }
        exercises.push(this.getValue(expr));
        this.ongoingLines = [];
      }
    }
  }

  public evaluate(expr: SyntaxNode): IPlannerExerciseEvaluatorTextWeek[] {
    if (expr.type.name === PlannerNodeName.Program) {
      this.ongoingLines = [];
      this.weeks = [];
      for (const child of CollectionUtils_compact(PEET_getChildren(expr))) {
        this.evaluateLine(child);
      }
      return this.weeks;
    } else {
      throw new Error(`Unexpected node type ${expr.type.name}`);
    }
  }
}

//#endregion

//#region PlannerNodeName
enum PlannerNodeName {
  Program = "Program",
  LineComment = "LineComment",
  TripleLineComment = "TripleLineComment",
  Week = "Week",
  Day = "Day",
  ExerciseExpression = "ExerciseExpression",
  ExerciseName = "ExerciseName",
  NonSeparator = "NonSeparator",
  Repeat = "Repeat",
  Rep = "Rep",
  Int = "Int",
  RepRange = "RepRange",
  SectionSeparator = "SectionSeparator",
  ExerciseSection = "ExerciseSection",
  ExerciseProperty = "ExerciseProperty",
  ExercisePropertyName = "ExercisePropertyName",
  Keyword = "Keyword",
  FunctionExpression = "FunctionExpression",
  FunctionName = "FunctionName",
  FunctionArgument = "FunctionArgument",
  Number = "Number",
  Plus = "Plus",
  PosNumber = "PosNumber",
  Float = "Float",
  Weight = "Weight",
  Percentage = "Percentage",
  Rpe = "Rpe",
  KeyValue = "KeyValue",
  Liftoscript = "Liftoscript",
  ReuseLiftoscript = "ReuseLiftoscript",
  ReuseSection = "ReuseSection",
  WarmupExerciseSets = "WarmupExerciseSets",
  WarmupExerciseSet = "WarmupExerciseSet",
  WarmupSetPart = "WarmupSetPart",
  None = "None",
  ExerciseSets = "ExerciseSets",
  CurrentVariation = "CurrentVariation",
  ExerciseSet = "ExerciseSet",
  Timer = "Timer",
  SetPart = "SetPart",
  WeightWithPlus = "WeightWithPlus",
  PercentageWithPlus = "PercentageWithPlus",
  SetLabel = "SetLabel",
  ReuseSectionWithWeekDay = "ReuseSectionWithWeekDay",
  WeekDay = "WeekDay",
  WeekOrDay = "WeekOrDay",
  Current = "Current",
  Superset = "Superset",
  SupersetKeyword = "SupersetKeyword",
  AskWeight = "AskWeight",
  EmptyExpression = "EmptyExpression",
}

//#endregion

//#region Equipment

function Equipment_getGymByIdOrCurrent(
  settings: ISettings,
  gymId?: string,
): IGym {
  return (
    settings.gyms.find((g) => g.id === (gymId ?? settings.currentGymId)) ??
    settings.gyms[0]
  );
}

function Equipment_getCurrentGym(settings: ISettings): IGym {
  return (
    settings.gyms.find((g) => g.id === settings.currentGymId) ??
    settings.gyms[0]
  );
}

function Equipment_getEquipmentIdForExerciseType(
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

function Equipment_getEquipmentDataForExerciseType(
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

function Equipment_getUnitOrDefaultForExerciseType(
  settings: ISettings,
  exerciseType?: IExerciseType,
): IUnit {
  const equipment = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  return equipment?.unit ?? settings.units;
}

function Equipment_getUnitForExerciseType(
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

function Equipment_currentEquipment(settings: ISettings): IAllEquipment {
  const currentGym =
    settings.gyms.find((g) => g.id === settings.currentGymId) ??
    settings.gyms[0];
  return currentGym?.equipment;
}

function Equipment_smallestPlate(
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

//#endregion

//#region Set

//#endregion

//#region ________
//#endregion

//#region ________
//#endregion
