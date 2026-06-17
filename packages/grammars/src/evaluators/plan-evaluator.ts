import { memoize } from "micro-memoize";
import * as t from "io-ts";
import type { SyntaxNode, Tree } from "@lezer/common";
import { unsafeCoerce } from "fp-ts/lib/function";
import { definedOnly, CollectionUtils_sortBy } from "../utils/collection";
import { generateUid } from "@/utils/uid.ts";
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
  ObjectUtils_keys,
  ObjectUtils_values,
  ObjectUtils_filter,
  ObjectUtils_entries,
  ObjectUtils_combinedKeys,
} from "@/utils/object";
import { StringUtils_unindent } from "@/utils/string";
import type { ILiftoscriptEvaluatorUpdate } from "@/logic/types";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";
import {
  LiftoscriptEvaluator,
  LiftoscriptSyntaxError,
} from "@/evaluators/logic-evaluator.ts";
import type { IAssignmentOp } from "@/logic/types";

export function CollectionUtils_sort<T>(
  arr: T[],
  compareFn?: (a: T, b: T) => number,
): T[] {
  const arrCopy = [...arr];
  arrCopy.sort(compareFn);
  return arrCopy;
}

//#region Program

// declare let __HOST__: string;
//
// const encodedProgramHashToShortUrl: Partial<Record<string, string>> = {};

// interface IProgramIndexEntry {
//   id: string;
//   name: string;
//   author: string;
//   authorUrl: string;
//   url: string;
//   shortDescription: string;
//   description?: string;
//   isMultiweek: boolean;
//   tags: string[];
//   frequency?: number;
//   age?: string;
//   duration?: string;
//   goal?: string;
//   exercises?: IExerciseType[];
//   equipment?: string[];
//   exercisesRange?: [number, number];
//   weeksCount?: number;
//   datePublished?: string;
//   dateModified?: string;
// }

// interface IExportedProgram {
//   program: IProgram;
//   customExercises: Partial<Record<string, ICustomExercise>>;
//   version: string;
//   settings: IProgramContentSettings;
// }

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
// type IEProgram = IProgram | IEvaluatedProgram;

type IProgramMode = "planner" | "update";
// const emptyProgramId = "emptyprogram";

// function isEvaluatedProgram(program: IEProgram): program is IEvaluatedProgram {
//   return "type" in program && program.type === "evaluatedProgram";
// }

// function ev(program: IEProgram, settings: ISettings): IEvaluatedProgram {
//   if (isEvaluatedProgram(program)) {
//     return program;
//   } else {
//     return Program_evaluate(program, settings);
//   }
// }
//
// function Program_getProgram(state: IState, id?: string): IProgram | undefined {
//   if (id === emptyProgramId) {
//     return Program_createEmptyProgram();
//   } else {
//     return state.storage.programs.find((p) => p.id === id);
//   }
// }

// function Program_getFullProgram(
//   state: IState,
//   id?: string,
// ): IProgram | undefined {
//   const program = Program_getProgram(state, id);
//   if (program) {
//     return Program_fullProgram(program, state.storage.settings);
//   } else {
//     return undefined;
//   }
// }

// function Program_cleanPlannerProgram(program: IProgram): IProgram {
//   const planner = program.planner;
//   if (planner != null) {
//     const newPlanner = {
//       ...planner,
//       weeks: planner.weeks.map((w) => ({
//         ...ObjectUtils_omit(w, ["id"]),
//         days: w.days.map((d) => ({
//           ...ObjectUtils_omit(d, ["id"]),
//         })),
//       })),
//     };
//     return {
//       ...program,
//       planner: newPlanner,
//       exercises: [],
//       days: [],
//       weeks: [],
//       deletedDays: [],
//       deletedWeeks: [],
//       deletedExercises: [],
//     };
//   } else {
//     return program;
//   }
// }

// function Program_isEmpty(program?: IProgram | IEvaluatedProgram): boolean {
//   return program?.id === emptyProgramId;
// }
//
// function Program_uses1RM(program: IEvaluatedProgram): boolean {
//   const allExercises = Program_getAllProgramExercises(program);
//   return allExercises.some((e) => ProgramExercise_doesUse1RM(e));
// }
//
// function Program_usesRPE(program: IEvaluatedProgram): boolean {
//   const allExercises = Program_getAllProgramExercises(program);
//   return allExercises.some((e) => ProgramExercise_doesUseRPE(e));
// }
//
// function Program_getProgramExercisesFromExerciseType(
//   program: IEvaluatedProgram,
//   exerciseType: IExerciseType,
// ): IPlannerProgramExercise[] {
//   return Program_getAllUsedProgramExercises(program).filter((p) =>
//     Exercise_eq(p.exerciseType, exerciseType),
//   );
// }
//
// function Program_getProgramIndex(state: IState, id: string): number {
//   return state.storage.programs.findIndex((p) => p.id === id);
// }

// function Program_getCurrentProgram(storage: IStorage): IProgram | undefined {
//   return storage.programs.filter((p) => p.id === storage.currentProgramId)[0];
// }

// function Program_storageToExportedProgram(
//   storage: IStorage,
//   programId: string,
// ): IExportedProgram | undefined {
//   const program = storage.programs.find((p) => p.id === programId);
//   if (!program) {
//     return undefined;
//   }
//   const settings = storage.settings;
//   return {
//     program: Program_cleanPlannerProgram(program),
//     customExercises: settings.exercises,
//     version: storage.version,
//     settings: settings,
//   };
// }

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
      id: generateUid(6),
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

// function Program_stateValue(
//   state: IProgramState,
//   key: string,
//   value?: string,
// ): number | IWeight | IPercentage | undefined {
//   if (value == null) {
//     return undefined;
//   }
//   const numValue = parseFloat(value);
//   const oldValue = state[key];
//   if (oldValue == null) {
//     return numValue;
//   } else if (Weight_is(oldValue)) {
//     return Weight_build(numValue, oldValue.unit);
//   } else if (Weight_isPct(oldValue)) {
//     return Weight_buildPct(numValue);
//   } else {
//     return numValue;
//   }
// }

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

// function Program_getSupersetGroups(
//   evaluatedProgram: IEvaluatedProgram,
//   dayData: IShortDayData,
//   excludeExercise?: IPlannerProgramExercise,
// ): Partial<Record<string, IPlannerProgramExerciseWithType[]>> {
//   const programDay = Program_getProgramDay(
//     evaluatedProgram,
//     Program_getDayNumber(evaluatedProgram, dayData.week, dayData.dayInWeek),
//   );
//   const dayExercises = programDay
//     ? Program_getProgramDayUsedExercises(programDay)
//     : [];
//   const groups: Partial<Record<string, IPlannerProgramExerciseWithType[]>> = {};
//   for (const exercise of dayExercises) {
//     if (exercise.superset != null) {
//       if (!groups[exercise.superset.name]) {
//         groups[exercise.superset.name] = [];
//       }
//       if (exercise.key !== excludeExercise?.key) {
//         groups[exercise.superset.name]!.push(exercise);
//       }
//     }
//   }
//   return groups;
// }
//
// function Program_getSupersetExercises(
//   evalutedProgram: IEvaluatedProgram,
//   plannerExercise: IPlannerProgramExercise,
// ): IPlannerProgramExerciseWithType[] {
//   if (plannerExercise.superset == null) {
//     return [];
//   }
//   const dayData = plannerExercise.dayData;
//   const programDay = Program_getProgramDay(evalutedProgram, dayData.day);
//   const dayExercises = programDay
//     ? Program_getProgramDayUsedExercises(programDay)
//     : [];
//   const result = dayExercises.filter(
//     (e) => e.superset?.name === plannerExercise.superset?.name,
//   );
//   return result;
// }
//
// function Program_runExerciseFinishDayScript(
//   entry: IHistoryEntry,
//   dayData: IDayData,
//   settings: ISettings,
//   state: IProgramState,
//   otherStates: IByExercise<IProgramState>,
//   programExercise: IPlannerProgramExercise,
//   stats: IStats,
//   userPromptedStateVars?: IProgramState,
// ): IEither<
//   {
//     state: IProgramState;
//     bindings: IScriptBindings;
//     updates: ILiftoscriptEvaluatorUpdate[];
//     prints: [number | IPercentage | IWeight][];
//   },
//   string
// > {
//   const script =
//     PlannerProgramExercise_getProgressScript(programExercise) || "";
//   const setVariationIndex =
//     PlannerProgramExercise_currentEvaluatedSetVariationIndex(programExercise);
//   const descriptionIndex =
//     PlannerProgramExercise_currentDescriptionIndex(programExercise);
//
//   const bindings = Progress_createScriptBindings(
//     dayData,
//     entry,
//     settings,
//     programExercise.evaluatedSetVariations[setVariationIndex]?.sets.length ?? 0,
//     Stats_getCurrentMovingAverageBodyweight(stats, settings),
//     undefined,
//     setVariationIndex + 1,
//     descriptionIndex + 1,
//   );
//   const fns = Progress_createScriptFunctions(settings);
//   let updates: ILiftoscriptEvaluatorUpdate[] = [];
//   const newState: IProgramState = structuredClone({
//     ...state,
//     ...userPromptedStateVars,
//   });
//
//   const fnContext = {
//     exerciseType: entry.exercise,
//     unit: settings.units,
//     prints: [],
//   };
//   try {
//     const runner = new ScriptRunner(
//       script,
//       newState,
//       structuredClone(otherStates),
//       bindings,
//       fns,
//       settings.units,
//       fnContext,
//       "planner",
//     );
//     runner.execute();
//     updates = runner.getUpdates();
//   } catch (e) {
//     if (e instanceof SyntaxError) {
//       return { success: false, error: e.message };
//     } else {
//       throw e;
//     }
//   }
//
//   const stateDiff = { ...entry.state, ...ObjectUtils_diff(state, newState) };
//   return {
//     success: true,
//     data: { state: stateDiff, updates, bindings, prints: fnContext.prints },
//   };
// }

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

export function ObjectUtils_diff<T extends Record<string, unknown>>(
  older: T,
  newer: T,
): T {
  const result: Partial<T> = {};
  for (const [key, value] of ObjectUtils_entries(changedKeys(older, newer))) {
    if (value === "add" || value === "update") {
      result[key] = newer[key];
    }
  }
  return result as T;
}

function changedKeys<T extends {}>(
  older: T,
  newer: T,
): Partial<Record<keyof T, "delete" | "update" | "add">> {
  const keys = ObjectUtils_combinedKeys(older, newer);
  const changes: Partial<Record<keyof T, "delete" | "update" | "add">> = {};

  for (const key of keys) {
    if (older[key] == null && newer[key] != null) {
      changes[key] = "add";
    } else if (older[key] != null && newer[key] == null) {
      changes[key] = "delete";
    } else if (older[key] != null && newer[key] != null) {
      if (older[key] !== newer[key]) {
        changes[key] = "update";
      }
    }
  }
  return changes;
}

// function Program_dayAverageTimeMs(
//   program: IEvaluatedProgram,
//   settings: ISettings,
// ): number {
//   const dayApproxTimes: number[] = [];
//   for (const week of program.weeks) {
//     for (const day of week.days) {
//       dayApproxTimes.push(Program_dayApproxTimeMs(day, settings));
//     }
//   }
//   return dayApproxTimes.reduce((acc, t) => acc + t, 0) / dayApproxTimes.length;
// }
//
// function Program_dayApproxTimeMs(
//   programDay: IEvaluatedProgramDay,
//   settings: ISettings,
// ): number {
//   return Program_getProgramDayUsedExercises(programDay).reduce((acc, e) => {
//     return acc + ProgramExercise_approxTimeMs(e, settings);
//   }, 0);
// }
//
// function Program_getProgramExerciseForKeyAndShortDayData(
//   program: IEvaluatedProgram,
//   dayData: IShortDayData,
//   key: string,
// ): IPlannerProgramExerciseWithType | undefined {
//   const day = Program_getDayNumber(program, dayData.week, dayData.dayInWeek);
//   return Program_getProgramExerciseForKeyAndDay(program, day, key);
// }

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
          // @todo Why would an alert be thrown here? What purpose does it serve?
          // alert(
          //   `There was an error executing progress script: ${newStateResult.error}`,
          // );
        }
      }
    }
  }
  const theNextDay = Program_nextDay(newEvaluatedProgram, progress.day);
  const newPlanner = new ProgramToPlanner(
    newEvaluatedProgram,
    settings,
  ).convertToPlanner();
  const newProgram = structuredClone(program);
  newProgram.nextDay = theNextDay;
  newProgram.planner = newPlanner;

  return {
    program: newProgram,
    exerciseData,
  };
}

// function Program_createVariation(
//   useStateWeight?: boolean,
// ): IProgramExerciseVariation {
//   return {
//     sets: [
//       {
//         repsExpr: "5",
//         weightExpr: useStateWeight ? "state.weight" : "0lb",
//         isAmrap: false,
//       },
//     ],
//   };
// }

// function Program_createExercise(units: IUnit): IProgramExercise {
//   const defaultWarmup = warmupValues(units)[45];
//   return {
//     name: "Squat",
//     id: UidFactory_generateUid(8),
//     variations: [Program_createVariation(true)],
//     exerciseType: {
//       id: "squat",
//       equipment: "barbell",
//     },
//     state: {
//       weight:
//         units === "kg"
//           ? allExercisesList.squat.startingWeightKg
//           : allExercisesList.squat.startingWeightLb,
//     },
//     warmupSets: defaultWarmup,
//     finishDayExpr: "",
//     variationExpr: "1",
//     descriptions: [""],
//     stateMetadata: {},
//     reuseLogic: { selected: undefined, states: {} },
//   };
// }
//
// function Program_previewProgram(
//   dispatch: IDispatch,
//   programId: string,
//   showCustomPrograms: boolean,
// ): void {
//   updateState(
//     dispatch,
//     [
//       lb<IState>().p("previewProgram").record({
//         id: programId,
//         showCustomPrograms,
//       }),
//     ],
//     "Preview program",
//   );
//   dispatch(Thunk_pushScreen("programPreview"));
// }
//
// function Program_createEmptyProgram(): IProgram {
//   return {
//     vtype: "program",
//     exercises: [],
//     id: emptyProgramId,
//     name: "Ad-Hoc Workout",
//     description: "",
//     url: "",
//     author: "",
//     nextDay: 1,
//     days: [],
//     weeks: [],
//     isMultiweek: false,
//     planner: {
//       vtype: "planner",
//       name: "Ad-Hoc Workout",
//       weeks: [{ name: "", days: [{ name: "", exerciseText: "" }] }],
//     },
//     tags: [],
//   };
// }
//
// function Program_cloneProgram(
//   dispatch: IDispatch,
//   program: IProgram,
//   settings: ISettings,
// ): void {
//   const newProgramId = UidFactory_generateUid(8);
//   updateState(
//     dispatch,
//     [
//       lb<IState>()
//         .p("storage")
//         .p("programs")
//         .recordModify((programs) => {
//           const newProgram = {
//             ...program,
//             clonedAt: Date.now(),
//             id: newProgramId,
//           };
//           if (newProgram.planner) {
//             newProgram.planner = PlannerProgram_switchToUnit(
//               newProgram.planner,
//               settings,
//             );
//           }
//           return [...programs, newProgram];
//         }),
//       lb<IState>().p("storage").p("currentProgramId").record(newProgramId),
//     ],
//     "Clone program",
//   );
// }
//
// function Program_selectProgram(dispatch: IDispatch, programId: string): void {
//   updateState(
//     dispatch,
//     [lb<IState>().p("storage").p("currentProgramId").record(programId)],
//     "Select program",
//   );
//   dispatch(Thunk_pushScreen("main", undefined, { tab: "home" }));
// }

function Program_getAllProgramExercises(
  evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExercise[] {
  return evaluatedProgram.weeks.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  );
}

// function Program_getAllUsedProgramExercises(
//   evaluatedProgram: IEvaluatedProgram,
// ): IPlannerProgramExerciseWithType[] {
//   const used = Program_getAllProgramExercises(evaluatedProgram).filter(
//     (e) => !e.notused && e.exerciseType != null,
//   );
//   return used as IPlannerProgramExerciseWithType[];
// }

function Program_getAllProgramExercisesWithType(
  evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExerciseWithType[] {
  const used = Program_getAllProgramExercises(evaluatedProgram).filter(
    (e) => e.exerciseType != null,
  );
  return used as IPlannerProgramExerciseWithType[];
}

// function Program_getProgramExerciseByTypeWeekAndDay(
//   evaluatedProgram: IEvaluatedProgram,
//   exerciseType: IExerciseType,
//   week: number,
//   dayInWeek: number,
// ): IPlannerProgramExercise | undefined {
//   let exercise: IPlannerProgramExercise | undefined;
//   PP_iterate2(evaluatedProgram.weeks, (e, weekIndex, dayInWeekIndex) => {
//     if (
//       weekIndex + 1 === week &&
//       dayInWeekIndex + 1 === dayInWeek &&
//       e.exerciseType &&
//       Exercise_eq(e.exerciseType, exerciseType)
//     ) {
//       exercise = e;
//       return true;
//     }
//     return false;
//   });
//   return exercise;
// }

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
  // console.log("Program text", PlannerProgram.generateFullText(program.planner?.weeks || []));
  return result;
}

// function Program_getNumberOfExerciseInstances(
//   program: IEvaluatedProgram,
//   exerciseKey: string,
// ): number {
//   let count = 0;
//   PP_iterate2(program.weeks, (exercise) => {
//     if (exercise.key === exerciseKey) {
//       count += 1;
//     }
//   });
//   return count;
// }
//
// function Program_changeExerciseName(
//   from: string,
//   to: string,
//   program: IProgram,
//   settings: ISettings,
// ): IProgram {
//   const planner = program.planner;
//   if (!planner) {
//     return program;
//   }
//   return {
//     ...program,
//     planner: {
//       ...planner,
//       weeks: planner.weeks.map((week) => {
//         return {
//           ...week,
//           days: week.days.map((day) => {
//             return {
//               ...day,
//               exerciseText: PlannerEvaluator_changeExerciseName(
//                 day.exerciseText,
//                 from,
//                 to,
//                 settings,
//               ),
//             };
//           }),
//         };
//       }),
//     },
//   };
// }

function Program_numberOfDays(program: IEvaluatedProgram): number {
  return program.weeks.reduce((memo, week) => memo + week.days.length, 0);
}

// function Program_weeksRange(program: IEvaluatedProgram): string | undefined {
//   return program.weeks.length > 1
//     ? `${program.weeks.length} ${StringUtils_pluralize("week", program.weeks.length)}`
//     : "";
// }
//
// function Program_daysRange(program: IEvaluatedProgram): string {
//   const minDays = Math.min(...program.weeks.map((w) => w.days.length));
//   const maxDays = Math.max(...program.weeks.map((w) => w.days.length));
//   if (minDays === maxDays) {
//     return `${minDays} ${StringUtils_pluralize("day", minDays)} per week`;
//   } else {
//     return `${minDays}-${maxDays} days per week`;
//   }
// }
//
// function Program_exerciseRange(program: IEvaluatedProgram): string {
//   const days = program.weeks.flatMap((w) => w.days);
//   const minExs = Math.min(
//     ...days.map((d) => Program_getProgramDayUsedExercises(d).length),
//   );
//   const maxExs = Math.max(
//     ...days.map((d) => Program_getProgramDayUsedExercises(d).length),
//   );
//   return Program_exerciseRangeFormat(minExs, maxExs);
// }

// function Program_exerciseRangeFormat(minExs: number, maxExs: number): string {
//   if (minExs === maxExs) {
//     return `${minExs} ${StringUtils_pluralize("exercise", minExs)} per day`;
//   } else {
//     return `${minExs}-${maxExs} exercises per day`;
//   }
// }

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

// function Program_getDayNumber(
//   program: IPlannerProgram | IEvaluatedProgram,
//   week: number,
//   dayInWeek: number,
// ): number {
//   let dayIndex = 1;
//   for (let w = 0; w < program.weeks.length; w += 1) {
//     for (let d = 0; d < program.weeks[w].days.length; d += 1) {
//       if (w === week - 1 && d === dayInWeek - 1) {
//         return dayIndex;
//       }
//       dayIndex += 1;
//     }
//   }
//   return -1;
// }
//
// function Program_getExerciseTypesForWeekDay(
//   program: IEvaluatedProgram,
//   week: number,
//   day: number,
// ): IExerciseType[] {
//   const exerciseTypes: IExerciseType[] = [];
//   PP_iterate2(program.weeks, (exercise, weekIndex, dayInWeekIndex) => {
//     if (weekIndex + 1 === week && dayInWeekIndex + 1 === day) {
//       const exType = exercise.exerciseType;
//       if (exType && !exerciseTypes.some((et) => Exercise_eq(et, exType))) {
//         exerciseTypes.push(exType);
//       }
//     }
//   });
//   return exerciseTypes;
// }

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

// function Program_getListOfDays(program: IEvaluatedProgram): [string, string][] {
//   const days: [string, string][] = [];
//   const isReallyMultiweek = program.weeks.length > 1;
//   let dayIndex = 0;
//   for (const week of program.weeks) {
//     for (const day of week.days) {
//       dayIndex += 1;
//       days.push([
//         `${dayIndex}`,
//         `${isReallyMultiweek ? `${week.name} - ` : ""}${day.name}`,
//       ]);
//     }
//   }
//   return days;
// }
//
// function Program_getProgramWeek(
//   program: IEvaluatedProgram,
//   day?: number,
// ): IEvaluatedProgramWeek {
//   return (
//     program.weeks[Program_getWeekFromDay(program, day || 1) - 1] ||
//     program.weeks[0]
//   );
// }

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

// function Program_getFirstProgramExercise(
//   program?: IEvaluatedProgram,
//   key?: string,
// ): IPlannerProgramExercise | undefined {
//   if (key == null || program == null) {
//     return undefined;
//   }
//   return Program_getAllProgramExercises(program).find(
//     (e) => e.key === key || e.fullName === key,
//   );
// }
//
// function Program_getProgramExerciseFromDay(
//   programDay?: IEvaluatedProgramDay,
//   key?: string,
// ): IPlannerProgramExercise | undefined {
//   if (key == null || programDay == null) {
//     return undefined;
//   }
//   return programDay?.exercises.find((e) => e.key === key);
// }
//
// function Program_getEvaluatedExercise(
//   program: IProgram,
//   day: number,
//   key: string,
//   settings: ISettings,
// ): IPlannerProgramExercise | undefined {
//   const { weeks: evaluatedWeeks } = Program_evaluate(program, settings);
//   let plannerProgramExercise: IPlannerProgramExercise | undefined;
//   PP_iterate2(
//     evaluatedWeeks,
//     (exercise, weekIndex, dayInWeekIndex, dayIndex) => {
//       if (dayIndex === day - 1 && exercise.key === key) {
//         plannerProgramExercise = exercise;
//         return true;
//       } else {
//         return undefined;
//       }
//     },
//   );
//   return plannerProgramExercise;
// }

function Program_nextDay(program: IEvaluatedProgram, day?: number): number {
  const nd = (day != null ? day % Program_numberOfDays(program) : 0) + 1;
  return isNaN(nd) ? 1 : nd;
}

// function Program_editAction(
//   dispatch: IDispatch,
//   program: IProgram,
//   dayData?: IDayData,
//   key?: string,
//   opts?: INavigateOpts,
// ): void {
//   const plannerState = EditProgram_initPlannerState(
//     program.id,
//     program,
//     dayData,
//     key,
//   );
//   updateState(
//     dispatch,
//     [lb<IState>().p("editProgramStates").p(program.id).record(plannerState)],
//     "Set edit program state",
//   );
//   dispatch(Thunk_pushScreen("editProgram", { programId: program.id }, opts));
// }
//
// function Program_exportProgramToFile(
//   program: IProgram,
//   settings: ISettings,
//   version: string,
// ): void {
//   const payload = Program_exportProgram(program, settings, version);
//   Exporter_toFile(
//     `liftosaur_${program.name.replace(/\s+/g, "-")}_${DateUtils_formatYYYYMMDD(Date.now())}.json`,
//     JSON.stringify(payload, null, 2),
//   );
// }
//
// async function Program_exportProgramToLink(
//   program: IProgram,
//   settings: ISettings,
//   version: string,
// ): Promise<string> {
//   const payload = Program_exportProgram(program, settings, version);
//   const url = await Encoder_encodeIntoUrl(JSON.stringify(payload), __HOST__);
//   url.pathname = "/program";
//   return url.toString();
// }

// function Program_exportProgram(
//   program: IProgram,
//   settings: ISettings,
//   version?: string,
// ): IExportedProgram {
//   const aFullProgram = Program_evaluate(program, settings);
//   const customExerciseIds = Program_getAllProgramExercises(aFullProgram).reduce<
//     string[]
//   >((memo, programExercise) => {
//     const id = programExercise.exerciseType?.id;
//     if (id) {
//       const isBuiltIn = !!Exercise_findById(id, {});
//       if (!isBuiltIn) {
//         memo.push(id);
//       }
//     }
//     return memo;
//   }, []);
//
//   const customExercises = ObjectUtils_pick(
//     settings.exercises,
//     customExerciseIds,
//   );
//   return {
//     customExercises,
//     program,
//     version: version || getLatestMigrationVersion(),
//     settings: ObjectUtils_pick(settings, ["units", "timers", "planner"]),
//   };
// }
//
// function Program_exportedPlannerProgramToExportedProgram(
//   exportedPlannerProgram: IExportedPlannerProgram,
//   aNextDay?: number,
// ): IExportedProgram {
//   const program = {
//     ...Program_create(
//       exportedPlannerProgram.program.name,
//       exportedPlannerProgram.id,
//     ),
//     planner: exportedPlannerProgram.program,
//   };
//   if (aNextDay != null) {
//     program.nextDay = aNextDay;
//   }
//   const exportedProgram: IExportedProgram = {
//     customExercises: exportedPlannerProgram.settings.exercises,
//     program,
//     version: exportedPlannerProgram.version,
//     settings: {
//       timers: {
//         workout: exportedPlannerProgram.settings.timer,
//       },
//       planner: exportedPlannerProgram.plannerSettings,
//     },
//   };
//   return exportedProgram;
// }

export function Program_create(name: string, id?: string): IProgram {
  return {
    vtype: "program" as const,
    id: id || generateUid(8),
    name: name,
    url: "",
    author: "",
    shortDescription: "",
    description: "",
    nextDay: 1,
    weeks: [],
    isMultiweek: false,
    days: [{ id: generateUid(8), name: "Day 1", exercises: [] }],
    exercises: [],
    tags: [],
    deletedDays: [],
    deletedWeeks: [],
    deletedExercises: [],
    clonedAt: Date.now(),
  };
}

// function Program_isChanged(aProgram: IProgram, bProgram: IProgram): boolean {
//   const { ...cleanedAProgram } = aProgram;
//   const { ...cleanedBProgram } = bProgram;
//   const changed = !ObjectUtils_isEqual(cleanedAProgram, cleanedBProgram);
//   if (changed) {
//     const paths = ObjectUtils_diffPaths(cleanedAProgram, cleanedBProgram);
//     return paths.some((p) => {
//       return (
//         !p.match(/exercises.\d+.state/) &&
//         !p.match(/exercises.\d+.reuseLogic\.states/) &&
//         !p.match(/nextDay/)
//       );
//     });
//   }
//   return false;
// }
//
// function Program_mergePrograms(
//   oldProgram: IProgram,
//   newProgram: IProgram,
//   enforceNew: boolean = false,
// ): IProgram {
//   const deletedWeeks = new Set([
//     ...(oldProgram.deletedWeeks || []),
//     ...(newProgram.deletedWeeks || []),
//   ]);
//   const deletedDays = new Set([
//     ...(oldProgram.deletedDays || []),
//     ...(newProgram.deletedDays || []),
//   ]);
//   const deletedExercises = new Set([
//     ...(oldProgram.deletedExercises || []),
//     ...(newProgram.deletedExercises || []),
//   ]);
//   return {
//     vtype: "program",
//     id: newProgram.id,
//     name: newProgram.name,
//     description: newProgram.description,
//     url: newProgram.url,
//     author: newProgram.author,
//     nextDay: newProgram.nextDay,
//     days: newProgram.days,
//     deletedDays: Array.from(deletedDays),
//     weeks: newProgram.weeks,
//     deletedWeeks: Array.from(deletedWeeks),
//     isMultiweek: newProgram.isMultiweek,
//     tags: newProgram.tags,
//     shortDescription: newProgram.shortDescription,
//     exercises: newProgram.exercises,
//     deletedExercises: Array.from(deletedExercises),
//     clonedAt: newProgram.clonedAt || oldProgram.clonedAt,
//     planner: newProgram.planner,
//   };
// }
//
// async function Program_toUrl(
//   program: IProgram,
//   settings: ISettings,
//   client: Window["fetch"],
//   userId?: string,
// ): Promise<string> {
//   const exportedProgram = Program_exportProgram(program, settings);
//   const baseUrl = UrlUtils_build(
//     "/planner",
//     typeof window !== "undefined"
//       ? window.location.href
//       : "https://www.liftosaur.com",
//   );
//   const json = JSON.stringify(exportedProgram);
//   const hash = StringUtils_hashString(json);
//   const encodedUrl = await Encoder_encodeIntoUrl(json, baseUrl.toString());
//   const encodedProgramUrl = encodedUrl.toString();
//   if (encodedProgramHashToShortUrl[hash]) {
//     return encodedProgramHashToShortUrl[hash];
//   } else {
//     const service = new Service(client);
//     const shortUrl = await service.postShortUrl(
//       encodedProgramUrl,
//       "p",
//       settings.affiliateEnabled ? userId : undefined,
//     );
//     encodedProgramHashToShortUrl[hash] = shortUrl;
//     return shortUrl;
//   }
// }
//
// function Program_createFromHistoryRecord(
//   programName: string,
//   record: IHistoryRecord,
//   settings: ISettings,
// ): IProgram {
//   const dayData = { week: 1, day: 1, dayInWeek: 1 };
//   const program: IProgram = {
//     ...Program_create(programName),
//     planner: {
//       vtype: "planner",
//       name: programName,
//       weeks: [{ name: "Week 1", days: [{ name: "Day 1", exerciseText: "" }] }],
//     },
//   };
//   const evaluatedProgram = Program_evaluate(program, settings);
//   const planner = program.planner!;
//   planner.weeks[0].days[0].exerciseText = record.entries
//     .map((entry) => {
//       const exercise = Exercise_get(entry.exercise, settings.exercises);
//       return Exercise_fullName(exercise, settings);
//     })
//     .join("\n");
//   const newDay: IEvaluatedProgramDay = {
//     dayData: dayData,
//     name: "Day 1",
//     exercises: record.entries.map((e, i) => {
//       return PlannerProgramExercise_createExerciseFromEntry(
//         e,
//         dayData,
//         settings,
//         i,
//       );
//     }),
//   };
//   evaluatedProgram.weeks[0].days[0] = newDay;
//   const newPlanner = new ProgramToPlanner(
//     evaluatedProgram,
//     settings,
//   ).convertToPlanner();
//   const newProgram = {
//     ...structuredClone(program),
//     planner: newPlanner,
//   };
//   return newProgram;
// }
//
// function Program_addDayFromHistoryRecord(
//   program: IProgram,
//   afterDay: number,
//   record: IHistoryRecord,
//   settings: ISettings,
// ): { program: IProgram; dayData: Required<IDayData> } {
//   const evaluatedProgram = Program_evaluate(program, settings);
//   const dayData = Program_getDayData(evaluatedProgram, afterDay);
//   const newDayData = {
//     week: dayData.week,
//     day: dayData.day + 1,
//     dayInWeek: dayData.dayInWeek + 1,
//   };
//   const newDay: IEvaluatedProgramDay = {
//     dayData: newDayData,
//     name: `Day ${dayData.day + 1}`,
//     exercises: record.entries.map((e, i) => {
//       return PlannerProgramExercise_createExerciseFromEntry(
//         e,
//         newDayData,
//         settings,
//         i,
//       );
//     }),
//   };
//   evaluatedProgram.weeks[dayData.week - 1].days.splice(
//     dayData.dayInWeek,
//     0,
//     newDay,
//   );
//   evaluatedProgram.planner.weeks[dayData.week - 1].days.splice(
//     dayData.dayInWeek,
//     0,
//     {
//       name: newDay.name,
//       exerciseText: newDay.exercises.map((e) => e.fullName).join("\n"),
//     },
//   );
//   const newPlanner = new ProgramToPlanner(
//     evaluatedProgram,
//     settings,
//   ).convertToPlanner();
//   const newProgram = {
//     ...structuredClone(program),
//     planner: newPlanner,
//   };
//   return { program: newProgram, dayData: newDayData };
// }
//
// function Program_getReusingSetsExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const exercises: IPlannerProgramExercise[] = [];
//   PP_iterate2(evaluatedProgram.weeks, (e) => {
//     if (
//       e.reuse?.exercise?.key === programExercise.key &&
//       e.reuse?.exercise.dayData.week === programExercise.dayData.week &&
//       e.reuse?.exercise.dayData.dayInWeek === programExercise.dayData.dayInWeek
//     ) {
//       exercises.push(e);
//     }
//   });
//   return exercises;
// }
//
// function Program_getReusingDescriptionsExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const exercises: IPlannerProgramExercise[] = [];
//   PP_iterate2(evaluatedProgram.weeks, (e) => {
//     if (
//       e.descriptions.reuse?.exercise?.key === programExercise.key &&
//       e.descriptions.reuse?.exercise.dayData.week ===
//         programExercise.dayData.week &&
//       e.descriptions.reuse?.exercise.dayData.dayInWeek ===
//         programExercise.dayData.dayInWeek
//     ) {
//       exercises.push(e);
//     }
//   });
//   return exercises;
// }

// function Program_getReusingCustomProgressExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const exercises: IPlannerProgramExercise[] = [];
//   PP_iterate2(evaluatedProgram.weeks, (e) => {
//     if (
//       e.progress?.type === "custom" &&
//       e.progress?.reuse?.fullName === programExercise.fullName
//     ) {
//       exercises.push(e);
//     }
//   });
//   return exercises;
// }
//
// function Program_getReusingSetProgressExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const exercises: IPlannerProgramExercise[] = [];
//   PP_iterate2(evaluatedProgram.weeks, (e) => {
//     if (e.reuse?.fullName === programExercise.fullName && e.progress) {
//       exercises.push(e);
//     }
//   });
//   return exercises;
// }

// function Program_getReusingProgressExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const reusingCustomProgressExercises =
//     Program_getReusingCustomProgressExercises(
//       evaluatedProgram,
//       programExercise,
//     );
//   const reusingSetProgressExercises = Program_getReusingSetProgressExercises(
//     evaluatedProgram,
//     programExercise,
//   );
//   const exercises = CollectionUtils_uniqBy(
//     [...reusingCustomProgressExercises, ...reusingSetProgressExercises],
//     "fullName",
//   );
//   return exercises;
// }
//
// function Program_getReusingUpdateExercises(
//   evaluatedProgram: IEvaluatedProgram,
//   programExercise: IPlannerProgramExercise,
// ): IPlannerProgramExercise[] {
//   const exercises: IPlannerProgramExercise[] = [];
//   PP_iterate2(evaluatedProgram.weeks, (e) => {
//     if (e.reuse?.fullName === programExercise.fullName) {
//       exercises.push(e);
//     }
//   });
//   return exercises;
// }
//
// const Program_fullProgram = memoize(
//   (program: IProgram, settings: ISettings): IProgram => {
//     return program;
//   },
//   { maxSize: 10 },
// );
//
export const Program_evaluate = memoize(Program_forceEvaluate, { maxSize: 10 });
//
// function Program_getDiffState(
//   state: IProgramState,
//   newState: IProgramState,
//   units: IUnit,
// ): Record<string, string | undefined> {
//   return ObjectUtils_keys(state).reduce<Record<string, string | undefined>>(
//     (memo, key) => {
//       const oldValue = state[key];
//       const newValue = newState[key];
//       if (newValue != null && !Weight_eq(oldValue, newValue)) {
//         const oldValueStr = Weight_display(
//           Weight_convertTo(oldValue as number, units),
//         );
//         const newValueStr = Weight_display(
//           Weight_convertTo(newValue as number, units),
//         );
//         memo[key] = `${oldValueStr} -> ${newValueStr}`;
//       }
//       return memo;
//     },
//     {},
//   );
// }
//
// function Program_getDiffVars(
//   entry: IHistoryEntry,
//   updates: ILiftoscriptEvaluatorUpdate[],
//   bindings: IScriptBindings,
//   settings: ISettings,
// ): Record<string, string | undefined> {
//   const diffVars: Record<string, string | undefined> = {};
//   if (bindings.rm1 != null) {
//     const oldOnerm = Exercise_onerm(entry.exercise, settings);
//     if (!Weight_eq(oldOnerm, bindings.rm1)) {
//       diffVars["1 RM"] =
//         `${Weight_display(Weight_convertTo(oldOnerm, settings.units))} -> ${Weight_display(
//           Weight_convertTo(bindings.rm1, settings.units),
//         )}`;
//     }
//   }
//   for (const update of updates) {
//     const key = update.type;
//     const value = update.value;
//     const target = value.target;
//     while (target[0] === "*") {
//       target.shift();
//     }
//     const keyStr = `${key}${target.length > 0 ? `[${target.join(":")}]` : ""}`;
//     diffVars[keyStr] =
//       `${value.op !== "=" ? `${value.op} ` : ""}${Weight_printOrNumber(value.value)}`;
//   }
//   return diffVars;
// }
//
// function Program_getEvaluatedProgramFromState(
//   state: IState,
// ): IEvaluatedProgram | undefined {
//   const program = Program_getCurrentProgram(state.storage);
//   return program
//     ? Program_evaluate(program, state.storage.settings)
//     : undefined;
// }

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

// function Settings_applyExportedProgram(
//   settings: ISettings,
//   exportedProgram: IExportedProgram,
// ): ISettings {
//   const result = {
//     ...settings,
//     exercises: {
//       ...settings.exercises,
//       ...exportedProgram.customExercises,
//     },
//     units: settings.units || exportedProgram.settings.units,
//     timers: {
//       ...settings.timers,
//       workout:
//         settings.timers.workout || exportedProgram.settings.timers?.workout,
//       warmup: settings.timers.warmup || exportedProgram.settings.timers?.warmup,
//     },
//     planner: settings.planner || exportedProgram.settings.planner,
//     muscleGroups:
//       settings.muscleGroups || exportedProgram.settings.muscleGroups,
//     exerciseData: {
//       ...settings.exerciseData,
//       ...exportedProgram.settings.exerciseData,
//     },
//     workoutSettings: {
//       ...settings.workoutSettings,
//       ...exportedProgram.settings.workoutSettings,
//     },
//   };
//   return result;
// }
//
// function Settings_activeCustomExercises(
//   settings: ISettings,
// ): IAllCustomExercises {
//   return ObjectUtils_filter(settings.exercises, (k, v) => !v?.isDeleted);
// }
//
// function Settings_getNextTargetType(
//   type: ITargetType,
//   skipPlatesCalculator: boolean,
// ): ITargetType {
//   const index = targetTypes.indexOf(type);
//   let nextTargetType: ITargetType;
//   if (index === -1) {
//     nextTargetType = targetTypes[0];
//   } else if (index === targetTypes.length - 1) {
//     nextTargetType = targetTypes[0];
//   } else {
//     nextTargetType = targetTypes[index + 1];
//   }
//   if (nextTargetType === "platescalculator" && skipPlatesCalculator) {
//     nextTargetType = Settings_getNextTargetType(
//       "platescalculator",
//       skipPlatesCalculator,
//     );
//   }
//   return nextTargetType;
// }
//
// function Settings_toggleStarredExercise(
//   dispatch: IDispatch,
//   key: string,
// ): void {
//   updateSettings(
//     dispatch,
//     lb<ISettings>()
//       .p("starredExercises")
//       .recordModify((starred) => {
//         if (starred?.[key]) {
//           delete starred[key];
//         } else {
//           starred = starred || {};
//           starred[key] = true;
//         }
//         return starred;
//       }),
//     `Toggle starred exercise ${key}`,
//   );
// }
//
// function Settings_changePickerSettings(
//   dispatch: IDispatch,
//   settings: IExercisePickerSettings,
// ): void {
//   updateSettings(
//     dispatch,
//     lb<ISettings>()
//       .p("workoutSettings")
//       .recordModify((workoutSettings) => {
//         return { ...workoutSettings, ...settings };
//       }),
//     `Change picker settings`,
//   );
// }
//
// function Settings_doesProgramHaveUnset1RMs(
//   program: IProgram,
//   settings: ISettings,
// ): boolean {
//   return Settings_getExercisesWithUnset1RMs(program, settings).length > 0;
// }
//
// function Settings_getExercisesWithUnset1RMs(
//   program: IProgram,
//   settings: ISettings,
// ): IExercise[] {
//   const evalutedProgram = Program_evaluate(program, settings);
//   const plannerExercises = Program_getAllUsedProgramExercises(
//     evalutedProgram,
//   ).filter((exercise) => {
//     return ProgramExercise_doesUse1RM(exercise);
//   });
//   const exerciseTypes = CollectionUtils_uniqByExpr(
//     plannerExercises
//       .filter((exercise) => {
//         return (
//           settings.exerciseData[Exercise_toKey(exercise.exerciseType)]?.rm1 ==
//           null
//         );
//       })
//       .map((exercise) => exercise.exerciseType),
//     (e) => Exercise_toKey(e),
//   );
//   const exercises = exerciseTypes.map((e) =>
//     Exercise_get(e, settings.exercises),
//   );
//   return CollectionUtils_sort(exercises, (a, b) => {
//     return Exercise_nameWithEquipment(a, settings).localeCompare(
//       Exercise_nameWithEquipment(b, settings),
//     );
//   });
// }
//
// function Settings_setOneRM(
//   dispatch: IDispatch,
//   exerciseType: IExerciseType,
//   value: IWeight,
//   settings: ISettings,
// ): void {
//   updateSettings(
//     dispatch,
//     lb<ISettings>()
//       .p("exerciseData")
//       .recordModify((data) => {
//         const key = Exercise_toKey(exerciseType);
//         return { ...data, [key]: { ...data[key], rm1: value } };
//       }),
//     `Set 1RM for ${Exercise_nameWithEquipment(Exercise_get(exerciseType, settings.exercises), settings)} to ${Weight_print(value)}`,
//   );
// }
//
// function Settings_getTheme(settings: ISettings): "dark" | "light" {
//   return settings.theme
//     ? settings.theme
//     : window.lftSystemDarkMode
//       ? "dark"
//       : "light";
// }
//
// function Settings_applyTheme(theme?: "dark" | "light"): void {
//   if (theme === "dark") {
//     document.body.classList.add("dark");
//     SendMessage_toIosAndAndroid({ type: "theme", value: "dark" });
//   } else {
//     document.body.classList.remove("dark");
//     SendMessage_toIosAndAndroid({ type: "theme", value: "light" });
//   }
// }
//#endregion

//#region Planner Program
// type IExerciseTypeToProperties = Record<
//   string,
//   (IPlannerProgramProperty & { dayData: Required<IDayData> })[]
// >;
// type IExerciseTypeToWarmupSets = Record<
//   string,
//   IPlannerProgramExerciseWarmupSet[] | undefined
// >;
//
// class PlannerDayDataError extends Error {
//   constructor(
//     message: string,
//     public readonly dayData: Required<IDayData>,
//   ) {
//     super(message);
//   }
// }
//
// type IDereuseDecision = "all" | "weight" | "rpe" | "timer";
//
// function PlannerProgram_isValid(
//   program: IPlannerProgram | undefined,
//   settings: ISettings,
// ): boolean {
//   if (!program) {
//     return false;
//   }
//   const { evaluatedWeeks } = PlannerProgram_evaluate(program, settings);
//   return evaluatedWeeks.every((week) => week.every((day) => day.success));
// }

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
  const evaluatedProgram = structuredClone(
    Program_evaluate({ ...Program_create("Temp"), planner }, settings),
  );
  const allExercises = Program_getAllProgramExercises(evaluatedProgram);
  let labelSuffix: string | undefined = undefined;
  let noConflicts = false;

  function getLabel(label?: string): string | undefined {
    return (newLabel ?? label) || labelSuffix
      ? [newLabel ?? label, labelSuffix].filter(definedOnly).join("-")
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
//
// function PlannerProgram_modifyTopLineItems(
//   aPlannerProgram: IPlannerProgram,
//   settings: ISettings,
//   firstPass: (
//     line: IPlannerTopLineItem,
//     weekIndex: number,
//     dayInWeekIndex: number,
//     dayIndex: number,
//     lineIndex: number,
//   ) => IPlannerTopLineItem,
// ): IPlannerProgram {
//   let dayIndex = 0;
//   const plannerProgram = structuredClone(aPlannerProgram);
//   const mapping = plannerProgram.weeks.map((week, weekIndex) => {
//     return week.days.map((day, dayInWeekIndex) => {
//       const tree = plannerExerciseParser.parse(day.exerciseText);
//       const evaluator = new PlannerExerciseEvaluator(
//         day.exerciseText,
//         settings,
//         "perday",
//         {
//           day: dayIndex + 1,
//           dayInWeek: dayInWeekIndex + 1,
//           week: weekIndex + 1,
//         },
//       );
//       dayIndex += 1;
//       const map = evaluator.topLineMap(tree.topNode);
//       return map;
//     });
//   });
//
//   dayIndex = 0;
//   for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
//     const week = mapping[weekIndex];
//     for (
//       let dayInWeekIndex = 0;
//       dayInWeekIndex < week.length;
//       dayInWeekIndex += 1
//     ) {
//       const day = week[dayInWeekIndex];
//       for (let lineIndex = 0; lineIndex < day.length; lineIndex += 1) {
//         const line = day[lineIndex];
//         const newLine = firstPass(
//           line,
//           weekIndex,
//           dayInWeekIndex,
//           dayIndex,
//           lineIndex,
//         );
//         day[lineIndex] = newLine;
//       }
//       dayIndex += 1;
//     }
//   }
//
//   for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
//     const programWeek = plannerProgram.weeks[weekIndex];
//     const week = mapping[weekIndex];
//     for (
//       let dayInWeekIndex = 0;
//       dayInWeekIndex < week.length;
//       dayInWeekIndex += 1
//     ) {
//       const day = week[dayInWeekIndex];
//       const programDay = programWeek.days[dayInWeekIndex];
//       let str = "";
//       for (const line of day) {
//         str += PlannerProgram_topLineItemToText(line);
//       }
//       programDay.exerciseText = str.trim();
//     }
//   }
//
//   return plannerProgram;
// }
//
// function PlannerProgram_topLineItemToText(line: IPlannerTopLineItem): string {
//   let str = "";
//   if (line.type === "description") {
//     //
//   } else if (line.type === "exercise") {
//     if (!line.used) {
//       if (line.descriptions && line.descriptions.length > 0) {
//         str += `${line.descriptions.join("\n\n")}\n`;
//       }
//       let repeatStr = "";
//       if (
//         (line.order != null && line.order !== 0) ||
//         (line.repeatRanges && line.repeatRanges.length > 0)
//       ) {
//         const repeatParts = [];
//         if (line.order != null && line.order !== 0) {
//           repeatParts.push(line.order);
//         }
//         if (line.repeatRanges && line.repeatRanges.length > 0) {
//           repeatParts.push(line.repeatRanges.join(","));
//         }
//         repeatStr = `[${repeatParts.join(",")}]`;
//       }
//       str += `${line.fullName}${repeatStr} / ${line.sections}\n`;
//     }
//   } else {
//     str += line.value + "\n";
//   }
//   return str;
// }
//
export function PlannerProgram_switchToUnit(
  plannerProgram: IPlannerProgram,
  settings: ISettings,
): IPlannerProgram {
  const newPlannerProgram = structuredClone(plannerProgram);
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

// function PlannerProgram_hasNonSelectedWeightUnit(
//   plannerProgram: IPlannerProgram,
//   settings: ISettings,
// ): boolean {
//   for (const week of plannerProgram.weeks) {
//     for (const day of week.days) {
//       const tree = plannerExerciseParser.parse(day.exerciseText);
//       const evaluator = new PlannerExerciseEvaluator(
//         day.exerciseText,
//         settings,
//         "perday",
//       );
//       if (
//         evaluator.hasWeightInUnit(
//           tree.topNode,
//           settings.units === "kg" ? "lb" : "kg",
//         )
//       ) {
//         return true;
//       }
//     }
//   }
//   return false;
// }
//
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
          //
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

// function PlannerProgram_evaluateFull(
//   fullProgramText: string,
//   settings: ISettings,
// ): { evaluatedWeeks: IPlannerEvalFullResult; exerciseFullNames: string[] } {
//   return PlannerEvaluator_evaluateFull(fullProgramText, settings);
// }

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
//
// function PlannerProgram_fullToWeekEvalResult(
//   fullResult: IPlannerEvalFullResult,
// ): IPlannerEvalResult[][] {
//   return fullResult.success
//     ? fullResult.data.map((week) =>
//         week.days.map((d) => ({ success: true, data: d.exercises })),
//       )
//     : [[fullResult]];
// }

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

// function PlannerProgram_usedExercises(
//   exercises: IAllCustomExercises,
//   evaluatedWeeks: IPlannerEvalResult[][],
// ): IAllCustomExercises {
//   return ObjectUtils_filter(exercises, (_id, ex) => {
//     if (!ex) {
//       return false;
//     }
//
//     return evaluatedWeeks.some((week) => {
//       return week.some((day) => {
//         return (
//           day.success &&
//           day.data.some((d) => d.name.toLowerCase() === ex.name.toLowerCase())
//         );
//       });
//     });
//   });
// }
//
// function PlannerProgram_usedEquipment(
//   equipment: IAllEquipment,
//   evaluatedWeeks: IPlannerEvalResult[][],
// ): IAllEquipment {
//   return ObjectUtils_filter(equipment, (key, value) => {
//     return evaluatedWeeks.some((week) => {
//       return week.some((day) => {
//         return (
//           day.success &&
//           day.data.some((d) => d.equipment?.toLowerCase() === key)
//         );
//       });
//     });
//   });
// }
//
// function PlannerProgram_convertExportedPlannerToProgram(
//   planner: IExportedPlannerProgram,
//   settings: ISettings,
// ): IExportedProgram {
//   const newProgram = Program_create(planner.program.name, planner.id);
//   const newSettings: ISettings = {
//     ...settings,
//     exercises: { ...settings.exercises, ...planner.settings.exercises },
//   };
//   const program = { ...newProgram, planner: planner.program };
//   return {
//     program: program,
//     settings: {
//       timers: newSettings.timers,
//       planner: newSettings.planner,
//       units: newSettings.units,
//     },
//     customExercises: planner.settings.exercises,
//     version: planner.version,
//   };
// }
//
// function PlannerProgram_buildExportedProgram(
//   id: string,
//   program: IPlannerProgram,
//   settings: ISettings,
//   nextDay?: number,
// ): IExportedProgram {
//   const { evaluatedWeeks } = PlannerProgram_evaluate(program, settings);
//
//   const exportedPlannerProgram: IExportedPlannerProgram = {
//     id,
//     type: "v2",
//     version: getLatestMigrationVersion(),
//     program: program,
//     plannerSettings: settings.planner,
//     settings: {
//       exercises: PlannerProgram_usedExercises(
//         settings.exercises,
//         evaluatedWeeks,
//       ),
//       timer: settings.timers.workout ?? 0,
//     },
//   };
//   return Program_exportedPlannerProgramToExportedProgram(
//     exportedPlannerProgram,
//     nextDay,
//   );
// }
//
// async function PlannerProgram_getExportedPlannerProgram(
//   program: IExportedPlannerProgram,
//   settings: ISettings,
// ): Promise<IEither<IExportedPlannerProgram, string[]>> {
//   const storage = Storage_getDefault();
//   storage.version = program.version;
//   storage.programs = [
//     { ...Program_create(program.program.name), planner: program.program },
//   ];
//   storage.settings = {
//     ...storage.settings,
//     planner: program.plannerSettings || storage.settings.planner,
//   };
//   storage.settings.exercises = {
//     ...storage.settings.exercises,
//     ...settings.exercises,
//   };
//
//   const result = Storage_get(storage);
//   if (result.success) {
//     const newStorage = result.data;
//     return {
//       success: true,
//       data: {
//         id: program.id,
//         type: "v2",
//         version: newStorage.version,
//         program: newStorage.programs[0].planner!,
//         plannerSettings: storage.settings.planner,
//         settings: {
//           exercises: storage.settings.exercises || {},
//           timer: storage.settings.timers?.workout || 180,
//         },
//       },
//     };
//   } else {
//     return { success: false, error: result.error };
//   }
// }

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
// type IBuiltinEquipment = t.TypeOf<typeof TBuiltinEquipment>;
//
// const exerciseTypes = [
//   "abWheel",
//   "arnoldPress",
//   "aroundTheWorld",
//   "backExtension",
//   "ballSlams",
//   "battleRopes",
//   "benchDip",
//   "benchPress",
//   "benchPressCloseGrip",
//   "benchPressWideGrip",
//   "bentOverOneArmRow",
//   "bentOverRow",
//   "bicepCurl",
//   "bicycleCrunch",
//   "boxJump",
//   "boxSquat",
//   "bulgarianSplitSquat",
//   "burpee",
//   "cableCrossover",
//   "cableCrunch",
//   "cableKickback",
//   "cablePullThrough",
//   "cableTwist",
//   "calfPressOnLegPress",
//   "calfPressOnSeatedLegPress",
//   "chestDip",
//   "chestFly",
//   "chestPress",
//   "chinUp",
//   "clean",
//   "cleanandJerk",
//   "concentrationCurl",
//   "crossBodyCrunch",
//   "crunch",
//   "cycling",
//   "deadlift",
//   "deadliftHighPull",
//   "declineBenchPress",
//   "declineCrunch",
//   "deficitDeadlift",
//   "ellipticalMachine",
//   "facePull",
//   "flatKneeRaise",
//   "flatLegRaise",
//   "frontRaise",
//   "frontSquat",
//   "gluteBridge",
//   "gluteBridgeMarch",
//   "gluteKickback",
//   "gobletSquat",
//   "goodMorning",
//   "hackSquat",
//   "hammerCurl",
//   "handstandPushUp",
//   "hangClean",
//   "hangSnatch",
//   "hangingLegRaise",
//   "highKneeSkips",
//   "highRow",
//   "hipAbductor",
//   "hipAdductor",
//   "hipThrust",
//   "inclineBenchPress",
//   "inclineChestFly",
//   "inclineChestPress",
//   "inclineCurl",
//   "inclineRow",
//   "invertedRow",
//   "isoLateralChestPress",
//   "isoLateralRow",
//   "jackknifeSitUp",
//   "jumpRope",
//   "jumpSquat",
//   "jumpingJack",
//   "kettlebellSwing",
//   "kettlebellTurkishGetUp",
//   "kippingPullUp",
//   "kneeRaise",
//   "kneelingPulldown",
//   "kneestoElbows",
//   "latPulldown",
//   "lateralBoxJump",
//   "lateralRaise",
//   "legExtension",
//   "legPress",
//   "lunge",
//   "lyingLegCurl",
//   "mountainClimber",
//   "muscleUp",
//   "obliqueCrunch",
//   "overheadPress",
//   "overheadSquat",
//   "pecDeck",
//   "pendlayRow",
//   "pistolSquat",
//   "plank",
//   "powerClean",
//   "powerSnatch",
//   "preacherCurl",
//   "pressUnder",
//   "pullUp",
//   "pullover",
//   "pushPress",
//   "pushUp",
//   "reverseCrunch",
//   "reverseCurl",
//   "reverseFly",
//   "reverseGripConcentrationCurl",
//   "reverseHyperextension",
//   "reverseWristCurl",
//   "reverseLunge",
//   "reversePlank",
//   "romanianDeadlift",
//   "rowing",
//   "russianTwist",
//   "seatedCalfRaise",
//   "seatedLegCurl",
//   "seatedLegPress",
//   "seatedOverheadPress",
//   "seatedPalmsUpWristCurl",
//   "seatedRow",
//   "seatedWideGripRow",
//   "shoulderPress",
//   "shrug",
//   "sideBend",
//   "sideCrunch",
//   "sideHipAbductor",
//   "sideLyingClam",
//   "sidePlank",
//   "singleLegBridge",
//   "singleLegDeadlift",
//   "singleLegGluteBridgeBench",
//   "singleLegGluteBridgeStraight",
//   "singleLegGluteBridgeBentKnee",
//   "singleLegHipThrust",
//   "sitUp",
//   "skullcrusher",
//   "snatch",
//   "snatchPull",
//   "splitSquat",
//   "splitJerk",
//   "squat",
//   "squatRow",
//   "standingCalfRaise",
//   "stepUp",
//   "stiffLegDeadlift",
//   "straightLegDeadlift",
//   "sumoDeadlift",
//   "sumoDeadliftHighPull",
//   "superman",
//   "tBarRow",
//   "thruster",
//   "toesToBar",
//   "torsoRotation",
//   "trapBarDeadlift",
//   "tricepsDip",
//   "tricepsExtension",
//   "tricepsPushdown",
//   "uprightRow",
//   "vUp",
//   "widePullUp",
//   "wristCurl",
//   "wristRoller",
//   "zercherSquat",
// ] as const;

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
// type IMuscle = t.TypeOf<typeof TMuscle>;

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
// type IExerciseKind = t.TypeOf<typeof TExerciseKind>;

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
// type IBodyPart = t.TypeOf<typeof TBodyPart>;

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
// type IGraphExerciseSelectedType = t.TypeOf<typeof TGraphExerciseSelectedType>;

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
// type IGraphMuscleGroupSelectedType = t.TypeOf<
//   typeof TGraphMuscleGroupSelectedType
// >;
//
// type IExerciseSelectedType = "weight" | "volume";
// type IVolumeSelectedType = "sets" | "volume";

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
// type IMetaExercises = t.TypeOf<typeof TMetaExercises>;

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

// const barKeys = ["barbell", "ezbar", "dumbbell"] as const;
//
// const TBarKey = t.keyof(
//   barKeys.reduce<Record<IArrayElement<typeof barKeys>, null>>(
//     (memo, barKey) => {
//       memo[barKey] = null;
//       return memo;
//     },
//     {} as Record<IArrayElement<typeof barKeys>, null>,
//   ),
//   "TBarKey",
// );
// type IBarKey = t.TypeOf<typeof TBarKey>;
//
// const TBars = t.record(TBarKey, TWeight, "TBars");
// type IBars = t.TypeOf<typeof TBars>;

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
// type IPercentageUnit = t.TypeOf<typeof TPercentageUnit>;

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
// type IProgramStateMetadataValue = t.TypeOf<typeof TProgramStateMetadataValue>;

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
// type IProgramSet = t.TypeOf<typeof TProgramSet>;

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
// type IProgramExerciseVariation = Readonly<
//   t.TypeOf<typeof TProgramExerciseVariation>
// >;

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
// type IProgramExerciseReuseLogic = Readonly<
//   t.TypeOf<typeof TProgramExerciseReuseLogic>
// >;

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
// type IProgramExercise = t.TypeOf<typeof TProgramExercise>;

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
// type IExercisePickerScreen = t.TypeOf<typeof TExercisePickerScreen>;

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
// type IExercisePickerSort = t.TypeOf<typeof TExercisePickerSort>;

const TExercisePickerFilters = t.partial(
  {
    equipment: t.array(TBuiltinEquipment),
    type: t.array(TExerciseKind),
    muscles: t.array(TMuscle),
    isStarred: t.boolean,
  },
  "TExercisePickerFilters",
);
// type IExercisePickerFilters = t.TypeOf<typeof TExercisePickerFilters>;

const TExercisePickerProgramExercise = t.type(
  {
    type: t.literal("program"),
    exerciseType: TExerciseType,
    week: t.number,
    dayInWeek: t.number,
  },
  "TExercisePickerProgramExercise",
);
// type IExercisePickerProgramExercise = t.TypeOf<
//   typeof TExercisePickerProgramExercise
// >;

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
// type IExercisePickerAdhocExercise = t.TypeOf<
//   typeof TExercisePickerAdhocExercise
// >;

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
// type IExercisePickerTemplate = t.TypeOf<typeof TExercisePickerTemplate>;

const TExercisePickerSelectedExercise = t.union([
  TExercisePickerProgramExercise,
  TExercisePickerAdhocExercise,
  TExercisePickerTemplate,
]);
// type IExercisePickerSelectedExercise = t.TypeOf<
//   typeof TExercisePickerSelectedExercise
// >;

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
// type IExercisePickerState = t.TypeOf<typeof TExercisePickerState>;

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

// type IProgressUi = t.TypeOf<typeof TProgressUi>;

const TProgressMode = t.keyof(
  {
    warmup: null,
    workout: null,
  },
  "TProgressMode",
);

// type IProgressMode = t.TypeOf<typeof TProgressMode>;

const TIntervals = t.array(
  t.tuple([t.number, t.union([t.number, t.undefined, t.null])]),
  "TIntervals",
);
// type IIntervals = t.TypeOf<typeof TIntervals>;

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
// type IHistoryRecordChange = t.TypeOf<typeof THistoryRecordChange>;

const historyRecordRequiredFields = {
  // ISO8601, like 2020-02-29T18:02:05+00:00
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

// const TProgramDayEntry = t.type(
//   {
//     exercise: TExerciseType,
//     sets: t.array(TProgramSet),
//   },
//   "TProgramDayEntry",
// );
// type IProgramDayEntry = Readonly<t.TypeOf<typeof TProgramDayEntry>>;

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
// type IProgramWeek = Readonly<t.TypeOf<typeof TProgramWeek>>;

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
// type IProgramDay = Readonly<t.TypeOf<typeof TProgramDay>>;

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
// type IProgramTag = Readonly<t.TypeOf<typeof TProgramTag>>;

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
// type ILengthUnit = t.TypeOf<typeof TLengthUnit>;

const TLength = t.type({ value: t.number, unit: TLengthUnit }, "TLength");
// type ILength = t.TypeOf<typeof TLength>;

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
// type IStatsWeightValue = t.TypeOf<typeof TStatsWeightValue>;

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
// type IStatsLengthValue = t.TypeOf<typeof TStatsLengthValue>;

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
// type IStatsPercentageValue = t.TypeOf<typeof TStatsPercentageValue>;

const statsPercentageDef = {
  bodyfat: t.array(TStatsPercentageValue),
};
const TStatsPercentage = t.partial(statsPercentageDef, "TStatsPercentage");
type IStatsPercentage = t.TypeOf<typeof TStatsPercentage>;

// type IStatsKey =
//   | keyof IStatsLength
//   | keyof IStatsWeight
//   | keyof IStatsPercentage;

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
// type IStatsWeightEnabled = t.TypeOf<typeof TStatsWeightEnabled>;

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
// type IStatsLengthEnabled = t.TypeOf<typeof TStatsLengthEnabled>;

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
// type IStatsEnabled = Readonly<t.TypeOf<typeof TStatsEnabled>>;

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
// type ISettingsTimers = t.TypeOf<typeof TSettingsTimers>;

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
// type IGraph = t.TypeOf<typeof TGraph>;

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
// type IGraphOptions = t.TypeOf<typeof TGraphOptions>;

// const TMuscleMultiplier = t.type(
//   {
//     muscle: TMuscle,
//     multiplier: t.number,
//   },
//   "TMuscleMultiplier",
// );
// type IMuscleMultiplier = t.TypeOf<typeof TMuscleMultiplier>;

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
// type IScreenMuscle = t.TypeOf<typeof TScreenMuscle>;

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
// type ITargetType = t.TypeOf<typeof TTargetType>;

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

// type IWorkoutSettings = t.TypeOf<typeof TWorkoutSettings>;

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
// type IMuscleGroupsSettings = t.TypeOf<typeof TMuscleGroupsSettings>;

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

// const TSubscriptionReceipt = t.type({
//   vtype: t.literal("subscription_receipt"),
//   id: t.string,
//   value: t.string,
//   createdAt: t.number,
// });
// type ISubscriptionReceipt = t.TypeOf<typeof TSubscriptionReceipt>;

// const TSubscription = t.intersection([
//   t.interface({
//     apple: t.array(TSubscriptionReceipt),
//     google: t.array(TSubscriptionReceipt),
//   }),
//   t.partial({
//     key: t.union([t.string, t.undefined]),
//   }),
// ]);
// type ISubscription = t.TypeOf<typeof TSubscription>;

// const TAffiliateData = t.type({
//   id: t.string,
//   timestamp: t.number,
//   type: t.union([t.literal("coupon"), t.literal("program")]),
//   vtype: t.literal("affiliate"),
// });
// type IAffiliateData = t.TypeOf<typeof TAffiliateData>;

// const TStorage = t.intersection(
//   [
//     t.interface({
//       history: t.array(THistoryRecord),
//       deletedHistory: t.array(t.number),
//       stats: TStats,
//       deletedStats: t.array(t.number),
//       settings: TSettings,
//       currentProgramId: t.union([t.string, t.undefined]),
//       version: t.string,
//       programs: t.array(TProgram),
//       deletedPrograms: t.array(t.number),
//       reviewRequests: t.array(t.number),
//       signupRequests: t.array(t.number),
//       helps: t.array(t.string),
//       tempUserId: t.string,
//       email: t.union([t.string, t.undefined]),
//       affiliates: dictionary(t.string, TAffiliateData),
//       subscription: TSubscription,
//       whatsNew: t.union([t.string, t.undefined]),
//       progress: t.array(THistoryRecord),
//     }),
//     t.partial({
//       originalId: t.number,
//       id: t.number,
//       referrer: t.string,
//       attribution: t.string,
//       _versions: t.unknown, // We use unknown because io-ts doesn't support recursive types well
//     }),
//   ],
//   "TStorage",
// );
// type IStorage = Omit<t.TypeOf<typeof TStorage>, "_versions"> & {
//   _versions?: IVersions<Omit<t.TypeOf<typeof TStorage>, "_versions">>;
// };
//
// type IPartialStorage = Omit<IStorage, "history" | "stats" | "programs"> &
//   Partial<Pick<IStorage, "history" | "stats" | "programs">>;

// type IProgramContentSettings = Partial<
//   Pick<
//     ISettings,
//     "units" | "planner" | "muscleGroups" | "exerciseData" | "workoutSettings"
//   > & {
//     timers: Partial<ISettings["timers"]>;
//   }
// >;

// const TMuscleGeneratorResponse = t.type(
//   {
//     targetMuscles: t.array(TMuscle),
//     synergistMuscles: t.array(TMuscle),
//     types: t.array(TExerciseKind),
//   },
//   "TMusclesGeneratorResponse",
// );
// type IMuscleGeneratorResponse = t.TypeOf<typeof TMuscleGeneratorResponse>;

type IDayData = {
  week?: number;
  day: number;
  dayInWeek?: number;
};

// type IShortDayData = {
//   week: number;
//   dayInWeek: number;
// };
//
// type IDaySetData = {
//   week: number;
//   dayInWeek: number;
//   setVariation: number;
//   set: number;
// };

// Atomic types - these are versioned as a whole unit
// const ATOMIC_TYPES = [
//   "history_record",
//   "progress_ui",
//   "set",
//   "equipment_data",
//   "custom_exercise",
//   "planner",
//   "stat",
//   "graph",
//   "graphs",
//   "subscription_receipt",
//   "affiliate",
//   "muscle_groups_settings",
// ] as const;

// type IAtomicType = (typeof ATOMIC_TYPES)[number];

// Controlled types - these have specific fields that are versioned
// const CONTROLLED_TYPES = [
//   "program",
//   "gym",
//   "progress",
//   "history_entry",
// ] as const;

// type IControlledType = (typeof CONTROLLED_TYPES)[number];

// Define which fields to version for each controlled type
// const CONTROLLED_FIELDS: Record<IControlledType, readonly string[]> = {
//   program: ["name", "nextDay", "planner"] as const,
//   gym: ["name", "equipment"] as const,
//   progress: [
//     "entries",
//     "endTime",
//     "intervals",
//     "notes",
//     "deletedProgramExercises",
//     "userPromptedStateVars",
//     "updatedAt",
//     "changes",
//     "timerSince",
//     "timerMode",
//     "timer",
//     "timerEntryIndex",
//     "timerSetIndex",
//   ] as const,
//   history_entry: [
//     "exercise",
//     "sets",
//     "warmupSets",
//     "index",
//     "isSuppressed",
//     "programExerciseId",
//     "state",
//     "vars",
//     "notes",
//     "changed",
//     "superset",
//     "updatePrints",
//   ] as const,
// };

// Define id field for each type
// const TYPE_ID_MAPPING: Record<IAtomicType | IControlledType, string> = {
//   affiliate: "id",
//   program: "clonedAt",
//   history_record: "id",
//   set: "id",
//   progress_ui: "id",
//   history_entry: "id",
//   progress: "startTime",
//   gym: "id",
//   custom_exercise: "id",
//   stat: "timestamp",
//   equipment_data: "id",
//   planner: "name",
//   subscription_receipt: "id",
//   graph: "id",
//   graphs: "id",
//   muscle_groups_settings: "vtype",
// };

// Dictionary fields - these are free-form key-value mappings that should use collection versioning
// Full path from storage root
// const DICTIONARY_FIELDS = [
//   "settings.exercises",
//   "settings.exerciseData",
//   "settings.gyms.equipment",
//   "affiliates",
// ] as const;

// type IDictionaryFieldPath = (typeof DICTIONARY_FIELDS)[number];

// Fields excluded from syncing (local-only UI state)
// const EXCLUDED_FIELDS: Partial<Record<IControlledType, readonly string[]>> = {
//   progress: ["ui"] as const,
// };

// Storage-specific version configuration
// const STORAGE_VERSION_TYPES: IVersionTypes<IAtomicType, IControlledType> = {
//   atomicTypes: ATOMIC_TYPES,
//   controlledTypes: CONTROLLED_TYPES,
//   typeIdMapping: TYPE_ID_MAPPING,
//   controlledFields: CONTROLLED_FIELDS,
//   excludedFields: EXCLUDED_FIELDS,
//   dictionaryFields: DICTIONARY_FIELDS,
//   compactionThresholds: {
//     "subscription.apple": 14 * 24 * 60 * 60 * 1000, // 14 days
//     "subscription.google": 14 * 24 * 60 * 60 * 1000, // 14 days
//   },
//   typeValidators: {
//     progress: THistoryRecord,
//   },
// } as const;

//#endregion

//#region Program Exercise

export interface IWeightChange {
  originalWeight: IWeight | IPercentage;
  weight: IWeight | IPercentage;
  current: boolean;
}

// interface IProgramExerciseExample {
//   title: string;
//   description: string;
//   sets: IProgramSet[];
//   state: IProgramState;
//   finishDayExpr: string;
//   rules: {
//     sets: "keep" | "replace";
//     reps: "keep" | "keep_if_has_vars" | "replace";
//     weight: "keep" | "keep_if_has_vars" | "replace";
//   };
// }

// function ProgramExercise_hasUserPromptedVars(
//   programExercise: IPlannerProgramExercise,
// ): boolean {
//   const stateMetadata =
//     PlannerProgramExercise_getStateMetadata(programExercise) || {};
//   return ObjectUtils_keys(stateMetadata).some(
//     (key) => stateMetadata[key]?.userPrompted,
//   );
// }
//
// function ProgramExercise_getQuickAddSets(
//   programExercise: IPlannerProgramExercise,
// ): boolean {
//   return PlannerProgramExercise_sets(programExercise).some(
//     (set) => !!set.repRange?.isQuickAddSet,
//   );
// }

// function ProgramExercise_getEnableRpe(
//   programExercise: IPlannerProgramExercise,
// ): boolean {
//   return PlannerProgramExercise_sets(programExercise).some(
//     (set) => set.rpe != null,
//   );
// }

// function warmupSetToKey(set: IProgramExerciseWarmupSet): string {
//   return `${set.reps}-${Weight_print(set.threshold)}-${Weight_printOrNumber(set.value)}`;
// }

// function ProgramExercise_groupWarmupsSets(
//   sets: IProgramExerciseWarmupSet[],
// ): [IProgramExerciseWarmupSet, number][] {
//   let lastKey: string | undefined;
//   const groups: [IProgramExerciseWarmupSet, number][] = [];
//   for (const set of sets) {
//     const key = warmupSetToKey(set);
//     if (lastKey == null || lastKey !== key) {
//       groups.push([set, 0]);
//     }
//     groups[groups.length - 1][1] += 1;
//     lastKey = key;
//   }
//   return groups;
// }
//
// function ProgramExercise_approxTimeMs(
//   programExercise: IPlannerProgramExercise,
//   settings: ISettings,
// ): number {
//   return (
//     PlannerProgramExercise_currentEvaluatedSetVariation(
//       programExercise,
//     )?.sets.reduce(
//       (memo, set) => memo + ProgramSet_approxTimeMs(set, settings),
//       0,
//     ) || 0
//   );
// }

// function ProgramExercise_doesUse1RM(
//   programExercise: IPlannerProgramExercise,
// ): boolean {
//   const usesPercentageWeights = programExercise.evaluatedSetVariations.some(
//     (v) => {
//       return v.sets.some((set) => {
//         return (
//           Weight_isPct(set.weight) ||
//           ProgramSet_isEligibleForInferredWeight(set)
//         );
//       });
//     },
//   );
//   const usesRM1Var = ProgramExercise_isUsingVariable(programExercise, "rm1");
//   return usesPercentageWeights || usesRM1Var;
// }

// function ProgramExercise_doesUseRPE(
//   programExercise: IPlannerProgramExercise,
// ): boolean {
//   if (programExercise.globals.logRpe || programExercise.globals.rpe != null) {
//     return true;
//   }
//   return programExercise.evaluatedSetVariations.some((v) => {
//     return v.sets.some((set) => set.logRpe || set.rpe != null);
//   });
// }

// function ProgramExercise_isUsingVariable(
//   programExercise: IPlannerProgramExercise,
//   name: string,
// ): boolean {
//   const expressions = CollectionUtils_compact([
//     PlannerProgramExercise_getProgressScript(programExercise),
//     PlannerProgramExercise_getUpdateScript(programExercise),
//   ]);
//   return expressions.some((e) => ScriptRunner.hasKeyword(e, name));
// }

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

// function Stats_name(key: IStatsKey): string {
//   switch (key) {
//     case "bicepLeft":
//       return "Left Bicep";
//     case "bicepRight":
//       return "Right Bicep";
//     case "calfLeft":
//       return "Left Calf";
//     case "calfRight":
//       return "Right Calf";
//     case "chest":
//       return "Chest";
//     case "forearmLeft":
//       return "Left Forearm";
//     case "forearmRight":
//       return "Right Forearm";
//     case "hips":
//       return "Hips";
//     case "neck":
//       return "Neck";
//     case "shoulders":
//       return "Shoulders";
//     case "thighLeft":
//       return "Left Thigh";
//     case "thighRight":
//       return "Right Thigh";
//     case "waist":
//       return "Waist";
//     case "weight":
//       return "Bodyweight";
//     case "bodyfat":
//       return "Bodyfat";
//   }
// }

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

// function Stats_getCurrentBodyfat(stats: IStats): IPercentage | undefined {
//   const weights = CollectionUtils_sortBy(
//     stats.percentage.bodyfat || [],
//     "timestamp",
//     true,
//   );
//   return weights[0]?.value;
// }

export function Stats_getEmpty(): IStats {
  return {
    weight: {},
    percentage: {},
    length: {},
  };
}
//
// function Stats_isEmpty(stats: IStats): boolean {
//   const statsKeys: IStatsKey[] = [
//     ...ObjectUtils_keys(stats.weight).filter(
//       (k) => (stats.weight[k] || []).length > 0,
//     ),
//     ...ObjectUtils_keys(stats.percentage).filter(
//       (k) => (stats.percentage[k] || []).length > 0,
//     ),
//     ...ObjectUtils_keys(stats.length).filter(
//       (k) => (stats.length[k] || []).length > 0,
//     ),
//   ];
//   return statsKeys.length === 0;
// }

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
//
// interface IPlannerUiFocusedDay {
//   weekIndex: number;
//   dayInWeekIndex: number;
// }
//
// interface IPlannerUiFocusedExercise {
//   weekIndex: number;
//   dayIndex: number;
//   exerciseLine: number;
// }

// type IPlannerUiMode = "full" | "perday";
//
// interface IModalExerciseUi {
//   focusedExercise: IPlannerUiFocusedExercise;
//   types: IExerciseKind[];
//   muscleGroups: IScreenMuscle[];
//   exerciseType?: IExerciseType;
//   exerciseKey?: string;
//   fullName?: string;
//   customExerciseName?: string;
//   change?: "all" | "one" | "duplicate";
// }
//
// interface IExercisePickerUi {
//   state: IExercisePickerState;
//   dayData: IShortDayData;
//   exerciseKey?: string;
//   change: "all" | "one" | "duplicate";
// }

// interface IPlannerUi {
//   focusedExercise?: IPlannerUiFocusedExercise;
//   modalExercise?: IModalExerciseUi;
//   exercisePicker?: IExercisePickerUi;
//   exerciseUi: {
//     edit: Set<string>;
//     collapsed: Set<string>;
//   };
//   dayUi: {
//     collapsed: Set<string>;
//   };
//   weekUi: {
//     collapsed: Set<string>;
//   };
//   editExerciseModal?: {
//     plannerExercise: IPlannerProgramExercise;
//   };
//   previewExerciseModal?: {
//     plannerExercise: IPlannerProgramExercise;
//     day: number;
//   };
//   previewOneRepMaxModal?: {
//     plannerExercise: IPlannerProgramExercise;
//   };
//   previewEquipmentModal?: {
//     plannerExercise: IPlannerProgramExercise;
//   };
//   weekIndex: number;
//   showPictureExport?: boolean;
//   showWeekStats?: number;
//   showDayStats?: number;
//   showExerciseStats?: boolean;
//   showEditMuscleGroups?: boolean;
//   showMuscleGroupsOverride?: IExerciseType;
//   showPreview?: boolean;
//   fullTextError?: PlannerSyntaxError;
//   focusedDay?: IDayData & { key?: string };
//   showSettingsModal?: boolean;
//   tabIndex?: number;
//   mode?: "reorder" | "ui" | "perday" | "full";
// }
//
// interface IPlannerExerciseUiEditSetBottomSheet {
//   exerciseKey: string;
//   dayInWeekIndex: number;
//   setVariationIndex: number;
//   setIndex: number;
// }

// interface IPlannerExerciseUi {
//   modalExercise?: IModalExerciseUi;
//   exercisePickerState?: IExercisePickerState;
//   isProgressEnabled?: boolean;
//   isUpdateEnabled?: boolean;
//   showAddStateVariableModal?: boolean;
//   showEditProgressScriptModal?: boolean;
//   showEditUpdateScriptModal?: boolean;
//   weekIndex: number;
//   editSetBottomSheet?: IPlannerExerciseUiEditSetBottomSheet;
//   modeTabIndex?: number;
//   acrossWeeksTabIndex?: number;
//   pendingNewKey?: string;
//   fromWorkout?: boolean;
// }

// interface IPlannerFullText {
//   text: string;
//   currentLine?: number;
// }

// interface IPlannerState extends IUndoRedoState<{ program: IProgram }> {
//   id: string;
//   ui: IPlannerUi;
//   fulltext?: IPlannerFullText;
//   deviceId?: string;
//   initialEncodedProgram?: string;
//   encodedProgram?: string;
// }
//
// interface IPlannerExerciseState extends IUndoRedoState<{ program: IProgram }> {
//   ui: IPlannerExerciseUi;
// }
//
// interface IReuseCandidate {
//   exercise: IPlannerProgramExercise;
//   weekAndDays: Record<number, Set<number>>;
// }
//
// interface IExportedPlannerProgram {
//   type: "v2";
//   version: string;
//   id: string;
//   program: IPlannerProgram;
//   plannerSettings?: IPlannerSettings;
//   settings: IPlannerMainSettings;
// }

// interface IPlannerMainSettings {
//   exercises: IAllCustomExercises;
//   timer: number;
// }
//
// type IMuscleGroupSetSplit = { [key in IScreenMuscle]: ISetSplit };

// interface ISetResults {
//   volume: IWeight;
//   total: number;
//   strength: number;
//   hypertrophy: number;
//   upper: ISetSplit;
//   lower: ISetSplit;
//   core: ISetSplit;
//   push: ISetSplit;
//   pull: ISetSplit;
//   legs: ISetSplit;
//   muscleGroup: IMuscleGroupSetSplit;
// }

// interface ISetSplit {
//   strength: number;
//   hypertrophy: number;
//   exercises: {
//     dayIndex: number;
//     exerciseName: string;
//     isSynergist: boolean;
//     strengthSets: number;
//     hypertrophySets: number;
//   }[];
//   frequency: Partial<Record<number, true>>;
// }

// function focusedToStr(focused: IPlannerUiFocusedExercise): string {
//   return JSON.stringify(focused);
// }
//
// function focusedDayToStr(focused: IPlannerUiFocusedDay): string {
//   return JSON.stringify(focused);
// }
//
// function strToFocused(str: string): IPlannerUiFocusedExercise {
//   return JSON.parse(str);
// }

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
      // eslint-disable-next-line prefer-const
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
    // Check if the input array is empty
    if (numbers.length === 0) {
      return [];
    }

    const ranges: string[] = [];
    let rangeStart = numbers[0];
    let rangeEnd = numbers[0];

    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] === rangeEnd + 1) {
        // If the current number is consecutive, extend the current range
        rangeEnd = numbers[i];
      } else {
        // If not consecutive, add the current range to results and start a new range
        ranges.push(`${rangeStart}-${rangeEnd}`);
        rangeStart = numbers[i];
        rangeEnd = numbers[i];
      }
    }

    // Add the last range to results
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
      // eslint-disable-next-line prefer-const
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

  private evaluateProgram(expr: SyntaxNode): IPlannerExerciseEvaluatorWeek[] {
    if (expr.type.name === PlannerNodeName.Program) {
      this.weeks = [];
      this.exerciseIndex = 0;
      for (const child of getChildren(expr).filter(definedOnly)) {
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

// function PlannerEvaluator_getFirstError(evaluatedWeeks: IPlannerEvalResult[][]): PlannerSyntaxError | undefined {
//   let error: PlannerSyntaxError | undefined;
//   for (const week of evaluatedWeeks) {
//     for (const day of week) {
//       if (!day.success) {
//         error = day.error;
//       }
//     }
//   }
//   return error;
// }

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

// function PlannerEvaluator_changeExerciseName(
//   text: string,
//   from: string,
//   to: string,
//   settings: ISettings
// ): string {
//   const evaluator = new PlannerExerciseEvaluator(text, settings, "perday");
//   const tree = plannerExerciseParser.parse(text);
//   const result = evaluator.changeExerciseName(tree.topNode, from, to);
//   return result;
// }
//
// function PlannerEvaluator_getFullEvaluatedWeeks(
//   fullProgramText: string,
//   settings: ISettings
// ): {
//   evaluatedWeeks: IPlannerEvalFullResult;
//   metadata: IPlannerEvalMetadata;
// } {
//   let dayIndex = 0;
//   const metadata: IPlannerEvalMetadata = {
//     byExerciseWeekDay: {},
//     byWeekDayExercise: {},
//     fullNames: new Set(),
//     notused: new Set(),
//     properties: { progress: {}, update: {}, warmup: {}, id: {} },
//   };
//   const evaluator = new PlannerExerciseEvaluator(fullProgramText, settings, "full");
//   const tree = plannerExerciseParser.parse(fullProgramText);
//   const result = evaluator.evaluate(tree.topNode);
//   if (result.success) {
//     try {
//       for (let weekIndex = 0; weekIndex < result.data.length; weekIndex += 1) {
//         const week = result.data[weekIndex];
//         for (let dayInWeekIndex = 0; dayInWeekIndex < week.days.length; dayInWeekIndex += 1) {
//           const day = week.days[dayInWeekIndex];
//           const exercises = day.exercises;
//           for (const exercise of exercises) {
//             const dayData = { week: weekIndex + 1, dayInWeek: dayInWeekIndex + 1, day: dayIndex + 1 };
//             PlannerEvaluator_fillInMetadata(exercise, metadata, dayData);
//           }
//           dayIndex += 1;
//         }
//       }
//     } catch (e) {
//       if (e instanceof PlannerSyntaxError) {
//         return { evaluatedWeeks: { success: false, error: e }, metadata };
//       } else {
//         throw e;
//       }
//     }
//     return { evaluatedWeeks: result, metadata };
//   } else {
//     return { evaluatedWeeks: result, metadata };
//   }
// }

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

// function PlannerEvaluator_evaluateFull(
//   fullProgramText: string,
//   settings: ISettings
// ): { evaluatedWeeks: IPlannerEvalFullResult; exerciseFullNames: string[] } {
//   const { evaluatedWeeks, metadata } = PlannerEvaluator_getFullEvaluatedWeeks(fullProgramText, settings);
//   if (evaluatedWeeks.success) {
//     const perDayEvaluatedWeeks = PlannerProgram_fullToWeekEvalResult(evaluatedWeeks);
//     PlannerEvaluator_postProcess(perDayEvaluatedWeeks, settings, metadata);
//     for (const week of perDayEvaluatedWeeks) {
//       for (const day of week) {
//         if (!day.success) {
//           return {
//             evaluatedWeeks: { success: false, error: day.error },
//             exerciseFullNames: Array.from(metadata.fullNames),
//           };
//         }
//       }
//     }
//   }
//   return { evaluatedWeeks, exerciseFullNames: Array.from(metadata.fullNames) };
// }

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
// type ILinearProgressionType = {
//   type: "linear";
//   increase: IWeight | IPercentage;
//   successesRequired?: number;
//   successesCounter?: number;
//   decrease?: IWeight | IPercentage;
//   failuresRequired?: number;
//   failuresCounter?: number;
// };
// type IDoubleProgressionType = {
//   type: "double";
//   increase: IWeight | IPercentage;
//   minReps: number;
//   maxReps: number;
// };
// type ISumRepsProgressionType = {
//   type: "sumreps";
//   increase: IWeight | IPercentage;
//   reps: number;
// };
// type ICustomProgressionType = {
//   type: "custom";
// };
// type IProgressionType =
//   | ILinearProgressionType
//   | IDoubleProgressionType
//   | ISumRepsProgressionType
//   | ICustomProgressionType;
//
// function PlannerProgramExercise_numberOfSets(
//   exercise: IPlannerProgramExercise,
// ): number {
//   return PlannerProgramExercise_sets(exercise).reduce(
//     (acc, set) => acc + (set.repRange?.numberOfSets || 0),
//     0,
//   );
// }

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

// function PlannerProgramExercise_toUsed(
//   exercise?: IPlannerProgramExercise,
// ): IPlannerProgramExerciseWithType | undefined {
//   if (exercise?.exerciseType != null) {
//     return exercise as IPlannerProgramExerciseWithType;
//   } else {
//     return undefined;
//   }
// }

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

// function PlannerProgramExercise_defaultWarmups(
//   exercise: IExercise,
//   settings: ISettings,
// ): IPlannerProgramExerciseWarmupSet[] {
//   const warmupSets =
//     (exercise?.defaultWarmup &&
//       warmupValues(settings.units)[exercise.defaultWarmup]) ||
//     [];
//   const result: IPlannerProgramExerciseWarmupSet[] = [];
//   if (warmupSets) {
//     const groups = ProgramExercise_groupWarmupsSets(warmupSets);
//     for (const group of groups) {
//       const first = group[0];
//       const length = group[1];
//       result.push({
//         type: "warmup",
//         numberOfSets: length,
//         reps: first.reps,
//         percentage:
//           typeof first.value === "number"
//             ? first.value * 100
//             : first.value.value,
//       });
//     }
//   }
//   return result;
// }

// function PlannerProgramExercise_repeatToRangeStr(
//   plannerExercise: IPlannerProgramExercise,
// ): string {
//   const repeat = plannerExercise.repeating;
//   const ranges: [number, number][] = [];
//   for (const rep of repeat) {
//     if (ranges.length === 0) {
//       ranges.push([rep, rep]);
//     }
//     const lastRep = ranges[ranges.length - 1][1];
//     if (rep <= lastRep + 1) {
//       ranges[ranges.length - 1][1] = rep;
//     } else {
//       ranges.push([rep, rep]);
//     }
//   }
//   return ranges.map((r) => `${r[0]}-${r[1]}`).join(", ");
// }

// function PlannerProgramExercise_warmupSetsToDisplaySets(
//   sets: IPlannerProgramExerciseWarmupSet[],
// ): IDisplaySet[][] {
//   const displaySets: IDisplaySet[] = [];
//   for (const set of sets) {
//     for (let setIndex = 0; setIndex < (set.numberOfSets || 0); setIndex++) {
//       const weight =
//         set.percentage != null
//           ? `${set.percentage}%`
//           : set.weight?.value != null
//             ? set.weight.value.toString()
//             : `${Math.round(Weight_rpeMultiplier(set.reps, 10) * 100)}%`;
//       displaySets.push({
//         reps: `${set.reps}`,
//         weight: weight,
//       });
//     }
//   }
//
//   return groupDisplaySets(displaySets);
// }

// function PlannerProgramExercise_uniqueKey(
//   exercise: IPlannerProgramExercise,
// ): string {
//   return `${exercise.key}-${exercise.dayData.week}-${exercise.dayData.dayInWeek}`;
// }
//
// function PlannerProgramExercise_uniqueSetKey(
//   set: IPlannerProgramExerciseEvaluatedSet,
// ): string {
//   return `${set.minrep}-${set.maxrep}-${set.isAmrap}-${set.weight?.value}${set.weight?.unit}${set.askWeight}-${set.rpe}${set.logRpe}-${set.timer}`;
// }
//
// function PlannerProgramExercise_evaluatedSetsToDisplaySets(
//   sets: IPlannerProgramExerciseEvaluatedSet[],
//   settings: ISettings,
// ): IDisplaySet[][] {
//   const displaySets: IDisplaySet[] = [];
//   for (const set of sets) {
//     const weight = set.weight ? Weight_display(set.weight, false) : undefined;
//     const unit = set.weight?.unit || settings.units;
//     displaySets.push({
//       dimReps: false,
//       dimRpe: !set.logRpe,
//       dimWeight: !set.weight,
//       dimTimer: set.timer == null,
//       reps: `${set.minrep != null ? `${set.minrep}-${set.maxrep}` : `${set.maxrep}`}${set.isAmrap ? "+" : ""}`,
//       rpe: set.rpe?.toString(),
//       weight,
//       unit,
//       askWeight: set.askWeight,
//       timer: set.timer,
//     });
//   }
//   return groupDisplaySets(displaySets);
// }

// function PlannerProgramExercise_setsToDisplaySets(
//   sets: IPlannerProgramExerciseSet[],
//   hasCurrentSets: boolean,
//   globals: IPlannerProgramExerciseGlobals,
//   settings: ISettings,
// ): IDisplaySet[][] {
//   const displaySets: IDisplaySet[] = [];
//   for (const set of sets) {
//     for (
//       let setIndex = 0;
//       setIndex < (set.repRange?.numberOfSets || 0);
//       setIndex++
//     ) {
//       const minReps = set.repRange?.minrep;
//       const maxReps = set.repRange?.maxrep || 0;
//       const weight =
//         set.percentage != null
//           ? `${set.percentage}%`
//           : set.weight?.value != null
//             ? set.weight.value.toString()
//             : undefined;
//       const unit =
//         set.percentage == null ? set.weight?.unit || settings.units : undefined;
//       displaySets.push({
//         dimReps: !hasCurrentSets,
//         dimRpe: !hasCurrentSets && globals.rpe == null,
//         dimWeight:
//           !hasCurrentSets &&
//           globals.weight == null &&
//           globals.percentage == null,
//         dimTimer: !hasCurrentSets && globals.timer == null,
//         reps: `${minReps != null ? `${minReps}-` : ""}${maxReps}${set.repRange?.isAmrap ? "+" : ""}`,
//         rpe: set.rpe?.toString(),
//         weight: weight,
//         unit,
//         askWeight: set.askWeight,
//         timer: set.timer,
//       });
//     }
//   }
//
//   return groupDisplaySets(displaySets);
// }

// function PlannerProgramExercise_degroupWarmupSets(
//   warmupSets: IPlannerProgramExerciseWarmupSet[],
// ): IPlannerProgramExerciseWarmupSet[] {
//   return warmupSets.reduce<IPlannerProgramExerciseWarmupSet[]>((acc, set) => {
//     for (let i = 0; i < set.numberOfSets; i++) {
//       acc.push({ ...set, numberOfSets: 1 });
//     }
//     return acc;
//   }, []);
// }

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
//
// function PlannerProgramExercise_currentDescription(
//   exercise: IPlannerProgramExercise,
// ): string | undefined {
//   const index = PlannerProgramExercise_currentDescriptionIndex(exercise);
//   return exercise.descriptions.values[index]?.value;
// }
//
// function PlannerProgramExercise_addSet(
//   ex: IPlannerProgramExercise,
//   setVariationIndex: number,
//   settings: ISettings,
// ): IPlannerProgramExercise {
//   const evaluatedSetVariation = ex.evaluatedSetVariations[setVariationIndex];
//   let lastEvaluatedSet =
//     evaluatedSetVariation.sets[evaluatedSetVariation.sets.length - 1];
//   if (lastEvaluatedSet) {
//     evaluatedSetVariation.sets = [
//       ...evaluatedSetVariation.sets,
//       structuredClone(lastEvaluatedSet),
//     ];
//   } else {
//     const originalSets = PlannerProgramExercise_sets(ex, setVariationIndex);
//     const lastSet = originalSets[originalSets.length - 1];
//     if (lastSet) {
//       lastEvaluatedSet = {
//         maxrep: lastSet.repRange?.maxrep || 1,
//         minrep: lastSet.repRange?.minrep,
//         weight: lastSet.weight || Weight_zero,
//         logRpe: lastSet.logRpe || false,
//         isAmrap: lastSet.repRange?.isAmrap || false,
//         isQuickAddSet: lastSet.repRange?.isQuickAddSet || false,
//         askWeight: lastSet.askWeight || false,
//         rpe: lastSet.rpe,
//         timer: lastSet.timer,
//         label: lastSet.label,
//       };
//       evaluatedSetVariation.sets = [
//         ...evaluatedSetVariation.sets,
//         structuredClone(lastEvaluatedSet),
//       ];
//     } else {
//       evaluatedSetVariation.sets = [
//         ...evaluatedSetVariation.sets,
//         {
//           maxrep: 5,
//           weight: Weight_build(100, settings.units),
//           isAmrap: false,
//           logRpe: false,
//           askWeight: false,
//           isQuickAddSet: false,
//         },
//       ];
//     }
//   }
//   return ex;
// }

function PlannerProgramExercise_currentDescriptionIndex(
  exercise: IPlannerProgramExercise,
): number {
  const index = exercise.descriptions.values.findIndex((d) => d.isCurrent);
  return index === -1 ? 0 : index;
}

// function PlannerProgramExercise_numberOfSetsThisWeek(
//   exerciseName: string,
//   week: IPlannerEvalResult[],
// ): number {
//   return week.reduce((acc, days) => {
//     if (days.success) {
//       const numberOfSetsThisDay = days.data
//         .filter((e) => e.name === exerciseName)
//         .reduce((acc2, e) => acc2 + PlannerProgramExercise_numberOfSets(e), 0);
//       return acc + numberOfSetsThisDay;
//     } else {
//       return acc;
//     }
//   }, 0);
// }

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

// function PlannerProgramExercise_isReusingSetsProgress(
//   exercise: IPlannerProgramExercise,
// ): boolean {
//   const reuseExercise = exercise.reuse?.exercise;
//   return (
//     reuseExercise?.progress != null &&
//     exercise.progress != null &&
//     exercise.progress.type === reuseExercise.progress?.type &&
//     (exercise.progress.reuse?.fullName === reuseExercise.fullName ||
//       exercise.progress.script === reuseExercise.progress.script) &&
//     Object.keys(PlannerProgramExercise_getOnlyChangedState(exercise)).length ===
//       0
//   );
// }

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

// function PlannerProgramExercise_getEnableRpe(
//   exercise: IPlannerProgramExercise,
// ): boolean {
//   return exercise.setVariations.some((sv, i) =>
//     PlannerProgramExercise_sets(exercise, i).some((s) => s.rpe != null),
//   );
// }
//
// function PlannerProgramExercise_getEnableRepRanges(
//   exercise: IPlannerProgramExercise,
// ): boolean {
//   return exercise.setVariations.some((sv, i) =>
//     PlannerProgramExercise_sets(exercise, i).some(
//       (s) => s.repRange != null && s.repRange.minrep === s.repRange.maxrep,
//     ),
//   );
// }
//
// function PlannerProgramExercise_getProgressDefaultArgs(
//   type: IProgramExerciseProgressType,
// ): string[] {
//   switch (type) {
//     case "none":
//       return [];
//     case "lp":
//       return ["5lb"];
//     case "dp":
//       return ["5lb", "8", "12"];
//     case "sum":
//       return ["30", "5lb"];
//     case "custom":
//       return [];
//   }
// }

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

// function PlannerProgramExercise_progressionType(
//   exercise: IPlannerProgramExercise,
// ): IProgressionType | undefined {
//   const progress = exercise.progress;
//   if (!progress) {
//     return undefined;
//   }
//   const name = progress.type;
//   const state = PlannerProgramExercise_getState(exercise);
//   if (name === "lp") {
//     return {
//       type: "linear",
//       increase: state.increment as IWeight,
//       successesRequired: state.successes as number,
//       successesCounter: state.successCounter as number,
//       decrease: state.decrement as IWeight,
//       failuresRequired: state.failures as number,
//       failuresCounter: state.failureCounter as number,
//     };
//   } else if (name === "dp") {
//     return {
//       type: "double",
//       increase: state.increment as IWeight,
//       minReps: state.minReps as number,
//       maxReps: state.maxReps as number,
//     };
//   } else if (name === "sum") {
//     return {
//       type: "sumreps",
//       increase: state.increment as IWeight,
//       reps: state.reps as number,
//     };
//   } else if (name === "custom") {
//     return { type: "custom" };
//   }
//   return undefined;
// }

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

// function PlannerProgramExercise_createExerciseFromEntry(
//   entry: IHistoryEntry,
//   dayData: Required<IDayData>,
//   settings: ISettings,
//   index: number,
// ): IPlannerProgramExercise {
//   const exerciseType = entry.exercise;
//   const exercise = Exercise_get(exerciseType, settings.exercises);
//   const fullName = Exercise_fullName(exercise, settings);
//   const shortName = PlannerProgramExercise_shortNameFromFullName(
//     fullName,
//     settings,
//   );
//   const { name, equipment } = PlannerExerciseEvaluator.extractNameParts(
//     fullName,
//     settings.exercises,
//   );
//   const setVariations: IPlannerProgramExerciseSetVariation[] = [
//     {
//       isCurrent: false,
//       sets: entry.sets.map((set) => ({
//         repRange: {
//           numberOfSets: 1,
//           maxrep: set.completedReps ?? set.reps,
//           minrep: set.minReps,
//           isAmrap: !!set.isAmrap,
//           isQuickAddSet: false,
//         },
//         timer: set.timer,
//         rpe: set.rpe,
//         logRpe: set.logRpe,
//         percentage: Weight_isPct(set.originalWeight)
//           ? set.originalWeight.value
//           : undefined,
//         weight: !Weight_isPct(set.originalWeight)
//           ? (set.completedWeight ?? set.weight)
//           : undefined,
//         askWeight: set.askWeight,
//       })),
//     },
//   ];
//   const groupedWarmupSets = CollectionUtils_compact(
//     ObjectUtils_values(
//       CollectionUtils_groupByExpr(entry.warmupSets, (set) => {
//         return `${set.completedReps ?? set.reps}-${(set.completedWeight ?? set.weight ?? { value: "" }).value}`;
//       }),
//     ),
//   );
//   const plannerExercise: IPlannerProgramExercise = {
//     id: UidFactory_generateUid(8),
//     key: PlannerKey_fromExerciseType(exercise),
//     fullName,
//     shortName,
//     dayData,
//     exerciseType,
//     repeat: [],
//     repeating: [],
//     exerciseIndex: index,
//     order: 0,
//     text: "",
//     tags: [],
//     equipment,
//     name,
//     line: 1,
//     evaluatedSetVariations: [],
//     setVariations: setVariations,
//     warmupSets: groupedWarmupSets.map((group) => ({
//       type: "warmup",
//       numberOfSets: group.length,
//       reps: group[0]?.completedReps ?? group[0]?.reps ?? 1,
//       weight: group[0]?.completedWeight ?? group[0]?.weight,
//     })),
//     descriptions: { values: [] },
//     globals: {},
//     points: {
//       fullName: { line: 1, offset: 0, from: 0, to: 0 },
//     },
//   };
//   const evaluatedSetVariations = PlannerProgramExercise_evaluateSetVariations(
//     plannerExercise,
//     setVariations,
//   );
//   plannerExercise.evaluatedSetVariations = evaluatedSetVariations;
//   return plannerExercise;
// }

//#endregion

//#region Program Set
// function ProgramSet_group(sets: IProgramSet[]): IProgramSet[][] {
//   return sets.reduce<IProgramSet[][]>(
//     (memo, set) => {
//       let lastGroup = memo[memo.length - 1];
//       const last = lastGroup[lastGroup.length - 1];
//       if (
//         last != null &&
//         (last.weightExpr !== set.weightExpr ||
//           last.repsExpr !== set.repsExpr ||
//           last.isAmrap !== set.isAmrap ||
//           last.rpeExpr !== set.rpeExpr ||
//           last.logRpe !== set.logRpe)
//       ) {
//         memo.push([]);
//         lastGroup = memo[memo.length - 1];
//       }
//       lastGroup.push(set);
//       return memo;
//     },
//     [[]]
//   );
// }
//
// function ProgramSet_approxTimeMs(set: IPlannerProgramExerciseEvaluatedSet, settings: ISettings): number {
//   const reps = set.maxrep;
//   const secondsPerRep = 7;
//   const prepareTime = 20;
//   const timeToRep = (prepareTime + (reps ?? 0) * secondsPerRep) * 1000;
//   const timeToRest = (settings.timers.workout || 0) * 1000;
//   const totalTime = timeToRep + timeToRest;
//   return totalTime;
// }

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

// const metadata: Record<IExerciseId, IMetaExercises> = {
//   abWheel: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: [
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Deltoid Posterior",
//       "Latissimus Dorsi",
//       "Pectineous",
//       "Pectoralis Major Sternal Head",
//       "Sartorius",
//       "Serratus Anterior",
//       "Tensor Fasciae Latae",
//       "Teres Major",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["bodyweight"],
//   },
//   arnoldPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["dumbbell", "kettlebell"],
//   },
//   aroundTheWorld: {
//     targetMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Lateral", "Deltoid Posterior", "Latissimus Dorsi", "Serratus Anterior"],
//     bodyParts: ["Chest", "Shoulders"],
//     sortedEquipment: ["dumbbell"],
//   },
//   backExtension: {
//     targetMuscles: ["Erector Spinae"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight", "leverageMachine"],
//   },
//   ballSlams: {
//     targetMuscles: [
//       "Infraspinatus",
//       "Latissimus Dorsi",
//       "Teres Major",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Rectus Abdominis"],
//     bodyParts: ["Back"],
//     sortedEquipment: ["medicineball"],
//   },
//   battleRopes: {
//     targetMuscles: ["Deltoid Posterior"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Lateral",
//       "Infraspinatus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["bodyweight"],
//   },
//   behindTheNeckPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   benchDip: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [
//       "Deltoid Anterior",
//       "Latissimus Dorsi",
//       "Levator Scapulae",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//       "Serratus Anterior",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["bodyweight"],
//   },
//   benchPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "smith", "band", "kettlebell"],
//   },
//   benchPressCloseGrip: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Pectoralis Major Sternal Head"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "ezbar", "smith"],
//   },
//   benchPressWideGrip: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell", "smith"],
//   },
//   bentOverOneArmRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Infraspinatus",
//       "Teres Major",
//       "Teres Minor",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Pectoralis Major Sternal Head",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["dumbbell"],
//   },
//   bentOverRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "band", "leverageMachine", "smith"],
//   },
//   bicepCurl: {
//     targetMuscles: ["Biceps Brachii"],
//     synergistMuscles: ["Brachialis", "Brachioradialis"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "dumbbell", "band", "leverageMachine", "cable", "ezbar"],
//   },
//   bicycleCrunch: {
//     targetMuscles: ["Obliques", "Rectus Abdominis"],
//     synergistMuscles: ["Gluteus Maximus", "Iliopsoas", "Quadriceps"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   boxJump: {
//     targetMuscles: ["Quadriceps", "Gluteus Maximus", "Gastrocnemius", "Soleus"],
//     synergistMuscles: ["Hamstrings", "Adductor Magnus", "Erector Spinae", "Rectus Abdominis"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   boxSquat: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   bulgarianSplitSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Hips", "Thighs"],
//     sortedEquipment: ["dumbbell"],
//   },
//   burpee: {
//     targetMuscles: [
//       "Quadriceps",
//       "Gluteus Maximus",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//       "Triceps Brachii",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//       "Rectus Abdominis",
//     ],
//     synergistMuscles: [
//       "Hamstrings",
//       "Biceps Brachii",
//       "Brachialis",
//       "Latissimus Dorsi",
//       "Obliques",
//       "Erector Spinae",
//       "Obliques",
//       "Soleus",
//       "Gastrocnemius",
//       "Tibialis Anterior",
//     ],
//     bodyParts: ["Chest", "Shoulders", "Upper Arms", "Waist", "Thighs"],
//     sortedEquipment: ["bodyweight"],
//   },
//   cableCrossover: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Latissimus Dorsi", "Levator Scapulae", "Pectoralis Major Clavicular Head"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["cable"],
//   },
//   cableCrunch: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Obliques"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["cable"],
//   },
//   cableKickback: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["cable"],
//   },
//   cablePullThrough: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["cable"],
//   },
//   cableTwist: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: [
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Adductor Magnus",
//       "Erector Spinae",
//       "Gluteus Medius",
//       "Iliopsoas",
//       "Tensor Fasciae Latae",
//     ],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["barbell", "bodyweight", "cable", "leverageMachine", "band"],
//   },
//   calfPressOnLegPress: {
//     targetMuscles: ["Gastrocnemius"],
//     synergistMuscles: ["Soleus"],
//     bodyParts: ["Calves"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   calfPressOnSeatedLegPress: {
//     targetMuscles: ["Gastrocnemius"],
//     synergistMuscles: ["Soleus"],
//     bodyParts: ["Calves"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   chestDip: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: [
//       "Deltoid Anterior",
//       "Latissimus Dorsi",
//       "Levator Scapulae",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Teres Major",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["bodyweight"],
//   },
//   chestFly: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Biceps Brachii", "Deltoid Anterior", "Pectoralis Major Clavicular Head"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "leverageMachine"],
//   },
//   chestPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["leverageMachine", "band"],
//   },
//   chestSupportedRow: {
//     targetMuscles: ["Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Latissimus Dorsi",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   chinUp: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Levator Scapulae",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["leverageMachine", "bodyweight"],
//   },
//   clean: {
//     targetMuscles: [
//       "Gluteus Maximus",
//       "Hamstrings",
//       "Quadriceps",
//       "Latissimus Dorsi",
//       "Trapezius Lower Fibers",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//     ],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Gastrocnemius",
//       "Soleus",
//       "Erector Spinae",
//       "Biceps Brachii",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//       "Wrist Flexors",
//     ],
//     bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   cleanandJerk: {
//     targetMuscles: [
//       "Gluteus Maximus",
//       "Hamstrings",
//       "Quadriceps",
//       "Latissimus Dorsi",
//       "Trapezius Lower Fibers",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//     ],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Gastrocnemius",
//       "Soleus",
//       "Erector Spinae",
//       "Biceps Brachii",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//       "Wrist Flexors",
//     ],
//     bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   concentrationCurl: {
//     targetMuscles: ["Brachialis"],
//     synergistMuscles: ["Biceps Brachii", "Brachioradialis"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "dumbbell", "band", "cable"],
//   },
//   crossBodyCrunch: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Iliopsoas", "Rectus Abdominis"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   crunch: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Obliques"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["cable", "bodyweight", "leverageMachine"],
//   },
//   cycling: {
//     targetMuscles: ["Quadriceps", "Hamstrings", "Gluteus Maximus", "Gastrocnemius", "Soleus", "Tibialis Anterior"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Adductor Longus",
//       "Adductor Brevis",
//       "Iliopsoas",
//       "Erector Spinae",
//       "Rectus Abdominis",
//       "Obliques",
//     ],
//     bodyParts: ["Hips", "Thighs", "Calves", "Shins", "Back", "Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   deadlift: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Hamstrings", "Quadriceps", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "leverageMachine", "smith", "band", "kettlebell", "bodyweight"],
//   },
//   deadliftHighPull: {
//     targetMuscles: ["Deltoid Lateral", "Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Anterior",
//       "Gastrocnemius",
//       "Infraspinatus",
//       "Soleus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   declineBenchPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["dumbbell", "smith"],
//   },
//   declineCrunch: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Obliques"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   deficitDeadlift: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Erector Spinae", "Hamstrings", "Quadriceps", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "trapbar"],
//   },
//   ellipticalMachine: {
//     targetMuscles: [],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//       "Gluteus Maximus",
//       "Hamstrings",
//       "Latissimus Dorsi",
//       "Levator Scapulae",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//       "Quadriceps",
//       "Serratus Anterior",
//     ],
//     bodyParts: ["Hips", "Thighs", "Back", "Shoulders"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   facePull: {
//     targetMuscles: ["Deltoid Posterior"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Lateral",
//       "Infraspinatus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["band"],
//   },
//   flatKneeRaise: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: ["Adductor Brevis", "Adductor Longus", "Pectineous", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   flatLegRaise: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: [
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Pectineous",
//       "Quadriceps",
//       "Sartorius",
//       "Tensor Fasciae Latae",
//     ],
//     bodyParts: ["Hips", "Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   frontRaise: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "bodyweight", "band"],
//   },
//   gluteBridge: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Quadriceps"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["band", "barbell", "dumbbell"],
//   },
//   gluteBridgeMarch: {
//     targetMuscles: ["Gluteus Maximus", "Rectus Abdominis"],
//     synergistMuscles: ["Hamstrings", "Quadriceps", "Sartorius"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   gluteKickback: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus"],
//     bodyParts: ["Glute"],
//     sortedEquipment: ["leverageMachine", "bodyweight", "cable", "band"],
//   },
//   frontSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "kettlebell", "dumbbell", "cable", "smith"],
//   },
//   gobletSquat: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["kettlebell", "dumbbell"],
//   },
//   goodMorning: {
//     targetMuscles: ["Hamstrings"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "smith", "leverageMachine"],
//   },
//   hackSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "smith"],
//   },
//   hammerCurl: {
//     targetMuscles: ["Brachioradialis"],
//     synergistMuscles: ["Biceps Brachii", "Brachialis"],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["cable", "dumbbell", "band"],
//   },
//   handstandPushUp: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["bodyweight"],
//   },
//   hangClean: {
//     targetMuscles: ["Biceps Brachii", "Brachialis", "Brachioradialis"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head"],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["kettlebell"],
//   },
//   hangSnatch: {
//     targetMuscles: [
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Trapezius Upper Fibers",
//       "Quadriceps",
//       "Gluteus Maximus",
//     ],
//     synergistMuscles: [
//       "Hamstrings",
//       "Erector Spinae",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//       "Latissimus Dorsi",
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Gastrocnemius",
//       "Soleus",
//       "Obliques",
//       "Rectus Abdominis",
//     ],
//     bodyParts: ["Thighs", "Back", "Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   hangingLegRaise: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: ["Adductor Brevis", "Adductor Longus", "Pectineous", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "cable"],
//   },
//   highKneeSkips: {
//     targetMuscles: ["Quadriceps", "Hamstrings", "Gluteus Maximus"],
//     synergistMuscles: [
//       "Iliopsoas",
//       "Gastrocnemius",
//       "Soleus",
//       "Tibialis Anterior",
//       "Rectus Abdominis",
//       "Obliques",
//       "Adductor Magnus",
//       "Adductor Brevis",
//       "Adductor Longus",
//     ],
//     bodyParts: ["Thighs", "Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   highRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Erector Spinae",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   hipAbductor: {
//     targetMuscles: ["Gluteus Maximus", "Gluteus Medius"],
//     synergistMuscles: ["Tensor Fasciae Latae"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["leverageMachine", "bodyweight", "cable", "band"],
//   },
//   hipAdductor: {
//     targetMuscles: ["Adductor Brevis", "Adductor Longus", "Adductor Magnus"],
//     synergistMuscles: ["Pectineous"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["leverageMachine", "cable", "band", "bodyweight"],
//   },
//   hipThrust: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Quadriceps"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "leverageMachine", "band", "bodyweight"],
//   },
//   inclineBenchPress: {
//     targetMuscles: ["Pectoralis Major Clavicular Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Sternal Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "smith"],
//   },
//   inclineBenchPressWideGrip: {
//     targetMuscles: ["Pectoralis Major Clavicular Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Sternal Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell"],
//   },
//   inclineChestFly: {
//     targetMuscles: ["Pectoralis Major Clavicular Head"],
//     synergistMuscles: ["Biceps Brachii", "Deltoid Anterior", "Pectoralis Major Sternal Head"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["cable", "dumbbell"],
//   },
//   inclineChestPress: {
//     targetMuscles: ["Pectoralis Major Clavicular Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Sternal Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["leverageMachine", "band", "dumbbell"],
//   },
//   inclineCurl: {
//     targetMuscles: ["Biceps Brachii"],
//     synergistMuscles: ["Brachialis", "Brachioradialis"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["dumbbell"],
//   },
//   inclineRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   invertedRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Infraspinatus",
//       "Teres Major",
//       "Teres Minor",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Pectoralis Major Sternal Head",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["bodyweight"],
//   },
//   isoLateralChestPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["dumbbell"],
//   },
//   isoLateralRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["dumbbell"],
//   },
//   jackknifeSitUp: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Iliopsoas", "Obliques", "Quadriceps", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   jumpRope: {
//     targetMuscles: ["Soleus", "Gastrocnemius", "Quadriceps", "Hamstrings"],
//     synergistMuscles: ["Gluteus Maximus", "Rectus Abdominis", "Obliques", "Tibialis Anterior"],
//     bodyParts: ["Thighs", "Calves"],
//     sortedEquipment: ["bodyweight"],
//   },
//   jumpSquat: {
//     targetMuscles: ["Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gastrocnemius", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "bodyweight"],
//   },
//   jumpingJack: {
//     targetMuscles: [
//       "Gluteus Maximus",
//       "Quadriceps",
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Adductor Magnus",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//     ],
//     synergistMuscles: [
//       "Gastrocnemius",
//       "Soleus",
//       "Hamstrings",
//       "Rectus Abdominis",
//       "Obliques",
//       "Trapezius Upper Fibers",
//       "Serratus Anterior",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["bodyweight"],
//   },
//   kettlebellSwing: {
//     targetMuscles: ["Deltoid Anterior", "Gluteus Maximus"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Hamstrings",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Soleus",
//     ],
//     bodyParts: ["Hips", "Shoulders"],
//     sortedEquipment: ["dumbbell", "kettlebell"],
//   },
//   kettlebellTurkishGetUp: {
//     targetMuscles: ["Deltoid Anterior", "Deltoid Lateral", "Deltoid Posterior", "Quadriceps", "Gluteus Maximus"],
//     synergistMuscles: [
//       "Obliques",
//       "Rectus Abdominis",
//       "Latissimus Dorsi",
//       "Hamstrings",
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Adductor Magnus",
//       "Triceps Brachii",
//       "Erector Spinae",
//       "Serratus Anterior",
//     ],
//     bodyParts: ["Hips", "Shoulders"],
//     sortedEquipment: ["kettlebell"],
//   },
//   kippingPullUp: {
//     targetMuscles: [
//       "Latissimus Dorsi",
//       "Brachialis",
//       "Biceps Brachii",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     synergistMuscles: [
//       "Deltoid Posterior",
//       "Brachioradialis",
//       "Pectoralis Major Sternal Head",
//       "Rectus Abdominis",
//       "Obliques",
//       "Iliopsoas",
//       "Tensor Fasciae Latae",
//       "Adductor Longus",
//       "Adductor Brevis",
//       "Erector Spinae",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["bodyweight"],
//   },
//   kneeRaise: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: ["Adductor Brevis", "Adductor Longus", "Pectineous", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   kneelingPulldown: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Levator Scapulae",
//       "Pectoralis Major Sternal Head",
//       "Serratus Anterior",
//       "Teres Major",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["band"],
//   },
//   kneestoElbows: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: [
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Iliopsoas",
//       "Obliques",
//       "Pectineous",
//       "Sartorius",
//       "Tensor Fasciae Latae",
//     ],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   latPulldown: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Levator Scapulae",
//       "Teres Major",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   lateralBoxJump: {
//     targetMuscles: ["Gluteus Maximus", "Quadriceps", "Hamstrings"],
//     synergistMuscles: [
//       "Adductor Brevis",
//       "Adductor Longus",
//       "Adductor Magnus",
//       "Gluteus Medius",
//       "Tensor Fasciae Latae",
//       "Rectus Abdominis",
//       "Obliques",
//       "Deltoid Anterior",
//       "Deltoid Posterior",
//       "Deltoid Lateral",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["bodyweight"],
//   },
//   lateralRaise: {
//     targetMuscles: ["Deltoid Lateral"],
//     synergistMuscles: ["Deltoid Anterior", "Serratus Anterior", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["cable", "dumbbell", "leverageMachine", "band", "kettlebell"],
//   },
//   legsUpBenchPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell"],
//   },
//   legCurl: {
//     targetMuscles: ["Hamstrings"],
//     synergistMuscles: ["Gastrocnemius", "Sartorius"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   legExtension: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: [],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["leverageMachine", "band"],
//   },
//   legPress: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["smith", "leverageMachine"],
//   },
//   lunge: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell", "bodyweight", "cable"],
//   },
//   lyingBicepCurl: {
//     targetMuscles: ["Biceps Brachii"],
//     synergistMuscles: ["Brachialis", "Brachioradialis"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "dumbbell", "band", "leverageMachine", "cable", "ezbar"],
//   },
//   lyingLegCurl: {
//     targetMuscles: ["Hamstrings"],
//     synergistMuscles: ["Gastrocnemius", "Sartorius"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["leverageMachine", "band"],
//   },
//   mountainClimber: {
//     targetMuscles: ["Iliopsoas"],
//     synergistMuscles: ["Adductor Brevis", "Adductor Longus", "Pectineous", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   muscleUp: {
//     targetMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Latissimus Dorsi",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     synergistMuscles: [],
//     bodyParts: ["Back"],
//     sortedEquipment: ["bodyweight"],
//   },
//   obliqueCrunch: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Rectus Abdominis"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   overheadPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell", "dumbbell", "ezbar"],
//   },
//   overheadSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   pecDeck: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Pectoralis Major Clavicular Head", "Serratus Anterior"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   pendlayRow: {
//     targetMuscles: [
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Latissimus Dorsi",
//       "Teres Major",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     synergistMuscles: ["Brachialis", "Brachioradialis", "Pectoralis Major Sternal Head"],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell"],
//   },
//   pistolSquat: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["kettlebell", "leverageMachine", "bodyweight"],
//   },
//   plank: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: [],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   powerClean: {
//     targetMuscles: ["Quadriceps", "Gluteus Maximus", "Deltoid Anterior"],
//     synergistMuscles: [
//       "Hamstrings",
//       "Gastrocnemius",
//       "Soleus",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Trapezius Upper Fibers",
//       "Latissimus Dorsi",
//       "Erector Spinae",
//       "Biceps Brachii",
//       "Wrist Flexors",
//       "Rectus Abdominis",
//       "Obliques",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   powerSnatch: {
//     targetMuscles: ["Quadriceps", "Gluteus Maximus", "Deltoid Anterior", "Deltoid Lateral", "Deltoid Posterior"],
//     synergistMuscles: [
//       "Hamstrings",
//       "Gastrocnemius",
//       "Soleus",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Trapezius Upper Fibers",
//       "Latissimus Dorsi",
//       "Erector Spinae",
//       "Biceps Brachii",
//       "Wrist Flexors",
//       "Rectus Abdominis",
//       "Obliques",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   preacherCurl: {
//     targetMuscles: ["Brachialis"],
//     synergistMuscles: ["Biceps Brachii", "Brachioradialis"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "dumbbell", "ezbar", "leverageMachine"],
//   },
//   pressUnder: {
//     targetMuscles: ["Quadriceps", "Deltoid Anterior", "Deltoid Lateral", "Deltoid Posterior"],
//     synergistMuscles: [
//       "Gluteus Maximus",
//       "Hamstrings",
//       "Erector Spinae",
//       "Rectus Abdominis",
//       "Obliques",
//       "Triceps Brachii",
//       "Biceps Brachii",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   pullUp: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Levator Scapulae",
//       "Teres Major",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["leverageMachine", "bodyweight", "band"],
//   },
//   pullover: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Deltoid Posterior",
//       "Levator Scapulae",
//       "Pectoralis Major Sternal Head",
//       "Serratus Anterior",
//       "Teres Major",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   pushPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["bodyweight", "kettlebell"],
//   },
//   pushUp: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["bodyweight", "band"],
//   },
//   reverseCrunch: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Iliopsoas", "Obliques"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "cable"],
//   },
//   reverseCurl: {
//     targetMuscles: ["Brachioradialis"],
//     synergistMuscles: ["Biceps Brachii", "Brachialis"],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "band"],
//   },
//   reverseFly: {
//     targetMuscles: ["Deltoid Posterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Infraspinatus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["dumbbell", "leverageMachine", "band"],
//   },
//   reverseGripConcentrationCurl: {
//     targetMuscles: ["Brachialis", "Brachioradialis"],
//     synergistMuscles: ["Biceps Brachii", "Wrist Flexors"],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["dumbbell"],
//   },
//   reverseLatPulldown: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Levator Scapulae",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   reverseLunge: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Soleus", "Gluteus Maximus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell", "bodyweight", "cable"],
//   },
//   reverseWristCurl: {
//     targetMuscles: ["Wrist Extensors"],
//     synergistMuscles: [],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["barbell"],
//   },
//   reversePlank: {
//     targetMuscles: ["Gluteus Maximus", "Rectus Abdominis", "Erector Spinae"],
//     synergistMuscles: [
//       "Hamstrings",
//       "Quadriceps",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//       "Triceps Brachii",
//       "Latissimus Dorsi",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   romanianDeadlift: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Erector Spinae", "Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   reverseHyperextension: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["band", "leverageMachine"],
//   },
//   rowing: {
//     targetMuscles: ["Quadriceps", "Latissimus Dorsi", "Erector Spinae"],
//     synergistMuscles: [
//       "Hamstrings",
//       "Gluteus Maximus",
//       "Biceps Brachii",
//       "Deltoid Anterior",
//       "Deltoid Lateral",
//       "Deltoid Posterior",
//       "Wrist Flexors",
//       "Rectus Abdominis",
//       "Obliques",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["cable"],
//   },
//   russianTwist: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Erector Spinae", "Iliopsoas"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "dumbbell", "cable"],
//   },
//   safetySquatBarSquat: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell"],
//   },
//   seatedCalfRaise: {
//     targetMuscles: ["Soleus"],
//     synergistMuscles: ["Gastrocnemius"],
//     bodyParts: ["Calves"],
//     sortedEquipment: ["barbell", "dumbbell", "leverageMachine"],
//   },
//   seatedFrontRaise: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell", "dumbbell"],
//   },
//   seatedLegCurl: {
//     targetMuscles: ["Hamstrings"],
//     synergistMuscles: ["Gastrocnemius", "Sartorius"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   seatedLegPress: {
//     targetMuscles: ["Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Soleus"],
//     bodyParts: ["Hips", "Thighs"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   seatedOverheadPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   seatedPalmsUpWristCurl: {
//     targetMuscles: ["Wrist Flexors"],
//     synergistMuscles: [],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["dumbbell"],
//   },
//   seatedRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Erector Spinae",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable", "band", "leverageMachine"],
//   },
//   seatedWideGripRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Erector Spinae",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   shoulderPress: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["cable", "dumbbell", "leverageMachine", "band", "smith"],
//   },
//   shoulderPressParallelGrip: {
//     targetMuscles: ["Deltoid Anterior"],
//     synergistMuscles: [
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["dumbbell"],
//   },
//   shrug: {
//     targetMuscles: ["Trapezius Upper Fibers"],
//     synergistMuscles: ["Levator Scapulae", "Trapezius Middle Fibers"],
//     bodyParts: ["Back"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "leverageMachine", "band", "smith"],
//   },
//   sideBend: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Erector Spinae", "Iliopsoas"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["cable", "dumbbell", "band"],
//   },
//   sideCrunch: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Rectus Abdominis"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "band", "cable"],
//   },
//   sideHipAbductor: {
//     targetMuscles: ["Gluteus Medius", "Tensor Fasciae Latae"],
//     synergistMuscles: [],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight", "barbell", "leverageMachine"],
//   },
//   sideLyingClam: {
//     targetMuscles: ["Gluteus Medius"],
//     synergistMuscles: ["Tensor Fasciae Latae"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   sidePlank: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: [],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   singleLegBridge: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   singleLegCalfRaise: {
//     targetMuscles: ["Gastrocnemius"],
//     synergistMuscles: ["Soleus"],
//     bodyParts: ["Calves"],
//     sortedEquipment: ["barbell", "dumbbell", "leverageMachine", "bodyweight", "cable"],
//   },
//   singleLegDeadlift: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["dumbbell", "bodyweight"],
//   },
//   singleLegGluteBridgeBench: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: [],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   singleLegGluteBridgeStraight: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: [],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   singleLegGluteBridgeBentKnee: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: [],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["bodyweight"],
//   },
//   singleLegHipThrust: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Quadriceps"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "bodyweight", "leverageMachine"],
//   },
//   sissySquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["bodyweight"],
//   },
//   sitUp: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Iliopsoas", "Obliques", "Quadriceps", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "kettlebell"],
//   },
//   slingShotBenchPress: {
//     targetMuscles: ["Pectoralis Major Sternal Head"],
//     synergistMuscles: ["Deltoid Anterior", "Pectoralis Major Clavicular Head", "Triceps Brachii"],
//     bodyParts: ["Chest"],
//     sortedEquipment: ["barbell"],
//   },
//   skullcrusher: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "ezbar"],
//   },
//   snatch: {
//     targetMuscles: ["Deltoid Anterior", "Erector Spinae", "Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Deltoid Lateral",
//       "Gastrocnemius",
//       "Serratus Anterior",
//       "Soleus",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Hips", "Shoulders", "Thighs"],
//     sortedEquipment: ["dumbbell"],
//   },
//   snatchPull: {
//     targetMuscles: [
//       "Erector Spinae",
//       "Gluteus Maximus",
//       "Hamstrings",
//       "Quadriceps",
//       "Latissimus Dorsi",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Trapezius Upper Fibers",
//     ],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Deltoid Anterior",
//       "Deltoid Posterior",
//       "Deltoid Lateral",
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Triceps Brachii",
//       "Wrist Flexors",
//       "Wrist Extensors",
//     ],
//     bodyParts: ["Back", "Hips", "Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   splitSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Hips", "Thighs"],
//     sortedEquipment: ["dumbbell"],
//   },
//   splitJerk: {
//     targetMuscles: [
//       "Deltoid Anterior",
//       "Deltoid Posterior",
//       "Deltoid Lateral",
//       "Triceps Brachii",
//       "Quadriceps",
//       "Gluteus Maximus",
//       "Erector Spinae",
//     ],
//     synergistMuscles: [
//       "Pectoralis Major Sternal Head",
//       "Pectoralis Major Clavicular Head",
//       "Latissimus Dorsi",
//       "Hamstrings",
//       "Obliques",
//       "Rectus Abdominis",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//       "Trapezius Upper Fibers",
//       "Adductor Magnus",
//       "Tensor Fasciae Latae",
//       "Wrist Extensors",
//       "Wrist Flexors",
//     ],
//     bodyParts: ["Hips", "Shoulders", "Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   squat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell", "bodyweight", "smith", "leverageMachine"],
//   },
//   squatRow: {
//     targetMuscles: ["Gluteus Maximus", "Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Infraspinatus",
//       "Teres Major",
//       "Teres Minor",
//       "Adductor Magnus",
//       "Deltoid Posterior",
//       "Pectoralis Major Sternal Head",
//       "Quadriceps",
//       "Soleus",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["band"],
//   },
//   standingCalfRaise: {
//     targetMuscles: ["Gastrocnemius"],
//     synergistMuscles: ["Soleus"],
//     bodyParts: ["Calves"],
//     sortedEquipment: ["barbell", "dumbbell", "leverageMachine", "bodyweight", "cable"],
//   },
//   standingRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   standingRowCloseGrip: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Upper Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Infraspinatus",
//       "Teres Major",
//       "Teres Minor",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   standingRowRearDeltWithRope: {
//     targetMuscles: ["Deltoid Posterior"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Lateral",
//       "Infraspinatus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["cable"],
//   },
//   standingRowRearHorizontalDeltWithRope: {
//     targetMuscles: ["Deltoid Posterior"],
//     synergistMuscles: ["Infraspinatus", "Teres Minor", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["cable"],
//   },
//   standingRowVBar: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Infraspinatus",
//       "Teres Major",
//       "Teres Minor",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Pectoralis Major Sternal Head",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["cable"],
//   },
//   stepUp: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell", "bodyweight", "band"],
//   },
//   stiffLegDeadlift: {
//     targetMuscles: ["Erector Spinae"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Hamstrings"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell", "dumbbell", "band"],
//   },
//   straightLegDeadlift: {
//     targetMuscles: ["Hamstrings"],
//     synergistMuscles: ["Adductor Magnus", "Erector Spinae", "Gluteus Maximus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["barbell", "dumbbell", "band", "kettlebell"],
//   },
//   sumoDeadlift: {
//     targetMuscles: ["Erector Spinae"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Quadriceps", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell"],
//   },
//   sumoDeadliftHighPull: {
//     targetMuscles: ["Deltoid Lateral", "Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Anterior",
//       "Gastrocnemius",
//       "Infraspinatus",
//       "Soleus",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell"],
//   },
//   superman: {
//     targetMuscles: ["Erector Spinae"],
//     synergistMuscles: ["Gluteus Maximus", "Hamstrings"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "dumbbell"],
//   },
//   tBarRow: {
//     targetMuscles: ["Latissimus Dorsi", "Trapezius Lower Fibers", "Trapezius Middle Fibers"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Pectoralis Major Sternal Head",
//       "Teres Major",
//       "Teres Minor",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["leverageMachine"],
//   },
//   thruster: {
//     targetMuscles: ["Deltoid Anterior", "Gluteus Maximus", "Quadriceps"],
//     synergistMuscles: [
//       "Adductor Magnus",
//       "Deltoid Lateral",
//       "Pectoralis Major Clavicular Head",
//       "Serratus Anterior",
//       "Soleus",
//       "Triceps Brachii",
//     ],
//     bodyParts: ["Shoulders", "Thighs"],
//     sortedEquipment: ["barbell"],
//   },
//   toesToBar: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Iliopsoas", "Obliques", "Quadriceps", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight"],
//   },
//   torsoRotation: {
//     targetMuscles: ["Obliques"],
//     synergistMuscles: ["Erector Spinae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["cable"],
//   },
//   trapBarDeadlift: {
//     targetMuscles: ["Gluteus Maximus"],
//     synergistMuscles: ["Adductor Magnus", "Quadriceps", "Soleus"],
//     bodyParts: ["Thighs"],
//     sortedEquipment: ["trapbar"],
//   },
//   tricepsDip: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [
//       "Deltoid Anterior",
//       "Latissimus Dorsi",
//       "Levator Scapulae",
//       "Pectoralis Major Clavicular Head",
//       "Pectoralis Major Sternal Head",
//     ],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["bodyweight", "leverageMachine"],
//   },
//   tricepsExtension: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["barbell", "cable", "band", "dumbbell"],
//   },
//   tricepsPushdown: {
//     targetMuscles: ["Triceps Brachii"],
//     synergistMuscles: [],
//     bodyParts: ["Upper Arms"],
//     sortedEquipment: ["cable"],
//   },
//   uprightRow: {
//     targetMuscles: ["Deltoid Lateral"],
//     synergistMuscles: [
//       "Biceps Brachii",
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Anterior",
//       "Infraspinatus",
//       "Serratus Anterior",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Shoulders"],
//     sortedEquipment: ["barbell", "cable", "dumbbell", "band"],
//   },
//   vUp: {
//     targetMuscles: ["Rectus Abdominis"],
//     synergistMuscles: ["Iliopsoas", "Obliques", "Pectineous", "Quadriceps", "Sartorius", "Tensor Fasciae Latae"],
//     bodyParts: ["Waist"],
//     sortedEquipment: ["bodyweight", "band", "dumbbell"],
//   },
//   widePullUp: {
//     targetMuscles: ["Latissimus Dorsi"],
//     synergistMuscles: [
//       "Brachialis",
//       "Brachioradialis",
//       "Deltoid Posterior",
//       "Infraspinatus",
//       "Levator Scapulae",
//       "Serratus Anterior",
//       "Teres Major",
//       "Teres Minor",
//       "Trapezius Lower Fibers",
//       "Trapezius Middle Fibers",
//     ],
//     bodyParts: ["Back"],
//     sortedEquipment: ["bodyweight"],
//   },
//   wristCurl: {
//     targetMuscles: ["Wrist Flexors"],
//     synergistMuscles: [],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["barbell"],
//   },
//   wristRoller: {
//     targetMuscles: ["Wrist Extensors", "Wrist Flexors"],
//     synergistMuscles: [],
//     bodyParts: ["Forearms"],
//     sortedEquipment: ["bodyweight"],
//   },
//   zercherSquat: {
//     targetMuscles: ["Quadriceps"],
//     synergistMuscles: ["Adductor Magnus", "Gluteus Maximus", "Soleus"],
//     bodyParts: ["Hips"],
//     sortedEquipment: ["barbell"],
//   },
// };

// function equipmentToBarKey(equipment?: IEquipment): IBarKey | undefined {
//   switch (equipment) {
//     case "barbell":
//       return "barbell";
//     case "dumbbell":
//       return "dumbbell";
//     case "ezbar":
//       return "ezbar";
//     default:
//       return undefined;
//   }
// }

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
              id: generateUid(6),
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

// function Exercise_getMetadata(id: IExerciseId): IMetaExercises {
//   return metadata[id] || {};
// }

// function Exercise_exists(name: string, customExercises: IAllCustomExercises): boolean {
//   let exercise = ObjectUtils_keys(allExercisesList).filter((k) => allExercisesList[k].name === name)[0];
//   if (exercise == null) {
//     exercise = ObjectUtils_keys(customExercises).filter(
//       (k) => !customExercises[k]!.isDeleted && customExercises[k]!.name === name
//     )[0];
//   }
//   return !!exercise;
// }
//
// function Exercise_isCustom(id: string, customExercises: IAllCustomExercises): boolean {
//   return customExercises[id] != null;
// }

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

// function Exercise_reverseName(exercise: IExercise, settings?: ISettings): string {
//   if (exercise.equipment) {
//     const allEquipment = settings ? Equipment_currentEquipment(settings) : {};
//     const equipment = equipmentName(exercise.equipment, allEquipment);
//     return `${equipment} ${exercise.name}`;
//   } else {
//     return exercise.name;
//   }
// }
//
// function Exercise_nameWithEquipment(exercise: IExercise, settings?: ISettings): string {
//   if (exercise.equipment) {
//     const allEquipment = settings ? Equipment_currentEquipment(settings) : {};
//     const equipment = equipmentName(exercise.equipment, allEquipment);
//     return `${exercise.name}, ${equipment}`;
//   } else {
//     return exercise.name;
//   }
// }
//
// function Exercise_searchNames(query: string, customExercises: IAllCustomExercises): string[] {
//   const allExercises = Exercise_allExpanded({});
//   const exerciseNames = allExercises
//     .filter((e) =>
//       StringUtils_fuzzySearch(
//         query.toLowerCase(),
//         `${e.name}${e.equipment ? `, ${equipmentName(e.equipment)}` : ""}`.toLowerCase()
//       )
//     )
//     .map((e) => `${e.name}${e.equipment ? `, ${equipmentName(e.equipment)}` : ""}`);
//   const customExerciseNames = ObjectUtils_values(customExercises)
//     .filter((ce) => (ce ? StringUtils_fuzzySearch(query.toLowerCase(), ce.name.toLowerCase()) : false))
//     .map((e) => e!.name);
//   const names = [...exerciseNames, ...customExerciseNames];
//   names.sort();
//   return names;
// }

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

// function Exercise_getNotes(type: IExerciseType, settings: ISettings): string | undefined {
//   return settings.exerciseData[Exercise_toKey(type)]?.notes;
// }

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

// function Exercise_find(type: IExerciseType, customExercises: IAllCustomExercises): IExercise | undefined {
//   const exercise = maybeGetExercise(type.id, customExercises);
//   return exercise ? { ...exercise, equipment: type.equipment } : undefined;
// }

// function Exercise_getById(id: IExerciseId, customExercises: IAllCustomExercises): IExercise {
//   const exercise = getExercise(id, customExercises);
//   return { ...exercise, equipment: exercise.defaultEquipment };
// }

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

// function Exercise_getByIds(ids: IExerciseId[], customExercises: IAllCustomExercises): IExercise[] {
//   return ids.map((id) => {
//     const exercise = getExercise(id, customExercises);
//     return { ...exercise, equipment: exercise.defaultEquipment };
//   });
// }

// function Exercise_all(customExercises: IAllCustomExercises): IExercise[] {
//   return ObjectUtils_keys(customExercises)
//     .map((id) => getExercise(id, customExercises))
//     .concat(
//       ObjectUtils_keys(allExercisesList).map((k) => ({
//         ...allExercisesList[k],
//         equipment: allExercisesList[k].defaultEquipment,
//       }))
//     );
// }
//
// function Exercise_allExpanded(customExercises: IAllCustomExercises): IExercise[] {
//   return ObjectUtils_keys(customExercises)
//     .map((id) => getExercise(id, customExercises))
//     .concat(
//       ObjectUtils_keys(allExercisesList).flatMap((k) => {
//         return CollectionUtils_compact(
//           equipments.map((equipment) => {
//             const exerciseType = { id: k, equipment };
//             return ExerciseImageUtils_exists(exerciseType, "small") ? { ...allExercisesList[k], equipment } : undefined;
//           })
//         );
//       })
//     );
// }

// function Exercise_toExternalUrl(type: IExerciseType): string {
//   return `/exercises/${Exercise_toUrlSlug(type)}`;
// }

// function Exercise_toUrlSlug(type: IExerciseType): string {
//   const possibleEquipments: Record<string, IEquipment> = {
//     barbell: "barbell",
//     cable: "cable",
//     dumbbell: "dumbbell",
//     smith: "smith",
//     band: "band",
//     kettlebell: "kettlebell",
//     bodyweight: "bodyweight",
//     leverageMachine: "leverage-machine",
//     medicineball: "medicine-ball",
//     ezbar: "ez-bar",
//     trapbar: "trap-bar",
//   };
//
//   const equipment = type.equipment ? possibleEquipments[type.equipment] : undefined;
//   const equipmentSlug = equipment ? `${equipment}-` : "";
//   return `${equipmentSlug}${StringUtils_dashcase(StringUtils_uncamelCase(type.id))}`;
// }

// function Exercise_fromUrlSlug(slug: string): IExerciseType | undefined {
//   // slug looks like leverage-machine-squat or barbell-bench-press
//   const possibleEquipments: Record<string, IEquipment> = {
//     barbell: "barbell",
//     cable: "cable",
//     dumbbell: "dumbbell",
//     smith: "smith",
//     band: "band",
//     kettlebell: "kettlebell",
//     bodyweight: "bodyweight",
//     "leverage-machine": "leverageMachine",
//     "medicine-ball": "medicineball",
//     "ez-bar": "ezbar",
//     "trap-bar": "trapbar",
//   };
//   let equipment: IEquipment | undefined = undefined;
//   const equipmentKey = ObjectUtils_keys(possibleEquipments).find((e) => slug.startsWith(e));
//   if (equipmentKey != null) {
//     equipment = possibleEquipments[equipmentKey];
//     slug = slug.slice(equipmentKey.length + 1);
//   }
//   const exerciseId = StringUtils_camelCase(StringUtils_undashcase(slug));
//   if (allExercisesList[exerciseId]) {
//     return { id: exerciseId as IExerciseId, equipment };
//   } else {
//     return undefined;
//   }
// }

// function Exercise_eq(a: IExerciseType, b: IExerciseType): boolean {
//   return a.id === b.id && a.equipment === b.equipment;
// }

// function Exercise_filterExercisesByNameAndType(
//   settings: ISettings,
//   filter: string,
//   filterTypes: string[],
//   isSubstitute: boolean,
//   exerciseType?: IExerciseType,
//   length?: number
// ): IExercise[] {
//   let allExercises = Exercise_allExpanded({});
//   if (filter) {
//     allExercises = Exercise_filterExercises(allExercises, filter);
//   }
//   if (filterTypes && filterTypes.length > 0) {
//     allExercises = Exercise_filterExercisesByType(allExercises, filterTypes, settings);
//   }
//   allExercises = Exercise_sortExercises(allExercises, isSubstitute, settings, filterTypes, exerciseType);
//   if (length != null) {
//     allExercises = allExercises.slice(0, length);
//   }
//   return allExercises;
// }

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

// function Exercise_defaultTargetMuscles(type: IExerciseType, settings: ISettings): IMuscle[] {
//   const customExercise = settings.exercises[type.id];
//   if (customExercise) {
//     return customExercise.meta.targetMuscles;
//   } else {
//     const meta = Exercise_getMetadata(type.id);
//     return meta?.targetMuscles != null ? meta.targetMuscles : [];
//   }
// }

// function Exercise_targetMuscles(type: IExerciseType, settings: ISettings): IMuscle[] {
//   const muscleMultipliers = settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
//   if (muscleMultipliers) {
//     return ObjectUtils_keys(muscleMultipliers).filter((m) => muscleMultipliers[m] === 1);
//   } else {
//     return Exercise_defaultTargetMuscles(type, settings);
//   }
// }

// function Exercise_defaultTargetMusclesGroups(type: IExerciseType, settings: ISettings): IScreenMuscle[] {
//   const muscles = Exercise_defaultTargetMuscles(type, settings);
//   const allMuscleGroups = new Set<IScreenMuscle>();
//   for (const muscle of muscles) {
//     const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
//     for (const muscleGroup of muscleGroups) {
//       allMuscleGroups.add(muscleGroup);
//     }
//   }
//   return Array.from(allMuscleGroups);
// }

// function Exercise_targetMusclesGroups(type: IExerciseType, settings: ISettings): IScreenMuscle[] {
//   const muscles = Exercise_targetMuscles(type, settings);
//   const allMuscleGroups = new Set<IScreenMuscle>();
//   for (const muscle of muscles) {
//     const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
//     for (const muscleGroup of muscleGroups) {
//       allMuscleGroups.add(muscleGroup);
//     }
//   }
//   return Array.from(allMuscleGroups);
// }

// function Exercise_defaultSynergistMuscleMultipliers(
//   type: IExerciseType,
//   settings: ISettings
// ): IMuscleMultiplier[] {
//   const customExercise = settings.exercises[type.id];
//   if (customExercise) {
//     return customExercise.meta.synergistMuscles.map((m) => ({
//       muscle: m,
//       multiplier: settings.planner.synergistMultiplier,
//     }));
//   } else {
//     const meta = Exercise_getMetadata(type.id);
//     return meta?.synergistMuscles != null
//       ? meta.synergistMuscles.map((m) => {
//         return { muscle: m, multiplier: settings.planner.synergistMultiplier };
//       })
//       : [];
//   }
// }

// function Exercise_defaultSynergistMuscles(type: IExerciseType, settings: ISettings): IMuscle[] {
//   return Exercise_defaultSynergistMuscleMultipliers(type, settings).map((m) => m.muscle);
// }

// function Exercise_synergistMuscleMultipliers(type: IExerciseType, settings: ISettings): IMuscleMultiplier[] {
//   const muscleMultipliers = settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
//   if (muscleMultipliers) {
//     return ObjectUtils_keys(muscleMultipliers)
//       .filter((m) => (muscleMultipliers[m] ?? 0) < 1)
//       .map((m) => ({ muscle: m, multiplier: muscleMultipliers[m] ?? 0 }));
//   } else {
//     return Exercise_defaultSynergistMuscleMultipliers(type, settings);
//   }
// }

// function Exercise_synergistMuscles(type: IExerciseType, settings: ISettings): IMuscle[] {
//   const muscleMultipliers = settings.exerciseData[Exercise_toKey(type)]?.muscleMultipliers;
//   if (muscleMultipliers) {
//     return ObjectUtils_keys(muscleMultipliers).filter((m) => (muscleMultipliers[m] ?? 0) < 1);
//   } else {
//     return Exercise_defaultSynergistMuscles(type, settings);
//   }
// }

// function Exercise_defaultSynergistMusclesGroups(type: IExerciseType, settings: ISettings): IScreenMuscle[] {
//   const muscles = Exercise_defaultSynergistMuscles(type, settings);
//   const allMuscleGroups = new Set<IScreenMuscle>();
//   for (const muscle of muscles) {
//     const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
//     for (const muscleGroup of muscleGroups) {
//       allMuscleGroups.add(muscleGroup);
//     }
//   }
//   return Array.from(allMuscleGroups);
// }
//
// function Exercise_synergistMusclesGroupMultipliers(
//   type: IExerciseType,
//   settings: ISettings
// ): Partial<Record<IScreenMuscle, number>> {
//   return Exercise_synergistMuscleMultipliers(type, settings).reduce<Partial<Record<IScreenMuscle, number>>>(
//     (memo, m) => {
//       for (const muscleGroup of Muscle_getScreenMusclesFromMuscle(m.muscle, settings)) {
//         if (memo[muscleGroup] == null || memo[muscleGroup] < m.multiplier) {
//           memo[muscleGroup] = m.multiplier;
//         }
//       }
//       return memo;
//     },
//     {}
//   );
// }

// function Exercise_synergistMusclesGroups(type: IExerciseType, settings: ISettings): IScreenMuscle[] {
//   const muscles = Exercise_synergistMuscles(type, settings);
//   const allMuscleGroups = new Set<IScreenMuscle>();
//   for (const muscle of muscles) {
//     const muscleGroups = Muscle_getScreenMusclesFromMuscle(muscle, settings);
//     for (const muscleGroup of muscleGroups) {
//       allMuscleGroups.add(muscleGroup);
//     }
//   }
//   return Array.from(allMuscleGroups);
// }

function Exercise_toKey(type: IExerciseType): string {
  return `${type.id}${type.equipment ? `_${type.equipment}` : ""}`;
}

// function Exercise_fromKey(type: string): IExerciseType {
//   const [id, equipment] = type.split("_");
//   return { id: id as IExerciseId, equipment: equipment };
// }
//
// function Exercise_defaultEquipment(
//   type: IExerciseId,
//   customExercises: IAllCustomExercises
// ): IEquipment | undefined {
//   const priorities: Record<IEquipment, IEquipment[]> = {
//     barbell: ["ezbar", "trapbar", "dumbbell", "kettlebell"],
//     cable: ["band", "leverageMachine"],
//     dumbbell: ["barbell", "kettlebell", "bodyweight"],
//     smith: ["leverageMachine", "dumbbell", "barbell", "kettlebell", "cable"],
//     band: ["cable", "bodyweight", "leverageMachine", "smith"],
//     kettlebell: ["dumbbell", "barbell", "cable"],
//     bodyweight: ["cable", "dumbbell", "barbell", "band"],
//     leverageMachine: ["smith", "cable", "dumbbell", "barbell", "kettlebell"],
//     medicineball: ["bodyweight", "cable"],
//     ezbar: ["barbell", "dumbbell", "cable"],
//     trapbar: ["barbell", "dumbbell", "cable"],
//   };
//
//   const exercise = Exercise_getById(type, customExercises);
//   const bar = exercise.defaultEquipment || "bodyweight";
//   const sortedEquipment = Exercise_getMetadata(type).sortedEquipment || [];
//   let equipment: IEquipment | undefined = sortedEquipment.find((b) => b === bar);
//   equipment = equipment || (priorities[bar] || []).find((eqp) => sortedEquipment.indexOf(eqp) !== -1);
//   equipment = equipment || sortedEquipment[0];
//   return equipment;
// }
//
// function Exercise_similarRating(current: IExerciseType, e: IExercise, settings: ISettings): number {
//   const tm = Exercise_targetMuscles(current, settings);
//   const sm = Exercise_synergistMuscles(current, settings);
//   const etm = Exercise_targetMuscles(e, settings);
//   const esm = Exercise_synergistMuscles(e, settings);
//   let rating = 0;
//   if (e.id === current.id || (etm.length === 0 && esm.length === 0)) {
//     rating = -Infinity;
//   } else {
//     for (const muscle of etm) {
//       if (tm.indexOf(muscle) !== -1) {
//         rating += 60;
//       } else {
//         rating -= 30;
//       }
//       if (sm.indexOf(muscle) !== -1) {
//         rating += 20;
//       }
//     }
//     for (const muscle of tm) {
//       if (etm.indexOf(muscle) === -1) {
//         rating -= 30;
//       }
//     }
//     for (const muscle of esm) {
//       if (sm.indexOf(muscle) !== -1) {
//         rating += 30;
//       } else {
//         rating -= 15;
//       }
//       if (tm.indexOf(muscle) !== -1) {
//         rating += 10;
//       }
//     }
//     for (const muscle of sm) {
//       if (esm.indexOf(muscle) === -1) {
//         rating -= 15;
//       }
//     }
//     if (e.defaultEquipment === "cable" || e.defaultEquipment === "leverageMachine") {
//       rating -= 20;
//     }
//   }
//   return rating;
// }

// function Exercise_similar(type: IExerciseType, settings: ISettings): [IExercise, number][] {
//   const tm = Exercise_targetMuscles(type, settings);
//   const sm = Exercise_synergistMuscles(type, settings);
//   if (tm.length === 0 && sm.length === 0) {
//     return [];
//   }
//   const rated = Exercise_all(settings.exercises).map<[IExercise, number]>((e) => {
//     const rating = Exercise_similarRating(type, e, settings);
//     return [e, rating];
//   });
//   rated.sort((a, b) => b[1] - a[1]);
//   return rated.filter(([, r]) => r > 0);
// }
//
// function Exercise_sortedByScreenMuscle(muscle: IScreenMuscle, settings: ISettings): [IExercise, number][] {
//   const muscles = Muscle_getMusclesFromScreenMuscle(muscle, settings);
//
//   const rated = Exercise_all(settings.exercises).map<[IExercise, number]>((e) => {
//     let rating = 0;
//     const tm = Exercise_targetMuscles(e, settings);
//     const sm = Exercise_synergistMuscles(e, settings);
//     for (const m of tm) {
//       if (muscles.indexOf(m) !== -1) {
//         rating += 100;
//       }
//     }
//     for (const m of sm) {
//       if (muscles.indexOf(m) !== -1) {
//         rating += 10;
//       }
//     }
//     return [e, rating];
//   });
//   rated.sort((a, b) => b[1] - a[1]);
//   return rated.filter(([, r]) => r > 0);
// }
//
// function Exercise_createCustomExercise(
//   name: string,
//   tMuscles: IMuscle[],
//   sMuscles: IMuscle[],
//   types: IExerciseKind[],
//   smallImageUrl?: string,
//   largeImageUrl?: string
// ): ICustomExercise {
//   const id = UidFactory_generateUid(8);
//   const newExercise: ICustomExercise = {
//     vtype: "custom_exercise",
//     id,
//     name,
//     isDeleted: false,
//     types,
//     smallImageUrl,
//     largeImageUrl,
//     meta: {
//       targetMuscles: tMuscles,
//       synergistMuscles: sMuscles,
//       bodyParts: [],
//       sortedEquipment: [],
//     },
//   };
//   return newExercise;
// }
//
// function Exercise_editCustomExercise(
//   exercise: ICustomExercise,
//   name: string,
//   tMuscles: IMuscle[],
//   sMuscles: IMuscle[],
//   types: IExerciseKind[],
//   smallImageUrl?: string,
//   largeImageUrl?: string
// ): ICustomExercise {
//   const newExercise: ICustomExercise = {
//     ...exercise,
//     name,
//     types,
//     smallImageUrl,
//     largeImageUrl,
//     meta: { ...exercise.meta, targetMuscles: tMuscles, synergistMuscles: sMuscles },
//   };
//   return newExercise;
// }
//
// function Exercise_deleteCustomExercise(
//   allExercises: IAllCustomExercises,
//   exerciseId: IExerciseId
// ): IAllCustomExercises {
//   const existingExercise = allExercises[exerciseId];
//   if (existingExercise) {
//     return { ...allExercises, [exerciseId]: { ...existingExercise, isDeleted: true } };
//   }
//   return allExercises;
// }
//
// function Exercise_upsertCustomExercise(
//   allExercises: IAllCustomExercises,
//   exercise: ICustomExercise
// ): IAllCustomExercises {
//   exercise = { ...exercise, name: exercise.name.trim() };
//   const existingExercise = allExercises[exercise.id];
//   if (existingExercise) {
//     return { ...allExercises, [exercise.id]: { ...existingExercise, ...exercise, isDeleted: false } };
//   } else {
//     const sameNameDeletedExercise = ObjectUtils_values(allExercises).find(
//       (e) => e?.name === exercise.name && e.isDeleted
//     );
//     if (sameNameDeletedExercise) {
//       return {
//         ...allExercises,
//         [sameNameDeletedExercise.id]: {
//           ...sameNameDeletedExercise,
//           ...exercise,
//           id: sameNameDeletedExercise.id,
//           isDeleted: false,
//         },
//       };
//     } else {
//       return { ...allExercises, [exercise.id]: exercise };
//     }
//   }
// }

// function Exercise_handleCustomExerciseChange(
//   dispatch: IDispatch,
//   action: "upsert" | "delete",
//   exercise: ICustomExercise,
//   notes: string | undefined,
//   settings: ISettings,
//   program?: IProgram
// ): void {
//   const oldExercise = settings.exercises[exercise.id];
//   const ex =
//     action === "upsert"
//       ? Exercise_upsertCustomExercise(settings.exercises, exercise)
//       : Exercise_deleteCustomExercise(settings.exercises, exercise.id);
//   updateSettings(dispatch, lb<ISettings>().p("exercises").record(ex), "Create custom exercise");
//   updateSettings(dispatch, lb<ISettings>().p("exerciseData").pi(exercise.id).p("notes").record(notes), "Update notes");
//   if (program && oldExercise && oldExercise.name !== exercise.name) {
//     const newProgram = Program_changeExerciseName(oldExercise.name, exercise.name, program, {
//       ...settings,
//       exercises: ex,
//     });
//     EditProgram_updateProgram(dispatch, newProgram);
//   }
// }
//
// function Exercise_createOrUpdateCustomExercise(
//   allExercises: IAllCustomExercises,
//   name: string,
//   tMuscles: IMuscle[],
//   sMuscles: IMuscle[],
//   types: IExerciseKind[],
//   smallImageUrl?: string,
//   largeImageUrl?: string,
//   exercise?: ICustomExercise
// ): IAllCustomExercises {
//   if (exercise != null) {
//     const newExercise = Exercise_editCustomExercise(
//       exercise,
//       name,
//       tMuscles,
//       sMuscles,
//       types,
//       smallImageUrl,
//       largeImageUrl
//     );
//     return { ...allExercises, [newExercise.id]: newExercise };
//   } else {
//     const deletedExerciseKey = ObjectUtils_keys(allExercises).find(
//       (k) => allExercises[k]?.isDeleted && allExercises[k]?.name === name
//     );
//     const deletedExercise = deletedExerciseKey != null ? allExercises[deletedExerciseKey] : undefined;
//     if (deletedExercise) {
//       return {
//         ...allExercises,
//         [deletedExercise.id]: {
//           ...deletedExercise,
//           name,
//           types,
//           smallImageUrl,
//           largeImageUrl,
//           isDeleted: false,
//           meta: {
//             targetMuscles: tMuscles,
//             bodyParts: [],
//             synergistMuscles: sMuscles,
//           },
//         },
//       };
//     } else {
//       const newExercise = Exercise_createCustomExercise(name, tMuscles, sMuscles, types, smallImageUrl, largeImageUrl);
//       return { ...allExercises, [newExercise.id]: newExercise };
//     }
//   }
// }
//
// function Exercise_filterExercises<T extends { name: string }>(allExercises: T[], filter: string): T[] {
//   return allExercises.filter((e) => StringUtils_fuzzySearch(filter.toLowerCase(), e.name.toLowerCase()));
// }
//
// function Exercise_sortExercises(
//   allExercises: IExercise[],
//   isSubstitute: boolean,
//   settings: ISettings,
//   filterTypes?: string[],
//   currentExerciseType?: IExerciseType
// ): IExercise[] {
//   return CollectionUtils_sort(allExercises, (a, b) => {
//     const exerciseType = currentExerciseType;
//     if (isSubstitute && exerciseType) {
//       const aRating = Exercise_similarRating(exerciseType, a, settings);
//       const bRating = Exercise_similarRating(exerciseType, b, settings);
//       return bRating - aRating;
//     } else if (
//       filterTypes &&
//       Muscle_getAvailableMuscleGroups(settings)
//         .map((m) => m.toLowerCase())
//         .some((t) => filterTypes.map((ft) => ft.toLowerCase()).indexOf(t) !== -1)
//     ) {
//       const lowercaseFilterTypes = filterTypes.map((t) => t.toLowerCase());
//       const aTargetMuscleGroups = Exercise_targetMusclesGroups(a, settings);
//       const bTargetMuscleGroups = Exercise_targetMusclesGroups(b, settings);
//       if (
//         aTargetMuscleGroups.some((m) => lowercaseFilterTypes.indexOf(m) !== -1) &&
//         bTargetMuscleGroups.every((m) => lowercaseFilterTypes.indexOf(m) === -1)
//       ) {
//         return -1;
//       } else if (
//         bTargetMuscleGroups.some((m) => lowercaseFilterTypes.indexOf(m) !== -1) &&
//         aTargetMuscleGroups.every((m) => lowercaseFilterTypes.indexOf(m) === -1)
//       ) {
//         return 1;
//       } else {
//         return a.name.localeCompare(b.name);
//       }
//     } else {
//       return a.name.localeCompare(b.name);
//     }
//   });
// }
//
// function Exercise_filterExercisesByType<T extends IExerciseType>(
//   allExercises: T[],
//   filterTypes: string[],
//   settings: ISettings
// ): T[] {
//   return allExercises.filter((e) => {
//     const exercise = Exercise_get(e, settings.exercises);
//     const targetMuscleGroups = Exercise_targetMusclesGroups(e, settings).map((m) => m.toLowerCase());
//     const synergistMuscleGroups = Exercise_synergistMusclesGroups(e, settings).map((m) => m.toLowerCase());
//     return filterTypes
//       .map((ft) => ft.toLowerCase())
//       .every((ft) => {
//         return (
//           targetMuscleGroups.indexOf(ft) !== -1 ||
//           synergistMuscleGroups.indexOf(ft) !== -1 ||
//           exercise.types.map((t) => t.toLowerCase()).indexOf(ft) !== -1 ||
//           equipmentName(e.equipment).toLowerCase() === ft
//         );
//       });
//   });
// }

// function Exercise_filterCustomExercises(
//   customExercises: IAllCustomExercises,
//   filter: string
// ): IAllCustomExercises {
//   return ObjectUtils_filter(customExercises, (e, v) =>
//     v ? StringUtils_fuzzySearch(filter.toLowerCase(), v.name.toLowerCase()) : true
//   );
// }
//
// function Exercise_filterCustomExercisesByType(filterTypes: string[], settings: ISettings): IAllCustomExercises {
//   return ObjectUtils_filter(settings.exercises, (_id, exercise) => {
//     if (!exercise) {
//       return false;
//     }
//     const targetMuscleGroups = Array.from(
//       new Set(
//         CollectionUtils_flat(exercise.meta.targetMuscles.map((m) => Muscle_getScreenMusclesFromMuscle(m, settings)))
//       )
//     ).map((m) => Muscle_getMuscleGroupName(m, settings));
//     const synergistMuscleGroups = Array.from(
//       new Set(
//         CollectionUtils_flat(exercise.meta.synergistMuscles.map((m) => Muscle_getScreenMusclesFromMuscle(m, settings)))
//       )
//     ).map((m) => Muscle_getMuscleGroupName(m, settings));
//     return filterTypes.every((ft) => {
//       return (
//         targetMuscleGroups.indexOf(ft) !== -1 ||
//         synergistMuscleGroups.indexOf(ft) !== -1 ||
//         (exercise.types || []).map(StringUtils_capitalize).indexOf(ft) !== -1
//       );
//     });
//   });
// }

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

// interface IScriptFinishContext {
//   type: "finish";
//   updates: ILiftoscriptEvaluatorUpdate[];
//   exerciseData: IExerciseDataValue;
//   setVariationIndex: number;
//   descriptionIndex: number;
// }
//
// interface IScriptUpdateContext {
//   equipment?: IEquipment;
// }

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
//
// function Progress_isCurrent(progress: IHistoryRecord | undefined): boolean {
//   return progress?.id === 0;
// }

// function Progress_startTimer(
//   progress: IHistoryRecord,
//   timestamp: number,
//   mode: IProgressMode,
//   entryIndex: number,
//   setIndex: number,
//   settings: ISettings,
//   subscription?: ISubscription,
//   timer?: number,
//   isAdjusting?: boolean
// ): IHistoryRecord {
//   const entry = progress.entries[entryIndex];
//   const set = mode === "warmup" ? entry?.warmupSets[setIndex] : entry?.sets[setIndex];
//   if (!isAdjusting && (!set || !set.isCompleted)) {
//     return progress;
//   }
//   if (timer == null && Progress_isCurrent(progress) && mode === "workout") {
//     timer = entry?.sets[setIndex]?.timer;
//   }
//   if (timer == null) {
//     timer =
//       mode === "workout" && entry.superset != null && settings.timers.superset != null
//         ? settings.timers.superset
//         : settings.timers[mode] || undefined;
//   }
//   if (!timer) {
//     return {
//       ...progress,
//       timerSince: undefined,
//       timer: undefined,
//       timerMode: undefined,
//       timerEntryIndex: undefined,
//       timerSetIndex: undefined,
//     };
//   }
//   if (subscription && Subscriptions_hasSubscription(subscription)) {
//     const timerForPush = timer - Math.round((Date.now() - timestamp) / 1000);
//     const title = "It's time for the next set!";
//     let subtitle = "";
//     let body = "Time to lift!";
//     let subtitleHeader = "";
//     let bodyHeader = "The rest is over";
//     const nextEntryAndSet = Reps_findNextEntryAndSet(progress, entryIndex, mode);
//     if (nextEntryAndSet != null) {
//       const { entry: nextEntry, set: aSet } = nextEntryAndSet;
//       const exercise = Exercise_get(nextEntry.exercise, settings.exercises);
//       if (exercise) {
//         subtitleHeader = "Next Set";
//         subtitle = CollectionUtils_compact([
//           exercise.name,
//           aSet.reps != null ? `${aSet.reps}${aSet.isAmrap ? "+" : ""} reps` : undefined,
//           aSet.weight != null ? Weight_display(aSet.weight) : undefined,
//         ]).join(", ");
//         if (aSet.weight != null) {
//           const { plates } = Weight_calculatePlates(aSet.weight, settings, aSet.weight.unit, nextEntry.exercise);
//           const formattedPlates = plates.length > 0 ? Weight_formatOneSide(settings, plates, exercise) : "None";
//           bodyHeader = "Plates per side";
//           body = formattedPlates;
//         }
//       }
//     }
//     const ignoreDoNotDisturb = settings.ignoreDoNotDisturb ? "true" : "false";
//     const vibration = settings.vibration ? "true" : "false";
//     const volume = settings.volume.toString();
//     SendMessage_print(`Scheduling timer notification, volume: ${volume}`);
//     SendMessage_toIos({
//       type: "startTimer",
//       duration: timerForPush.toString(),
//       mode,
//       title,
//       subtitleHeader,
//       subtitle,
//       bodyHeader,
//       body,
//       ignoreDoNotDisturb,
//       vibration,
//       volume,
//     });
//     SendMessage_toAndroid({
//       type: "startTimer",
//       duration: timerForPush.toString(),
//       mode,
//       title,
//       subtitleHeader,
//       subtitle,
//       bodyHeader,
//       body,
//       ignoreDoNotDisturb,
//       vibration,
//       volume,
//     });
//   }
//   const newProgress: IHistoryRecord = {
//     ...progress,
//     timerSince: timestamp,
//     timer,
//     timerMode: mode,
//     timerEntryIndex: entryIndex,
//     timerSetIndex: setIndex,
//     ui: { ...progress.ui, nativeNotificationScheduled: undefined },
//   };
//   return newProgress;
// }

// function Progress_getNextSupersetEntry(
//   entries: IHistoryEntry[],
//   entry: IHistoryEntry
// ): IHistoryEntry | undefined {
//   const superset: string | undefined = entry.superset;
//   if (superset == null) {
//     return undefined;
//   }
//   const supersetGroups = Progress_getSupersetGroups(entries);
//   const supersetGroup: IHistoryEntry[] = supersetGroups?.[superset] ?? [];
//   if (supersetGroup.length <= 1) {
//     return undefined;
//   }
//   const supersetIndex = supersetGroup?.findIndex((e) => e.id === entry!.id);
//   if (supersetIndex == null || supersetIndex < 0) {
//     return undefined;
//   }
//   return supersetGroup[(supersetIndex + 1) % supersetGroup.length];
// }
//
// function Progress_getNextEntry(
//   progress: IHistoryRecord,
//   entry: IHistoryEntry,
//   mode: "workout" | "warmup",
//   shouldGoToNextEntry: boolean,
// ): IHistoryEntry | undefined {
//   if (Progress_isFullyEmptyOrFinishedSet(progress)) {
//     return undefined;
//   }
//   const visitedAndFinished = new Set<IHistoryEntry>();
//   let currentEntry: IHistoryEntry | undefined = entry;
//   let isInitial = true;
//   const supersetGroups = Progress_getSupersetGroups(progress.entries);
//   while (currentEntry != null) {
//     let index = progress.entries.findIndex(
//       (e) => e.id != null && e.id === currentEntry?.id,
//     );
//     if (index === -1) {
//       index = progress.entries.findIndex((e) => e === currentEntry);
//     }
//     const superset: string | undefined = currentEntry.superset;
//     if (
//       mode === "workout" &&
//       superset != null &&
//       !visitedAndFinished.has(currentEntry)
//     ) {
//       const supersetGroup: IHistoryEntry[] = supersetGroups?.[superset] ?? [];
//       if (supersetGroup.length > 1) {
//         const supersetIndex = supersetGroup?.findIndex(
//           (e) => e.id === currentEntry?.id,
//         );
//         currentEntry =
//           supersetGroup[(supersetIndex + 1) % supersetGroup.length];
//       } else {
//         if (shouldGoToNextEntry) {
//           currentEntry =
//             progress.entries[(index + 1) % progress.entries.length];
//         } else {
//           return currentEntry;
//         }
//       }
//     } else if (Reps_isEmptyOrFinished(currentEntry.sets)) {
//       if (shouldGoToNextEntry) {
//         const prevEntry: IHistoryEntry = currentEntry;
//         currentEntry = progress.entries[(index + 1) % progress.entries.length];
//         if (currentEntry === prevEntry) {
//           return undefined;
//         }
//       } else {
//         return undefined;
//       }
//     }
//     if (currentEntry == null) {
//       return undefined;
//     }
//     if (!Reps_isEmptyOrFinished(currentEntry.sets)) {
//       return currentEntry;
//     } else if (!isInitial) {
//       visitedAndFinished.add(currentEntry);
//     }
//     isInitial = false;
//   }
//   return undefined;
// }

// function Progress_getNextEntryIndex(
//   progress: IHistoryRecord,
//   entry: IHistoryEntry,
//   mode: "workout" | "warmup"
// ): number | undefined {
//   const nextEntry = Progress_getNextEntry(progress, entry, mode, false);
//   if (nextEntry != null) {
//     let index = progress.entries.findIndex((e) => e.id != null && e.id === nextEntry.id);
//     if (index === -1) {
//       index = progress.entries.findIndex((e) => e === nextEntry);
//     }
//     return index === -1 ? undefined : index;
//   }
//   return undefined;
// }

// function Progress_updateTimer(
//   progress: IHistoryRecord,
//   program: IProgram | undefined,
//   newTimer: number,
//   timerSince: number,
//   liveActivityEntryIndex: number | undefined,
//   liveActivitySetIndex: number | undefined,
//   skipLiveActivityUpdate: boolean,
//   settings: ISettings,
//   subscription: ISubscription | undefined
// ): IHistoryRecord {
//   const timerForPush = newTimer - Math.round((Date.now() - timerSince) / 1000);
//   if (timerForPush > 0) {
//     const newProgress = Progress_startTimer(
//       progress,
//       progress.timerSince || Date.now(),
//       progress.timerMode || "workout",
//       progress.timerEntryIndex || 0,
//       progress.timerSetIndex || 0,
//       settings,
//       subscription,
//       newTimer,
//       true
//     );
//     if (!skipLiveActivityUpdate) {
//       LiveActivityManager_updateProgressLiveActivity(
//         program,
//         progress,
//         settings,
//         subscription,
//         liveActivityEntryIndex,
//         liveActivitySetIndex,
//         newTimer,
//         progress.timerSince || Date.now()
//       );
//     }
//     return newProgress;
//   } else {
//     SendMessage_toIos({ type: "stopTimer" });
//     SendMessage_toAndroid({ type: "stopTimer" });
//     const newProgress = {
//       ...progress,
//       timer: Math.max(0, newTimer),
//       ui: {
//         ...progress.ui,
//         nativeNotificationScheduled: undefined,
//       },
//     };
//     if (!skipLiveActivityUpdate) {
//       LiveActivityManager_updateProgressLiveActivity(
//         program,
//         progress,
//         settings,
//         subscription,
//         liveActivityEntryIndex,
//         liveActivitySetIndex,
//         Math.max(0, newTimer),
//         progress.timerSince || Date.now()
//       );
//     }
//     return newProgress;
//   }
// }
//
// function Progress_maybeApplySuperset(
//   progress: IHistoryRecord,
//   entryIndex: number,
//   mode: "workout" | "warmup"
// ): IHistoryRecord {
//   if (!Progress_isCurrent(progress)) {
//     return progress;
//   }
//   const entry = progress.entries[entryIndex];
//   const nextEntryIndex = Progress_getNextEntryIndex(progress, entry, mode);
//   if (nextEntryIndex != null) {
//     return { ...progress, ui: { ...progress.ui, currentEntryIndex: nextEntryIndex } };
//   }
//   return progress;
// }
//
// function Progress_stopTimer(progress: IHistoryRecord): IHistoryRecord {
//   SendMessage_toIos({ type: "stopTimer" });
//   SendMessage_toAndroid({ type: "stopTimer" });
//   return Progress_stopTimerPure(progress);
// }

// function Progress_stopTimerPure(progress: IHistoryRecord): IHistoryRecord {
//   return {
//     ...progress,
//     timerSince: undefined,
//     timerMode: undefined,
//     timer: undefined,
//     timerSetIndex: undefined,
//     timerEntryIndex: undefined,
//   };
// }

// function Progress_setTimerValue(progress: IHistoryRecord, newTimer: number): IHistoryRecord {
//   if (progress.timerSince == null) {
//     return progress;
//   }
//   return {
//     ...progress,
//     timer: Math.max(0, newTimer),
//   };
// }
//
// function Progress_findEntryByExercise(
//   progress: IHistoryRecord,
//   exerciseType: IExerciseType
// ): IHistoryEntry | undefined {
//   return progress.entries.find((entry) => entry.exercise === exerciseType);
// }
//
// function Progress_isFullyCompletedSet(progress: IHistoryRecord): boolean {
//   return progress.entries.every((entry) => Progress_isCompletedSet(entry));
// }

// function Progress_isCompletedSet(entry: IHistoryEntry): boolean {
//   return Reps_isCompleted(entry.sets);
// }
//
// function Progress_isFullyFinishedSet(progress: IHistoryRecord): boolean {
//   return progress.entries.every((entry) => Progress_isFinishedSet(entry));
// }
//
// function Progress_isFullyEmptySet(progress: IHistoryRecord): boolean {
//   return progress.entries.every((entry) => Reps_isEmpty(entry.sets));
// }

// function Progress_isFinishedSet(entry: IHistoryEntry): boolean {
//   return Reps_isFinished(entry.sets);
// }

// function Progress_isFullyEmptyOrFinishedSet(progress: IHistoryRecord): boolean {
//   return progress.entries.every((entry) =>
//     Progress_isEmptyOrFinishedSet(entry),
//   );
// }

// function Progress_isEmptyOrFinishedSet(entry: IHistoryEntry): boolean {
//   return Reps_isEmptyOrFinished(entry.sets);
// }

// function Progress_hasLastUnfinishedSet(entry: IHistoryEntry): boolean {
//   return entry.sets.filter((s) => !s.isCompleted).length === 1;
// }

// function Progress_isChanged(aProgress?: IHistoryRecord, bProgress?: IHistoryRecord): boolean {
//   if (aProgress != null && bProgress == null) {
//     return true;
//   } else if (aProgress == null && bProgress != null) {
//     return true;
//   } else if (aProgress == null && bProgress == null) {
//     return false;
//   } else {
//     const changed = !ObjectUtils_isEqual(aProgress!, bProgress!);
//     return changed;
//   }
// }
//
// function Progress_showUpdateDate(progress: IHistoryRecord, date: string, time: number): IHistoryRecord {
//   return {
//     ...progress,
//     ui: {
//       ...progress.ui,
//       dateModal: { date, time },
//     },
//   };
// }
//
// function Progress_getColorToSupersetGroup(progress: IHistoryRecord): Partial<Record<string, IHistoryEntry[]>> {
//   const groups = Progress_getSupersetGroups(progress.entries);
//   const colors = ["red", "blue", "green", "purple"];
//   let index = 0;
//   return ObjectUtils_entriesNonnull(groups).reduce<Partial<Record<string, IHistoryEntry[]>>>((memo, [, group]) => {
//     const color = colors[index % colors.length];
//     memo[color] = group;
//     index += 1;
//     return memo;
//   }, {});
// }
//
// function Progress_getSupersetGroups(
//   entries: IHistoryEntry[],
// ): Partial<Record<string, IHistoryEntry[]>> {
//   const groups: Partial<Record<string, IHistoryEntry[]>> = {};
//   for (const entry of entries) {
//     if (entry.superset != null) {
//       if (!groups[entry.superset]) {
//         groups[entry.superset] = [];
//       }
//       groups[entry.superset]!.push(entry);
//     }
//   }
//   return groups;
// }

// function Progress_stop(
//   progresses: Record<number, IHistoryRecord | undefined>,
//   id: number
// ): Record<number, IHistoryRecord | undefined> {
//   return ObjectUtils_keys(progresses).reduce<Record<number, IHistoryRecord | undefined>>((memo, k) => {
//     const p = progresses[k];
//     if (p != null && p.id !== id) {
//       memo[k] = p;
//     }
//     return memo;
//   }, {});
// }

// function Progress_changeDate(progress: IHistoryRecord, dateStr?: string, time?: number): IHistoryRecord {
//   let startTime = progress.startTime;
//   const startTimeDate = new Date(startTime);
//   const date = dateStr != null ? DateUtils_fromYYYYMMDD(dateStr) : undefined;
//   if (date != null) {
//     startTime = new Date(
//       date.getFullYear(),
//       date.getMonth(),
//       date.getDate(),
//       startTimeDate.getHours(),
//       startTimeDate.getMinutes(),
//       startTimeDate.getSeconds()
//     ).getTime();
//   }
//   const endTime = time != null ? startTime + time : startTime + History_workoutTime(progress);
//   return {
//     ...progress,
//     ...(dateStr != null ? { date: DateUtils_fromYYYYMMDDStr(dateStr) } : {}),
//     startTime,
//     intervals: [[startTime, endTime]],
//     endTime,
//     ui: {
//       ...progress.ui,
//       dateModal: undefined,
//     },
//   };
// }
//
// function Progress_getProgressId(state: Pick<IState, "progress">): number {
//   const editIds = Object.keys((state as IState).progress)
//     .map(Number)
//     .filter(Boolean);
//   return editIds.length > 0 ? editIds[0] : 0;
// }
//
// function Progress_lbProgress(progressId?: number): LensBuilder<IState, IHistoryRecord, {}, undefined> {
//   if (progressId == null || progressId === 0) {
//     return lb<IState>().p("storage").pi("progress").i(0);
//   } else {
//     return lb<IState>().pi("progress").pi(progressId);
//   }
// }

// function Progress_getCurrentProgress(state: Pick<IState, "storage">): IHistoryRecord | undefined {
//   return state.storage.progress?.[0];
// }
//
// function Progress_getProgress(state: Pick<IState, "progress" | "storage">): IHistoryRecord | undefined {
//   const progressId = Progress_getProgressId(state);
//   if (progressId === 0) {
//     return state.storage.progress?.[0];
//   } else {
//     return (state as IState).progress[progressId];
//   }
// }
//
// function Progress_setProgress(state: IState, progress: IHistoryRecord): IState {
//   if (progress.id === 0) {
//     return lf(state).p("storage").p("progress").set([progress]);
//   } else {
//     return lf(state).pi("progress").p(progress.id).set(progress);
//   }
// }

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
    // @todo browser code in non-browser function, should be bubbled up
    // alert(`Error during executing 'update: custom()' script: ${e.message}`);
    return entry;
  }
}

// function Progress_runInitialUpdateScripts(
//   aProgress: IHistoryRecord,
//   programExerciseIds: string[] | undefined,
//   day: number,
//   program: IEvaluatedProgram,
//   settings: ISettings,
//   stats: IStats
// ): IHistoryRecord {
//   const programDay = Program_getProgramDay(program, day);
//   if (!programDay) {
//     return aProgress;
//   }
//   const dayExercises = Program_getProgramDayUsedExercises(programDay);
//   const programExercises = programExerciseIds
//     ? CollectionUtils_compact(programExerciseIds.map((id) => dayExercises.find((e) => e.key === id)))
//     : dayExercises;
//
//   return {
//     ...aProgress,
//     entries: aProgress.entries.map((entry) => {
//       const programExercise =
//         entry.programExerciseId != null ? programExercises.find((e) => e.key === entry.programExerciseId) : undefined;
//       if (!programExercise) {
//         return entry;
//       }
//       return Progress_runUpdateScriptForEntry(
//         entry,
//         Progress_getDayData(aProgress),
//         programExercise,
//         program.states,
//         -1,
//         settings,
//         stats
//       );
//     }),
//   };
// }
//
// function Progress_runUpdateScript(
//   aProgress: IHistoryRecord,
//   programExercise: IPlannerProgramExercise,
//   otherStates: IByTag<IProgramState>,
//   entryIndex: number,
//   setIndex: number,
//   mode: IProgressMode,
//   settings: ISettings,
//   stats: IStats
// ): IHistoryRecord {
//   if (mode === "warmup") {
//     return aProgress;
//   }
//   const entry = aProgress.entries[entryIndex];
//   const newEntry = Progress_runUpdateScriptForEntry(
//     entry,
//     Progress_getDayData(aProgress),
//     programExercise,
//     otherStates,
//     setIndex,
//     settings,
//     stats
//   );
//   const progress = lf(aProgress).p("entries").i(entryIndex).set(newEntry);
//   return progress;
// }

export function CollectionUtils_findIndexReverse<T>(
  from: T[],
  cb: (item: T) => boolean,
): number {
  for (let i = from.length - 1; i >= 0; i -= 1) {
    if (cb(from[i])) {
      return i;
    }
  }
  return -1;
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
          id: generateUid(6),
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

// function Progress_completeAmrapSet(
//   progress: IHistoryRecord,
//   entryIndex: number,
//   setIndex: number,
//   settings: ISettings
// ): IHistoryRecord {
//   const entry = progress.entries[entryIndex];
//   const isUnilateral = Exercise_getIsUnilateral(entry.exercise, settings);
//   return lf(progress)
//     .p("entries")
//     .i(entryIndex)
//     .p("sets")
//     .i(setIndex)
//     .modify((progressSet) => {
//       return {
//         ...progressSet,
//         timestamp: !progressSet.isCompleted ? Date.now() : progressSet.timestamp,
//         completedRepsLeft: isUnilateral ? (progressSet.completedRepsLeft ?? progressSet.reps) : undefined,
//         completedReps: progressSet.completedReps ?? progressSet.reps,
//         completedWeight: progressSet.completedWeight ?? progressSet.weight,
//         isCompleted: !progressSet.isCompleted,
//       };
//     });
// }
//
// function Progress_shouldShowAmrapModal(
//   entry: IHistoryEntry,
//   setIndex: number,
//   mode: IProgressMode,
//   hasUserPromptedVars: boolean,
//   settings: ISettings
// ): boolean {
//   const set = mode === "warmup" ? entry.warmupSets[setIndex] : entry.sets[setIndex];
//   const shouldLogRpe = !!set?.logRpe;
//   const shouldPromptUserVars = hasUserPromptedVars && Progress_hasLastUnfinishedSet(entry);
//   const isUnilateral = Exercise_getIsUnilateral(entry.exercise, settings);
//   const isAmrap =
//     (set?.completedReps == null || (isUnilateral && set?.completedRepsLeft == null)) &&
//     (!!set?.isAmrap || set.reps == null);
//   const shouldAskWeight = set?.completedWeight == null && (!!set?.askWeight || set.weight == null);
//   return !set.isCompleted && (shouldLogRpe || shouldPromptUserVars || isAmrap || shouldAskWeight);
// }
//
// function Progress_completeSet(
//   progress: IHistoryRecord,
//   entryIndex: number,
//   setIndex: number,
//   mode: IProgressMode,
//   hasUserPromptedVars: boolean,
//   settings: ISettings
// ): IHistoryRecord {
//   const entry = progress.entries[entryIndex];
//   const set = mode === "warmup" ? entry.warmupSets[setIndex] : entry.sets[setIndex];
//   const shouldLogRpe = !!set?.logRpe;
//   const shouldPromptUserVars = hasUserPromptedVars && Progress_hasLastUnfinishedSet(entry);
//   const isUnilateral = Exercise_getIsUnilateral(entry.exercise, settings);
//   const isAmrap =
//     (set?.completedReps == null || (isUnilateral && set?.completedRepsLeft == null)) &&
//     (!!set?.isAmrap || set.reps == null);
//   const shouldAskWeight = set?.completedWeight == null && (!!set?.askWeight || set.weight == null);
//   if (mode === "warmup") {
//     return lf(progress)
//       .p("entries")
//       .i(entryIndex)
//       .p("warmupSets")
//       .i(setIndex)
//       .modify((progressSet) => {
//         return {
//           ...progressSet,
//           timestamp: !progressSet.isCompleted ? Date.now() : progressSet.timestamp,
//           completedRepsLeft: isUnilateral ? (progressSet.completedRepsLeft ?? progressSet.reps) : undefined,
//           completedReps: progressSet.completedReps ?? progressSet.reps,
//           completedWeight: progressSet.completedWeight ?? progressSet.weight,
//           isCompleted: !progressSet.isCompleted,
//         };
//       });
//   } else if (Progress_shouldShowAmrapModal(entry, setIndex, mode, hasUserPromptedVars, settings)) {
//     const amrapUi: IProgressUi = {
//       amrapModal: {
//         entryIndex,
//         setIndex,
//         nonce: Date.now(),
//         logRpe: shouldLogRpe,
//         userVars: shouldPromptUserVars,
//         isAmrap: isAmrap,
//         askWeight: shouldAskWeight,
//       },
//     };
//     return { ...progress, ui: { ...progress.ui, ...amrapUi } };
//   } else {
//     return Progress_completeAmrapSet(progress, entryIndex, setIndex, settings);
//   }
// }
//
// function Progress_getIsRpeEnabled(sets: ISet[]): boolean {
//   return sets.some((set) => set.rpe != null);
// }
//
// function Progress_getIsMinRepsEnabled(sets: ISet[]): boolean {
//   return sets.some((set) => set.minReps != null);
// }
//
// function Progress_updateAmrapRepsInExercise(progress: IHistoryRecord, value?: number): IHistoryRecord {
//   if (progress.ui?.amrapModal != null) {
//     const { entryIndex, setIndex } = progress.ui.amrapModal;
//     return lf(progress).p("entries").i(entryIndex).p("sets").i(setIndex).p("completedReps").set(value);
//   } else {
//     return progress;
//   }
// }
//
// function Progress_updateAmrapRepsLeftInExercise(progress: IHistoryRecord, value?: number): IHistoryRecord {
//   if (progress.ui?.amrapModal != null) {
//     const { entryIndex, setIndex } = progress.ui.amrapModal;
//     return lf(progress).p("entries").i(entryIndex).p("sets").i(setIndex).p("completedRepsLeft").set(value);
//   } else {
//     return progress;
//   }
// }
//
// function Progress_updateRpeInExercise(progress: IHistoryRecord, value?: number): IHistoryRecord {
//   if (progress.ui?.amrapModal != null) {
//     const { entryIndex, setIndex } = progress.ui.amrapModal;
//     const newValue = value != null ? Math.round(Math.min(10, Math.max(0, value)) / 0.5) * 0.5 : undefined;
//     return lf(progress).p("entries").i(entryIndex).p("sets").i(setIndex).p("completedRpe").set(newValue);
//   } else {
//     return progress;
//   }
// }
//
// function Progress_updateWeightInExercise(progress: IHistoryRecord, value?: IWeight): IHistoryRecord {
//   if (progress.ui?.amrapModal != null) {
//     const { entryIndex, setIndex } = progress.ui.amrapModal;
//     return lf(progress).p("entries").i(entryIndex).p("sets").i(setIndex).p("completedWeight").set(value);
//   } else {
//     return progress;
//   }
// }
//
// function Progress_updateUserPromptedStateVars(
//   progress: IHistoryRecord,
//   programExerciseId: string,
//   userPromptedStateVars: IProgramState
// ): IHistoryRecord {
//   return {
//     ...progress,
//     userPromptedStateVars: {
//       ...(progress.userPromptedStateVars || {}),
//       [programExerciseId]: userPromptedStateVars,
//     },
//   };
// }
//
// function Progress_editExerciseNotes(dispatch: IDispatch, entryIndex: number, notes: string): void {
//   updateProgress(dispatch, [lb<IHistoryRecord>().p("entries").i(entryIndex).p("notes").record(notes)], "edit-notes");
// }
//
// function Progress_addExercise(dispatch: IDispatch, exerciseType: IExerciseType, numberOfEntries: number): void {
//   updateProgress(
//     dispatch,
//     [
//       lb<IHistoryRecord>()
//         .p("entries")
//         .recordModify((entries) => {
//           return [...entries, History_createCustomEntry(exerciseType, numberOfEntries)].map((e, i) => ({
//             ...e,
//             index: i,
//           }));
//         }),
//     ],
//     "add-exercise"
//   );
// }
//
// function Progress_isEligibleForInferredWeight(set: ISet): boolean {
//   return set.originalWeight == null && set.reps != null && set.rpe != null;
// }
//
// function Progress_updateSetWeights(
//   entry: IHistoryEntry,
//   exerciseType: IExerciseType,
//   settings: ISettings,
// ): IHistoryEntry {
//   const newSets = entry.sets.map((set) => {
//     if (
//       (Progress_isEligibleForInferredWeight(set) ||
//         Weight_isPct(set.originalWeight)) &&
//       !set.isCompleted
//     ) {
//       const originalWeight =
//         set.originalWeight ?? Weight_rpePct(set.reps ?? 1, set.rpe ?? 10);
//       const evaluatedWeight = Weight_evaluateWeight(
//         originalWeight,
//         exerciseType,
//         settings,
//       );
//       const unit =
//         Equipment_getUnitForExerciseType(settings, exerciseType) ??
//         settings.units;
//       const weight = Weight_roundConvertTo(
//         evaluatedWeight,
//         settings,
//         unit,
//         exerciseType,
//       );
//       return { ...set, weight };
//     }
//     return set;
//   });
//   return { ...entry, sets: newSets };
// }
//
// function Progress_doesUse1RM(entry: IHistoryEntry): boolean {
//   return entry.sets.some((set) => (set.originalWeight == null ? set.rpe != null : Weight_isPct(set.originalWeight)));
// }
//
// function Progress_changeExercise(
//   dispatch: IDispatch,
//   settings: ISettings,
//   progressId: number,
//   exerciseType: IExerciseType,
//   entryIndex: number,
//   shouldKeepProgramExerciseId: boolean
// ): void {
//   updateState(
//     dispatch,
//     [
//       Progress_lbProgress(progressId)
//         .p("entries")
//         .i(entryIndex)
//         .recordModify((entry) => {
//           entry = Progress_updateSetWeights(entry, exerciseType, settings);
//           return {
//             ...entry,
//             exercise: exerciseType,
//             ...(shouldKeepProgramExerciseId ? {} : { programExerciseId: undefined }),
//             changed: true,
//           };
//         }),
//     ],
//     "Change exercise"
//   );
// }
//
// function Progress_changeEquipment(
//   dispatch: IDispatch,
//   progressId: number,
//   entryIndex: number,
//   equipment: IEquipment
// ): void {
//   updateState(
//     dispatch,
//     [Progress_lbProgress(progressId).p("entries").i(entryIndex).p("exercise").p("equipment").record(equipment)],
//     "Change equipment"
//   );
// }
//
// function Progress_editNotes(dispatch: IDispatch, progressId: number, notes: string): void {
//   updateState(dispatch, [Progress_lbProgress(progressId).p("notes").record(notes)], "Edit workout notes");
// }

function Progress_getDayData(progress: IHistoryRecord): IDayData {
  return {
    day: progress.day,
    week: progress.week,
    dayInWeek: progress.dayInWeek,
  };
}

// function Progress_applyProgramExercise(
//   progressEntry: IHistoryEntry | undefined,
//   index: number,
//   programExercise: IPlannerProgramExerciseWithType,
//   settings: ISettings,
//   forceWarmupSets?: boolean
// ): IHistoryEntry {
//   const variationIndex = PlannerProgramExercise_currentSetVariationIndex(programExercise);
//   const sets = programExercise.evaluatedSetVariations[variationIndex].sets;
//   const programExerciseWarmupSets = PlannerProgramExercise_programWarmups(programExercise, settings);
//
//   if (progressEntry != null) {
//     const newSetsNum = Math.max(progressEntry.sets.length, sets.length);
//     const newSets: ISet[] = [];
//     for (let i = 0; i < newSetsNum; i++) {
//       const progressSet: ISet | undefined = progressEntry.sets[i] as ISet | undefined;
//       const programSet = sets[i];
//       if (!!progressSet?.isCompleted) {
//         newSets.push(progressSet);
//       } else if (programSet != null) {
//         const originalWeight = programSet.weight;
//         const weight = ProgramSet_getEvaluatedWeight(programSet, programExercise.exerciseType, settings);
//         newSets.push({
//           ...progressSet,
//           id: progressSet?.id ?? UidFactory_generateUid(6),
//           vtype: "set",
//           index: newSets.length,
//           reps: programSet.maxrep,
//           minReps: programSet.minrep,
//           rpe: programSet.rpe,
//           isUnilateral: Exercise_getIsUnilateral(programExercise.exerciseType, settings),
//           originalWeight,
//           weight,
//           isAmrap: programSet.isAmrap,
//           logRpe: programSet.logRpe,
//           label: programSet.label,
//         });
//       }
//     }
//     let newWarmupSets = progressEntry.warmupSets;
//     if (progressEntry.warmupSets.every((w) => !w.isCompleted)) {
//       const firstWeight = newSets[0]?.weight;
//       forceWarmupSets = forceWarmupSets || Reps_isEmpty(newSets);
//       if (forceWarmupSets) {
//         const generated =
//           firstWeight != null
//             ? Exercise_getWarmupSets(programExercise.exerciseType, firstWeight, settings, programExerciseWarmupSets)
//             : [];
//         newWarmupSets = generated.map((ws, i) => ({
//           ...ws,
//           id: progressEntry.warmupSets[i]?.id ?? ws.id,
//         }));
//       } else {
//         newWarmupSets = progressEntry.warmupSets;
//       }
//     }
//
//     return {
//       ...progressEntry,
//       exercise: progressEntry.changed ? progressEntry.exercise : programExercise.exerciseType,
//       warmupSets: newWarmupSets,
//       sets: newSets,
//     };
//   } else {
//     const newSets = sets.map((set, i) => {
//       const weight = ProgramSet_getEvaluatedWeight(set, programExercise.exerciseType, settings);
//       return {
//         vtype: "set" as const,
//         id: UidFactory_generateUid(6),
//         index: i,
//         reps: set.maxrep,
//         minReps: set.minrep,
//         originalWeight: set.weight,
//         isUnilateral: Exercise_getIsUnilateral(programExercise.exerciseType, settings),
//         weight,
//         rpe: set.rpe,
//         logRpe: set.logRpe,
//         isAmrap: set.isAmrap,
//         label: set.label,
//       };
//     });
//     const firstWeight = newSets[0]?.weight;
//
//     return {
//       vtype: "history_entry",
//       index,
//       id: Progress_getEntryId(programExercise.exerciseType, programExercise.label),
//       exercise: programExercise.exerciseType,
//       programExerciseId: programExercise.key,
//       sets: newSets,
//       warmupSets:
//         firstWeight != null
//           ? Exercise_getWarmupSets(programExercise.exerciseType, firstWeight, settings, programExerciseWarmupSets)
//           : [],
//     };
//   }
// }

function Progress_getEntryId(
  exerciseType: IExerciseType,
  label?: string,
): string {
  return [label, Exercise_toKey(exerciseType)].filter(definedOnly).join("_");
}

// function Progress_applyProgramDay(
//   progress: IHistoryRecord,
//   program: IEvaluatedProgram,
//   day: number,
//   settings: ISettings,
//   programExerciseIds?: string[]
// ): IHistoryRecord {
//   const programDay = Program_getProgramDay(program, day);
//   if (!programDay) {
//     return progress;
//   }
//   const newEntries = progress.entries.map((entry, index) => {
//     if (entry.programExerciseId == null) {
//       return entry;
//     }
//     if (programExerciseIds != null && !programExerciseIds.includes(entry.programExerciseId)) {
//       return entry;
//     }
//     const programExercise = Program_getProgramExerciseForKeyAndDay(program, day, entry.programExerciseId);
//     if (!programExercise) {
//       return entry;
//     }
//     return Progress_applyProgramExercise(entry, index, programExercise, settings, false);
//   });
//
//   return { ...progress, entries: newEntries };
// }
//
// function Progress_changeAmrapAction(
//   settings: ISettings,
//   stats: IStats,
//   progress: IHistoryRecord,
//   action: IChangeAMRAPAction,
//   subscription: ISubscription | undefined
// ): IHistoryRecord {
//   let newProgress = { ...progress };
//   if (
//     action.amrapValue == null &&
//     action.amrapLeftValue == null &&
//     action.rpeValue == null &&
//     action.weightValue == null &&
//     ObjectUtils_keys(action.userVars || {}).length === 0
//   ) {
//     return { ...newProgress, ui: { ...newProgress.ui, amrapModal: undefined } };
//   }
//   if (action.amrapValue != null) {
//     newProgress = Progress_updateAmrapRepsInExercise(newProgress, action.amrapValue);
//   }
//   if (action.amrapLeftValue != null) {
//     newProgress = Progress_updateAmrapRepsLeftInExercise(newProgress, action.amrapLeftValue);
//   }
//   if (action.logRpe) {
//     newProgress = Progress_updateRpeInExercise(newProgress, action.rpeValue);
//   }
//   if (action.weightValue != null) {
//     newProgress = Progress_updateWeightInExercise(newProgress, action.weightValue);
//   }
//   const programExerciseId = action.programExercise?.key;
//   if (ObjectUtils_keys(action.userVars || {}).length > 0 && programExerciseId != null) {
//     newProgress = Progress_updateUserPromptedStateVars(newProgress, programExerciseId, action.userVars || {});
//   }
//   newProgress = Progress_completeAmrapSet(newProgress, action.entryIndex, action.setIndex, settings);
//   if (action.programExercise) {
//     newProgress = Progress_runUpdateScript(
//       newProgress,
//       action.programExercise,
//       action.otherStates || {},
//       action.entryIndex,
//       action.setIndex,
//       "workout",
//       settings,
//       stats
//     );
//   }
//   if (Progress_isFullyFinishedSet(newProgress)) {
//     newProgress = Progress_stopTimer(newProgress);
//   }
//   newProgress = Progress_maybeApplySuperset(newProgress, action.entryIndex, "workout");
//   newProgress = Progress_startTimer(
//     newProgress,
//     new Date().getTime(),
//     "workout",
//     action.entryIndex,
//     action.setIndex,
//     settings,
//     subscription
//   );
//   newProgress.intervals = History_resumeWorkout(
//     newProgress,
//     action.isPlayground,
//     settings.timers.reminder,
//     subscription != null && Subscriptions_hasSubscription(subscription)
//   );
//   LiveActivityManager_updateLiveActivityForNextEntry(
//     newProgress,
//     action.entryIndex,
//     "workout",
//     action.programExercise,
//     settings,
//     subscription
//   );
//   return { ...newProgress, ui: { ...newProgress.ui, amrapModal: undefined } };
// }
//
// function Progress_completeSetAction(
//   settings: ISettings,
//   stats: IStats,
//   progress: IHistoryRecord,
//   action: ICompleteSetAction,
//   subscription: ISubscription | undefined
// ): IHistoryRecord {
//   const hasUserPromptedVars = action.programExercise && ProgramExercise_hasUserPromptedVars(action.programExercise);
//   let newProgress = Progress_completeSet(
//     progress,
//     action.entryIndex,
//     action.setIndex,
//     action.mode,
//     !!hasUserPromptedVars,
//     settings
//   );
//   const oldSet = progress.entries[action.entryIndex][action.mode === "warmup" ? "warmupSets" : "sets"][action.setIndex];
//   const newSet =
//     newProgress.entries[action.entryIndex][action.mode === "warmup" ? "warmupSets" : "sets"][action.setIndex];
//   const didFinish = !oldSet.isCompleted && newSet.isCompleted;
//   if (action.programExercise && !newProgress.ui?.amrapModal) {
//     newProgress = Progress_runUpdateScript(
//       newProgress,
//       action.programExercise,
//       action.otherStates || {},
//       action.entryIndex,
//       action.setIndex,
//       action.mode,
//       settings,
//       stats
//     );
//   }
//
//   if (Progress_isFullyFinishedSet(newProgress)) {
//     newProgress = Progress_stopTimer(newProgress);
//   }
//   if (didFinish) {
//     newProgress = Progress_maybeApplySuperset(newProgress, action.entryIndex, action.mode);
//   }
//   if (!action.isPlayground) {
//     newProgress = Progress_startTimer(
//       newProgress,
//       new Date().getTime(),
//       action.mode,
//       action.entryIndex,
//       action.setIndex,
//       settings,
//       subscription
//     );
//   }
//   newProgress.intervals = History_resumeWorkout(
//     newProgress,
//     action.isPlayground,
//     settings.timers.reminder,
//     subscription != null && Subscriptions_hasSubscription(subscription)
//   );
//   LiveActivityManager_updateLiveActivityForNextEntry(
//     newProgress,
//     action.entryIndex,
//     action.mode,
//     action.programExercise,
//     settings,
//     subscription
//   );
//   if (action.forceUpdateEntryIndex) {
//     newProgress = {
//       ...newProgress,
//       ui: { ...newProgress.ui, forceUpdateEntryIndex: !newProgress.ui?.forceUpdateEntryIndex },
//     };
//   }
//   if (action.isExternal) {
//     newProgress = {
//       ...newProgress,
//       ui: { ...newProgress.ui, isExternal: true },
//     };
//   }
//   return newProgress;
// }
//
// function Progress_forceUpdateEntryIndex(dispatch: IDispatch): void {
//   updateProgress(
//     dispatch,
//     [
//       lb<IHistoryRecord>()
//         .pi("ui", {})
//         .p("forceUpdateEntryIndex")
//         .recordModify((v) => !v),
//     ],
//     "Force update entry index"
//   );
// }
//
// function Progress_finishWorkout(storage: IStorage, progress: IHistoryRecord): IStorage {
//   const settings = storage.settings;
//   const programIndex = storage.programs.findIndex((p) => p.id === progress.programId)!;
//   const program = progress.programId === emptyProgramId ? Program_createEmptyProgram() : storage.programs[programIndex];
//   const evaluatedProgram = program ? Program_evaluate(program, settings) : undefined;
//   Progress_stopTimer(progress);
//   const historyRecord = History_finishProgramDay(progress, storage.settings, progress.day, evaluatedProgram);
//   let newHistory;
//   if (!Progress_isCurrent(progress)) {
//     newHistory = storage.history.map((h) => (h.id === progress.id ? historyRecord : h));
//   } else {
//     newHistory = [historyRecord, ...storage.history];
//   }
//   const exerciseData = storage.settings.exerciseData;
//   const { program: newProgram, exerciseData: newExerciseData } =
//     Progress_isCurrent(progress) && program != null
//       ? Program_runAllFinishDayScripts(program, progress, storage.stats, settings)
//       : { program, exerciseData };
//   const newPrograms = newProgram != null ? lf(storage.programs).i(programIndex).set(newProgram) : storage.programs;
//   const newSettingsExerciseData = deepmerge(storage.settings.exerciseData, newExerciseData);
//   return {
//     ...storage,
//     progress: Progress_isCurrent(progress) ? [] : storage.progress,
//     history: newHistory,
//     programs: newPrograms,
//     settings: {
//       ...storage.settings,
//       exerciseData: newSettingsExerciseData,
//     },
//   };
// }

//#endregion

//#region Weight
const prebuiltWeights: Partial<Record<string, IWeight>> = {};

// function Weight_display(
//   weight: IWeight | IPercentage | number,
//   withUnit: boolean = true,
// ): string {
//   if (typeof weight === "number") {
//     return `${weight}`;
//   } else if (Weight_isPct(weight)) {
//     return `${weight.value}${withUnit ? "%" : ""}`;
//   } else {
//     return `${parseFloat(weight.value.toFixed(2)).toString()}${withUnit ? ` ${weight.unit}` : ""}`;
//   }
// }

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

// function Weight_oppositeUnit(unit: IUnit): IUnit {
//   return unit === "kg" ? "lb" : "kg";
// }

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

// function Weight_printOrNumber(weight: IWeight | IPercentage | number): string {
//   return typeof weight === "number" ? `${weight}` : Weight_print(weight);
// }

function Weight_buildPct(value: number): IPercentage {
  return { value, unit: "%" };
}

// function Weight_buildAny(value: number, unit: IUnit | "%"): IWeight | IPercentage {
//   if (unit === "%") {
//     return Weight_buildPct(value);
//   } else {
//     return Weight_build(value, unit);
//   }
// }

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

// function Weight_clone(value: IWeight): IWeight {
//   return Weight_build(value.value, value.unit);
// }

// function Weight_isOrPct(object: unknown): object is IWeight | IPercentage {
//   const objWeight = object as IWeight | IPercentage;
//   return (
//     objWeight &&
//     typeof objWeight === "object" &&
//     "unit" in objWeight &&
//     "value" in objWeight &&
//     (objWeight.unit === "kg" || objWeight.unit === "lb" || objWeight.unit === "%")
//   );
// }

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

// function Weight_getNRepMax(oneRepMax: IWeight, reps: number): IWeight {
//   if (reps === 0) {
//     return Weight_build(0, oneRepMax.unit);
//   } else if (reps === 1) {
//     return oneRepMax;
//   } else {
//     return Weight_roundTo005(Weight_multiply(oneRepMax, Weight_rpeMultiplier(reps, 10)));
//   }
// }

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

// function Weight_platesWeight(plates: IPlate[]): IWeight {
//   const unit = plates[0]?.weight.unit || "lb";
//   return plates.reduce(
//     (memo, plate) => Weight_add(memo, Weight_multiply(plate.weight, plate.num)),
//     Weight_build(0, unit)
//   );
// }

// function Weight_formatOneSide(settings: ISettings, platesArr: IPlate[], exerciseType: IExerciseType): string {
//   const equipmentSettings = Equipment_getEquipmentDataForExerciseType(settings, exerciseType);
//   const plates: IPlate[] = JSON.parse(JSON.stringify(platesArr));
//   plates.sort((a, b) => Weight_compareReverse(a.weight, b.weight));
//   const arr: number[] = [];
//   const multiplier = equipmentSettings?.multiplier ?? 1;
//   while (true) {
//     const plate = plates.find((p) => p.num >= multiplier);
//     if (plate != null) {
//       arr.push(plate.weight.value);
//       plate.num -= multiplier;
//     } else {
//       break;
//     }
//   }
//
//   return CollectionUtils_compressArray(arr, 3).join("/");
// }

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

// function Weight_gte(weight: IWeight | number | IPercentage, value: IWeight | number | IPercentage): boolean {
//   return comparison(weight, value, (a, b) => a >= b);
// }

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

// function Weight_eqeq(weight: IWeight, value: IWeight): boolean {
//   return weight.value === value.value && weight.unit === value.unit;
// }

// function Weight_max(weights: IWeight[]): IWeight | undefined {
//   return CollectionUtils_sort(weights, Weight_compareReverse)[0];
// }

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
// function Weight_convertTo(weight: IPercentage, unit: "%" | IUnit): IPercentage;
// function Weight_convertTo(weight: number, unit: IUnit): number;
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

// function Weight_calculateRepMax(
//   knownReps: number,
//   knownRpe: number,
//   knownWeight: number,
//   targetReps: number,
//   targetRpe: number
// ): number {
//   const knownRpeMultiplier = Weight_rpeMultiplier(knownReps, knownRpe);
//   const onerm = knownWeight / knownRpeMultiplier;
//   const targetRpeMultiplier = Weight_rpeMultiplier(targetReps, targetRpe);
//   return Math.round(onerm * targetRpeMultiplier);
// }

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
      //@todo browser code in non-browser aware function, should have been bubbled up
      // const msg = `There's an error during evaluating a program, week ${error.dayData.week}, day: ${error.dayData.dayInWeek}. Please fix it to proceed.\n\n${error.error.toString()}`;
      // if (typeof window !== "undefined" && window.alert != null) {
      //   window.alert(msg);
      // }
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
    // console.log(PlannerProgram.generateFullText(newPlanner.weeks));
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
      const weekAndDay = [reuse.week, reuse.day].filter(definedOnly).join(":");
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
// declare let Rollbar: RB;

// const lastAlertDisplayedTs: Partial<Record<string, number>> = {};

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

  // public static isValid(
  //   script: string,
  //   state: IProgramState,
  //   dayData: IDayData,
  //   settings: ISettings,
  //   exerciseType?: IExerciseType
  // ): LiftoscriptSyntaxError | undefined {
  //   const liftoscriptEvaluator = new ScriptRunner(
  //     script,
  //     state,
  //     {},
  //     Progress_createEmptyScriptBindings(dayData, settings),
  //     Progress_createScriptFunctions(settings),
  //     settings.units,
  //     { exerciseType: exerciseType, unit: settings.units, prints: [] },
  //     "planner"
  //   );
  //   try {
  //     liftoscriptEvaluator.parse();
  //   } catch (e) {
  //     if (e instanceof LiftoscriptSyntaxError) {
  //       return e;
  //     } else {
  //       throw e;
  //     }
  //   }
  //   return undefined;
  // }

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

  // public static hasStateVariable(script: string, name: string): boolean {
  //   const expr = LiftoscriptParser.parse(script);
  //   const cursor = expr.cursor();
  //   do {
  //     if (cursor.node.type.name === NodeName.StateVariable) {
  //       const keywordNode = cursor.node.getChild(NodeName.Keyword);
  //       if (keywordNode != null) {
  //         const value = LiftoscriptEvaluator.getValue(script, keywordNode);
  //         if (value === name) {
  //           return true;
  //         }
  //       }
  //     }
  //   } while (cursor.next());
  //   return false;
  // }
  //
  // public static hasKeyword(script: string, name: string): boolean {
  //   const expr = LiftoscriptParser.parse(script);
  //   const cursor = expr.cursor();
  //   do {
  //     if (cursor.node.type.name === NodeName.Keyword) {
  //       if (LiftoscriptEvaluator.getValue(script, cursor.node) === name) {
  //         return true;
  //       }
  //     }
  //   } while (cursor.next());
  //   return false;
  // }
  //
  // public static safe<T>(cb: () => T, errorMsg: (e: Error) => string, defaultValue: T, disabled?: boolean): T {
  //   let value: T;
  //   try {
  //     value = cb();
  //   } catch (e) {
  //     if (!disabled && e instanceof LiftoscriptSyntaxError) {
  //       const lastAlertTs = lastAlertDisplayedTs[e.message];
  //       console.error(e);
  //       if (lastAlertTs == null || lastAlertTs < Date.now() - 1000 * 60 * 1) {
  //         if (typeof window !== "undefined") {
  //           alert(errorMsg(e));
  //         }
  //         this.reportError("Error during Liftoscript execution", e);
  //         lastAlertDisplayedTs[e.message] = Date.now();
  //       }
  //       value = defaultValue;
  //     } else {
  //       throw e;
  //     }
  //   }
  //   return value;
  // }
  //
  // public execute(type: "reps"): number;
  // public execute(type: "rpe"): number;
  // public execute(type: "weight"): IWeight | IPercentage;
  // public execute(type: "timer"): number;
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

  // private static reportError(msg: string, error?: Error): void {
  //   if (typeof Rollbar === "undefined") {
  //     return;
  //   }
  //   const payload = {
  //     error: error ? { message: error.message, name: error.name, stack: error.stack } : undefined,
  //   };
  //   Rollbar.error(msg, payload);
  // }
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
      for (const child of PEET_getChildren(expr).filter(definedOnly)) {
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

// const plannerExerciseStyles = {
//   [`${[PlannerNodeName.SetPart]}/...`]: t.atom,
//   [`${[PlannerNodeName.WarmupSetPart]}/...`]: t.atom,
//   [`${[PlannerNodeName.Rpe]}/...`]: t.number,
//   [`${[PlannerNodeName.Timer]}/...`]: t.keyword,
//   [`${[PlannerNodeName.Weight]}/...`]: t.number,
//   [`${[PlannerNodeName.Percentage]}/...`]: t.number,
//   [PlannerNodeName.AskWeight]: t.number,
//   [PlannerNodeName.LineComment]: t.lineComment,
//   [PlannerNodeName.TripleLineComment]: t.blockComment,
//   [PlannerNodeName.SupersetKeyword]: t.keyword,
//   [PlannerNodeName.SectionSeparator]: t.lineComment,
//   [`${[PlannerNodeName.ExercisePropertyName]}/...`]: t.keyword,
//   [`${[PlannerNodeName.FunctionName]}/...`]: t.attributeName,
//   [`${[PlannerNodeName.FunctionArgument]}/...`]: t.attributeValue,
//   [PlannerNodeName.None]: t.atom,
//   [PlannerNodeName.Week]: t.annotation,
//   [PlannerNodeName.Day]: t.docComment,
//   [PlannerNodeName.WeekDay]: t.atom,
//   [PlannerNodeName.Repeat]: t.atom,
// };
//#endregion

//#region Equipment
// function Equipment_build(name: string): IEquipmentData {
//   return {
//     vtype: "equipment_data",
//     name,
//     multiplier: 1,
//     bar: {
//       lb: Weight_build(0, "lb"),
//       kg: Weight_build(0, "kg"),
//     },
//     plates: [
//       { weight: Weight_build(10, "lb"), num: 4 },
//       { weight: Weight_build(5, "kg"), num: 4 },
//     ],
//     fixed: [],
//     isFixed: false,
//   };
// }
//
// function Equipment_getEquipmentOfGym(
//   settings: ISettings,
//   key?: string,
// ): IAllEquipment {
//   const firstEquipment = settings.gyms[0].equipment;
//   if (key != null) {
//     return settings.gyms.find((g) => g.id === key)?.equipment ?? firstEquipment;
//   } else {
//     return firstEquipment;
//   }
// }

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

// function Equipment_getEquipmentNameForExerciseType(
//   settings: ISettings,
//   exerciseType?: IExerciseType,
// ): string | undefined {
//   const equipment = Equipment_getEquipmentIdForExerciseType(
//     settings,
//     exerciseType,
//   );
//   if (equipment == null) {
//     return undefined;
//   }
//   const currentGym = Equipment_getCurrentGym(settings);
//   const gymEquipment = currentGym.equipment[equipment];
//   if (gymEquipment == null || gymEquipment.isDeleted) {
//     return undefined;
//   }
//   const name = gymEquipment.name;
//   return name || equipmentName(equipment);
// }

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

// function Equipment_getEquipmentData(
//   settings: ISettings,
//   key: string,
// ): IEquipmentData | undefined {
//   return Equipment_currentEquipment(settings)?.[key];
// }

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
//
// function Equipment_mergeEquipment(
//   oldEquipment: { [key in IEquipment]?: IEquipmentData },
//   newEquipment: { [key in IEquipment]?: IEquipmentData },
// ): { [key in IEquipment]?: IEquipmentData } {
//   const newKeys = Array.from(
//     new Set([
//       ...ObjectUtils_keys(newEquipment),
//       ...ObjectUtils_keys(oldEquipment),
//     ]),
//   );
//   return newKeys.reduce<{ [key in IEquipment]?: IEquipmentData }>(
//     (acc, name) => {
//       const newEquipmentData = newEquipment[name];
//       const oldEquipmentData = oldEquipment[name];
//       if (newEquipmentData != null && oldEquipmentData == null) {
//         acc[name] = newEquipmentData;
//       } else if (newEquipmentData == null && oldEquipmentData != null) {
//         acc[name] = oldEquipmentData;
//       } else if (newEquipmentData != null && oldEquipmentData != null) {
//         acc[name] = {
//           ...oldEquipmentData,
//           bar: newEquipmentData.bar,
//           isFixed: newEquipmentData.isFixed,
//           plates: CollectionUtils_concatBy(
//             oldEquipmentData.plates,
//             newEquipmentData.plates,
//             (el) => `${el.weight.value}${el.weight.unit}`,
//           ),
//           multiplier: newEquipmentData.multiplier,
//           fixed: CollectionUtils_concatBy(
//             oldEquipmentData.fixed,
//             newEquipmentData.fixed,
//             (el) => `${el.value}${el.unit}`,
//           ),
//         };
//       }
//       return acc;
//     },
//     {},
//   );
// }

// function Equipment_isBuiltIn(key: string): boolean {
//   return (equipments as unknown as string[]).indexOf(key) !== -1;
// }

// function Equipment_customEquipment(
//   equipmentSettings?: IAllEquipment,
// ): IAllEquipment {
//   return ObjectUtils_filter(
//     equipmentSettings || {},
//     (key) => !Equipment_isBuiltIn(key),
//   );
// }
//
// function Equipment_equipmentKeyByName(
//   name: string,
//   equipmentSettings?: IAllEquipment,
// ): string | undefined {
//   const builtInEquipmentKey = equipments.find(
//     (eq) => eq === name.toLowerCase(),
//   );
//   if (builtInEquipmentKey) {
//     return builtInEquipmentKey;
//   }
//
//   const builtInEquipmentName = equipments.find(
//     (eq) => equipmentName(eq).toLowerCase() === name.toLowerCase(),
//   );
//   if (builtInEquipmentName) {
//     return builtInEquipmentName;
//   }
//
//   const customEquipmentKey = ObjectUtils_keys(equipmentSettings || {}).find(
//     (eq) => {
//       return equipmentName(eq).toLowerCase() === name.toLowerCase();
//     },
//   );
//   return customEquipmentKey;
// }

//#endregion

//#region Set
// type IProgramReps = number;

// type ISetsStatus = "success" | "in-range" | "failed" | "not-finished";
//
// interface IDisplaySet {
//   dimReps?: boolean;
//   dimRpe?: boolean;
//   dimWeight?: boolean;
//   dimTimer?: boolean;
//   reps: string;
//   weight?: string;
//   rpe?: string;
//   askWeight?: boolean;
//   unit?: string;
//   isCompleted?: boolean;
//   isRpeFailed?: boolean;
//   isInRange?: boolean;
//   timer?: number;
// }

// function Reps_display(sets: ISet[], isNext: boolean = false): string {
//   if (Reps_areSameReps(sets, isNext)) {
//     return `${sets.length}x${sets[0].completedReps || sets[0].reps}`;
//   } else {
//     const arr = sets.map((s) => (isNext ? Reps_displayReps(s) : Reps_displayCompletedReps(s)));
//     const groups = CollectionUtils_inGroupsOf(5, arr);
//     return groups.map((g) => g.join("/")).join("/ ");
//   }
// }
//
// function Reps_setToDisplaySet(set: ISet, isNext: boolean, settings: ISettings): IDisplaySet {
//   const completedOrRequiredWeight = set.completedWeight ?? set.weight;
//   return {
//     reps: isNext ? Reps_displayReps(set) : Reps_displayCompletedReps(set),
//     rpe: set.completedRpe?.toString() ?? set.rpe?.toString(),
//     weight: isNext
//       ? set.weight && set.originalWeight
//         ? Weight_display(set.weight, false)
//         : undefined
//       : completedOrRequiredWeight
//         ? Weight_display(completedOrRequiredWeight, false)
//         : undefined,
//     unit: completedOrRequiredWeight?.unit ?? settings.units,
//     askWeight: set.askWeight,
//     isCompleted: Reps_isCompletedSet(set),
//     isRpeFailed: set.completedRpe != null && set.completedRpe > (set.rpe ?? 0),
//     isInRange: set.minReps != null ? set.completedReps != null && set.completedReps >= set.minReps : undefined,
//   };
// }
//
// function Reps_addSet(sets: ISet[], isUnilateral: boolean, lastSet?: ISet, isWarmup?: boolean): ISet[] {
//   lastSet = sets[sets.length - 1] || lastSet;
//   if (lastSet == null) {
//     lastSet = Reps_newSet(isUnilateral, 0);
//   } else {
//     if (isWarmup) {
//       lastSet = {
//         ...structuredClone(lastSet),
//         reps: lastSet.completedReps ?? lastSet.reps,
//         weight: lastSet.completedWeight ?? lastSet.weight,
//       };
//     } else {
//       lastSet = {
//         ...structuredClone(lastSet),
//         reps: lastSet.reps ?? lastSet.completedReps,
//         weight: lastSet.weight ?? lastSet.completedWeight,
//         originalWeight: lastSet.originalWeight ?? lastSet.weight ?? lastSet.completedWeight,
//         completedReps: undefined,
//         completedRepsLeft: undefined,
//         completedWeight: undefined,
//         completedRpe: undefined,
//       };
//     }
//   }
//   const maxIndex = Math.max(-1, ...sets.map((s) => s.index || 0));
//
//   return [
//     ...sets,
//     { ...structuredClone(lastSet), id: UidFactory_generateUid(6), isCompleted: false, index: maxIndex + 1 },
//   ];
// }
//
// function Reps_isSameSet(set1: ISet, set2: ISet): boolean {
//   return Weight_eqNull(set1.weight, set2.weight) && set1.completedReps === set2.completedReps && set1.rpe === set2.rpe;
// }
//
// function Reps_displayReps(set: ISet): string {
//   const reps = set.minReps != null ? `${set.minReps}-${set.reps ?? 0}` : `${set.reps ?? 0}`;
//   return set.isAmrap ? `${reps}+` : `${reps}`;
// }
//
// function Reps_displayCompletedReps(set: ISet): string {
//   return set.completedReps != null
//     ? `${set.completedRepsLeft != null ? `${set.completedRepsLeft}/` : ""}${set.completedReps}`
//     : "-";
// }
//
// function Reps_areSameReps(sets: ISet[], isNext: boolean): boolean {
//   const firstRep = sets[0]?.reps;
//   if (sets.length > 0) {
//     return sets.every(
//       (s) => (isNext ? s.reps : s.completedReps) != null && (isNext ? s.reps : s.completedReps) === firstRep
//     );
//   } else {
//     return false;
//   }
// }
//
// function Reps_isEmpty(sets: ISet[]): boolean {
//   return sets.every((s) => !s.isCompleted);
// }
//
// function Reps_newSet(isUnilateral: boolean, index: number): ISet {
//   return {
//     vtype: "set",
//     index,
//     id: UidFactory_generateUid(6),
//     originalWeight: undefined,
//     weight: undefined,
//     isUnilateral,
//     reps: undefined,
//     isAmrap: false,
//     askWeight: false,
//     isCompleted: false,
//   };
// }

// function Reps_isCompleted(sets: ISet[]): boolean {
//   return sets.length > 0 && sets.every((set) => Reps_isCompletedSet(set));
// }
//
// function Reps_setWarmupStatus(sets: ISet[]): ISetsStatus {
//   if (sets.length === 0) {
//     return "not-finished";
//   }
//   if (Reps_isFinished(sets)) {
//     return "success";
//   } else {
//     return "not-finished";
//   }
// }
//
// function Reps_setsStatus(sets: ISet[]): ISetsStatus {
//   if (Reps_isCompleted(sets)) {
//     return "success";
//   } else if (Reps_isInRangeCompleted(sets)) {
//     return "in-range";
//   } else if (!Reps_isFinished(sets)) {
//     return "not-finished";
//   } else {
//     return "failed";
//   }
// }

// function Reps_isCompletedSet(set: ISet): boolean {
//   if (set.completedReps != null && set.completedWeight != null) {
//     return (
//       !!set.isCompleted &&
//       (set.reps == null || set.completedReps >= set.reps) &&
//       (set.weight == null || Weight_gte(set.completedWeight, set.weight))
//     );
//   } else {
//     return false;
//   }
// }
//
// function Reps_isInRangeCompletedSet(set: ISet): boolean {
//   if (set.completedReps != null && set.completedWeight != null) {
//     return (
//       (set.weight == null || Weight_gte(set.completedWeight, set.weight)) &&
//       (set.minReps != null ? set.completedReps >= set.minReps : set.reps == null || set.completedReps >= set.reps)
//     );
//   } else {
//     return false;
//   }
// }

// function Reps_isStarted(sets: ISet[]): boolean {
//   return sets.length > 0 && sets.some((s) => Reps_isFinishedSet(s));
// }

// function Reps_isFinished(sets: ISet[]): boolean {
//   return sets.length > 0 && sets.every((s) => Reps_isFinishedSet(s));
// }

// function Reps_isEmptyOrFinished(sets: ISet[]): boolean {
//   return sets.length === 0 || Reps_isFinished(sets);
// }

// function Reps_isFinishedSet(s: ISet): boolean {
//   return !!s.isCompleted;
// }

// function Reps_toKey(set: ISet): string {
//   return `${Weight_printNull(set.weight)}-${Weight_printNull(set.completedWeight)}-${set.reps}-${set.minReps}-${set.isAmrap}-${set.rpe}-${set.askWeight}-${set.completedReps}-${set.completedRepsLeft}-${set.completedRpe}-${set.isCompleted}`;
// }

// function Reps_isInRangeCompleted(sets: ISet[]): boolean {
//   return sets.some((s) => s.minReps != null) && sets.every((s) => Reps_isInRangeCompletedSet(s));
// }

// function Reps_enforceCompletedSet(set: ISet): ISet {
//   return {
//     ...set,
//     isCompleted: set.completedReps == null || set.completedWeight == null ? false : !!set.isCompleted,
//   };
// }
//
// function Reps_maxUnilateralCompletedReps(set: ISet): number | undefined {
//   if (set.isUnilateral) {
//     return Math.max(set.completedReps ?? 0, set.completedRepsLeft ?? 0);
//   } else {
//     return set.completedReps;
//   }
// }
//
// function Reps_avgUnilateralCompletedReps(set: ISet): number | undefined {
//   if (set.isUnilateral) {
//     return Math.round(((set.completedReps ?? 0) + (set.completedRepsLeft ?? 0)) / 2);
//   } else {
//     return set.completedReps;
//   }
// }

// function Reps_setVolume(set: ISet, unit: IUnit): IWeight {
//   const totalReps =
//     set.isUnilateral || set.completedRepsLeft != null
//       ? (set.completedReps ?? 0) + (set.completedRepsLeft ?? 0)
//       : (set.completedReps ?? 0);
//   return Weight_multiply(set.completedWeight ?? set.weight ?? Weight_build(0, unit), totalReps);
// }

// function Reps_group(sets: ISet[], isNext?: boolean): ISet[][] {
//   return sets.reduce<ISet[][]>(
//     (memo, set) => {
//       let lastGroup = memo[memo.length - 1];
//       const last = lastGroup[lastGroup.length - 1];
//       if (
//         last != null &&
//         (!Weight_eqNull(last.weight, set.weight) ||
//           last.reps !== set.reps ||
//           last.minReps !== set.minReps ||
//           last.completedReps !== set.completedReps ||
//           last.completedRepsLeft !== set.completedRepsLeft ||
//           !Weight_eqNull(last.completedWeight, set.completedWeight) ||
//           last.askWeight !== set.askWeight ||
//           (isNext && last.isAmrap !== set.isAmrap) ||
//           last.rpe !== set.rpe ||
//           last.completedRpe !== set.completedRpe)
//       ) {
//         memo.push([]);
//         lastGroup = memo[memo.length - 1];
//       }
//       lastGroup.push(set);
//       return memo;
//     },
//     [[]]
//   );
// }

// function Reps_findNextSet(entry: IHistoryEntry): ISet | undefined {
//   return [...entry.warmupSets, ...entry.sets].filter((s) => !s.isCompleted)[0];
// }

// function Reps_findNextSetIndex(entry: IHistoryEntry): number {
//   return [...entry.warmupSets, ...entry.sets].findIndex((s) => !s.isCompleted);
// }
//
// function Reps_findNextEntryAndSet(
//   historyRecord: IHistoryRecord,
//   entryIndex: number,
//   mode: "workout" | "warmup"
// ):
//   | {
//   entry: IHistoryEntry;
//   set: ISet;
// }
//   | undefined {
//   const entry = historyRecord.entries[entryIndex];
//   if (entry == null) {
//     return undefined;
//   }
//   const nextEntry = Progress_getNextEntry(historyRecord, entry, mode, true);
//   if (nextEntry == null) {
//     return undefined;
//   }
//
//   const nextSet = Reps_findNextSet(nextEntry);
//   if (nextSet != null) {
//     return { entry: nextEntry, set: nextSet };
//   }
//
//   return undefined;
// }
//
// function Reps_findNextEntryAndSetIndex(
//   historyRecord: IHistoryRecord,
//   entryIndex: number,
//   mode: "workout" | "warmup"
// ):
//   | {
//   entryIndex: number;
//   setIndex: number;
// }
//   | undefined {
//   const entry = historyRecord.entries[entryIndex];
//   if (entry == null) {
//     return undefined;
//   }
//   const nextEntry = Progress_getNextEntry(historyRecord, entry, mode, true);
//   if (nextEntry == null) {
//     return undefined;
//   }
//
//   const nextSet = Reps_findNextSetIndex(nextEntry);
//
//   return { entryIndex: historyRecord.entries.indexOf(nextEntry), setIndex: nextSet };
// }
//
// function Reps_groupConsecutive<T>(items: T[], keyFn: (item: T) => string): [T, number][] {
//   const groups: [T, number][] = [];
//   let lastKey: string | undefined;
//   for (const item of items) {
//     const key = keyFn(item);
//     if (lastKey == null || lastKey !== key) {
//       groups.push([item, 0]);
//     }
//     groups[groups.length - 1][1] += 1;
//     lastKey = key;
//   }
//   return groups;
// }
//
// function Reps_completedSetKey(set: ISet): string {
//   const reps = set.completedReps ?? 0;
//   const repsLeft = set.isUnilateral ? (set.completedRepsLeft ?? 0) : -1;
//   const w = set.completedWeight ? Weight_print(set.completedWeight) : "none";
//   const rpe = set.completedRpe ?? -1;
//   const label = set.label ?? "";
//   return `${reps}-${repsLeft}-${w}-${rpe}-${label}`;
// }
//
// function Reps_targetSetKey(set: ISet): string {
//   const reps = set.reps ?? 0;
//   const minReps = set.minReps ?? -1;
//   const w = set.weight ? Weight_print(set.weight) : "none";
//   const rpe = set.rpe ?? -1;
//   const logRpe = set.logRpe ? 1 : 0;
//   const timer = set.timer ?? -1;
//   const amrap = set.isAmrap ? 1 : 0;
//   const label = set.label ?? "";
//   const askWeight = set.askWeight ? 1 : 0;
//   return `${reps}-${minReps}-${w}-${askWeight}-${rpe}-${logRpe}-${timer}-${amrap}-${label}`;
// }
//
// function Reps_volume(sets: ISet[], unit: IUnit): IWeight {
//   return Weight_convertTo(
//     sets.reduce((memo, set) => Weight_add(memo, Reps_setVolume(set, unit)), Weight_build(0, unit)),
//     unit
//   );
// }

//#endregion

//#region ________
//#endregion

//#region ________
//#endregion
