import memoize from "micro-memoize";
import * as t from "io-ts";
import { unsafeCoerce } from "fp-ts/lib/function";
import { lb } from "lens-shmens";

import { Service } from "../api/service";
import { IExercisePickerSettings } from "../components/exercisePicker/exercisePickerSettings";
import { IDispatch } from "../ducks/types";
import { Thunk_pushScreen } from "../ducks/thunks";
import { getLatestMigrationVersion } from "../migrations/migrations";
import type { INavigateOpts } from "../navigation/navigationService";
import { ScriptRunner } from "../parser";

import {
  IAllCustomExercises,
  IAllEquipment,
  ICustomExercise,
  IDayData,
  IExerciseData,
  IExerciseType,
  IHistoryEntry,
  IHistoryRecord,
  IPercentage,
  IPlannerProgram,
  IPlannerSettings,
  IProgram,
  IProgramContentSettings,
  IProgramExercise,
  IProgramExerciseVariation,
  IProgramExerciseWarmupSet,
  IProgramSet,
  IProgramState,
  ISet,
  ISettings,
  IShortDayData,
  IStats,
  IStatsKey,
  IStorage,
  ITargetType,
  targetTypes,
  IUnit,
  IWeight,
} from "../types";
import { IPlannerProgramWeek } from "../../../types";

import { IWeightChange } from "../../../models/programExercise";
import { Storage_getDefault, Storage_get } from "../../../models/storage";

import {
  CollectionUtils_compact,
  CollectionUtils_sort,
  CollectionUtils_sortBy,
  CollectionUtils_uniqBy,
  CollectionUtils_uniqByExpr,
} from "../utils/collection";
import { DateUtils_formatYYYYMMDD } from "../utils/date";
import { Encoder_encodeIntoUrl } from "../utils/encoder";
import { Exporter_toFile } from "../utils/exporter";
import { UidFactory_generateUid } from "../utils/generator";
import { MathUtils_applyOp } from "../utils/math";
import {
  ObjectUtils_clone,
  ObjectUtils_diff,
  ObjectUtils_diffPaths,
  ObjectUtils_filter,
  ObjectUtils_isEqual,
  ObjectUtils_keys,
  ObjectUtils_omit,
  ObjectUtils_pick,
  ObjectUtils_values,
} from "./utils/object";
import { SendMessage_toIosAndAndroid } from "../utils/sendMessage";
import { StringUtils_hashString, StringUtils_pluralize } from "../utils/string";
import { IEither, IArrayElement } from "./utils/types";
import { UrlUtils_build } from "../utils/url";

import {
  IAssignmentOp,
  ILiftoscriptEvaluatorUpdate,
} from "../liftoscriptEvaluator";
import {
  IPlannerEvalFullResult,
  IPlannerEvalResult,
  IPlannerTopLineItem,
  PlannerSyntaxError,
} from "../plannerExerciseEvaluator";
import { PlannerExerciseEvaluator } from "./plannerExerciseEvaluator";
import { PlannerExerciseEvaluatorText } from "../plannerExerciseEvaluatorText";
import { parser as plannerExerciseParser } from "../plannerExerciseParser";

import {
  IByExercise,
  IByTag,
  PlannerEvaluator_changeExerciseName,
  PlannerEvaluator_forceEvaluate,
} from "../pages/planner/plannerEvaluator";
import {
  PlannerEvaluator_evaluate,
  PlannerEvaluator_evaluateFull,
} from "../plannerEvaluator";
import { PlannerProgram_switchToUnit } from "../pages/planner/models/plannerProgram";
import {
  PlannerProgramExercise_createExerciseFromEntry,
  PlannerProgramExercise_currentDescriptionIndex,
  PlannerProgramExercise_currentEvaluatedSetVariation,
  PlannerProgramExercise_currentEvaluatedSetVariationIndex,
  PlannerProgramExercise_getProgressScript,
  PlannerProgramExercise_getState,
  PlannerProgramExercise_getStateMetadata,
  PlannerProgramExercise_getUpdateScript,
  PlannerProgramExercise_programWarmups,
  PlannerProgramExercise_sets,
} from "../pages/planner/models/plannerProgramExercise";

import { PlannerKey_fromExerciseType } from "../plannerKey";

import {
  allExercisesList,
  Exercise_eq,
  Exercise_findById,
  Exercise_findByNameEquipment,
  Exercise_fullName,
  Exercise_get,
  Exercise_getIsUnilateral,
  Exercise_getWarmupSets,
  Exercise_nameWithEquipment,
  Exercise_onerm,
  Exercise_toKey,
  IExercise,
  warmupValues,
} from "./exercise";
import {
  IScriptBindings,
  Progress_createScriptBindings,
  Progress_createScriptFunctions,
  Progress_getDayData,
  Progress_getEntryId,
  Progress_runUpdateScriptForEntry,
} from "./progress";
import {
  ProgramExercise_approxTimeMs,
  ProgramExercise_applyVariables,
  ProgramExercise_doesUse1RM,
  ProgramExercise_doesUseRPE,
} from "./programExercise";
import {
  IEvaluatedProgram,
  IExportedProgram,
  Program_getAllProgramExercises,
  Program_getAllUsedProgramExercises,
} from "./program";
import {
  ProgramSet_approxTimeMs,
  ProgramSet_getEvaluatedWeight,
  ProgramSet_isEligibleForInferredWeight,
} from "./programSet";
import { ProgramToPlanner } from "./programToPlanner";
import { PP_iterate, PP_iterate2 } from "./pp";
import {
  IPlannerProgramExercise,
  IPlannerProgramExerciseEvaluatedSet,
  IPlannerProgramExerciseWithType,
} from "./models/types";
import { IVersions, IVersionTypes } from "./models/versionTracker";
import {
  IExportedPlannerProgram,
  IPlannerProgramExerciseWarmupSet,
  IPlannerProgramProperty,
} from "./types";
import {
  Weight_add,
  Weight_applyOp,
  Weight_build,
  Weight_buildPct,
  Weight_convertTo,
  Weight_display,
  Weight_divide,
  Weight_eq,
  Weight_eqNull,
  Weight_is,
  Weight_isPct,
  Weight_print,
  Weight_printOrNumber,
  Weight_roundTo005,
} from "./weight";

import { EditProgram_initPlannerState } from "./editProgram";
import { Stats_getCurrentMovingAverageBodyweight } from "./stats";
import { IState, updateSettings, updateState } from "./state";

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

interface IExportedProgram {
  program: IProgram;
  customExercises: Partial<Record<string, ICustomExercise>>;
  version: string;
  settings: IProgramContentSettings;
}

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

// type IProgramMode = "planner" | "update";
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
//   const newState: IProgramState = ObjectUtils_clone({
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
//       ObjectUtils_clone(otherStates),
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
          alert(
            `There was an error executing progress script: ${newStateResult.error}`,
          );
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
  const newProgram = ObjectUtils_clone(program);
  newProgram.planner = new ProgramToPlanner(
    evaluatedProgram,
    settings,
  ).convertToPlanner();
  newProgram.nextDay = evaluatedProgram.nextDay;
  return newProgram;
}

// function Program_getProgramExercise(
//   day: number,
//   program?: IEvaluatedProgram,
//   key?: string,
// ): IPlannerProgramExercise | undefined {
//   if (key == null || program == null) {
//     return undefined;
//   }
//   const programDay = Program_getProgramDay(program, day);
//   return programDay?.exercises.find((e) => e.key === key);
// }
//
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
//     ...ObjectUtils_clone(program),
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
//     ...ObjectUtils_clone(program),
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
// export const Program_evaluate = memoize(Program_forceEvaluate, { maxSize: 10 });
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

function Settings_defaultEquipment(): IAllEquipment {
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
//   const plannerProgram = ObjectUtils_clone(aPlannerProgram);
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
// function PlannerProgram_switchToUnit(
//   plannerProgram: IPlannerProgram,
//   settings: ISettings,
// ): IPlannerProgram {
//   const newPlannerProgram = ObjectUtils_clone(plannerProgram);
//   for (const week of newPlannerProgram.weeks) {
//     for (const day of week.days) {
//       const evaluator = new PlannerExerciseEvaluator(
//         day.exerciseText,
//         settings,
//         "perday",
//       );
//       const tree = plannerExerciseParser.parse(day.exerciseText);
//       day.exerciseText = evaluator.switchWeightsToUnit(tree.topNode, settings);
//     }
//   }
//   return newPlannerProgram;
// }
//
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
// function PlannerProgram_compact(
//   oldPlannerProgram: IPlannerProgram,
//   plannerProgram: IPlannerProgram,
//   settings: ISettings,
//   additionalRepeatingExercises?: Set<string>,
// ): IPlannerProgram {
//   let dayIndex = 0;
//   const repeatingExercises = new Set<string>();
//   const { evaluatedWeeks } = PlannerProgram_evaluate(
//     ObjectUtils_clone(oldPlannerProgram),
//     settings,
//   );
//   const { evaluatedWeeks: newEvaluatedWeeks } = PlannerProgram_evaluate(
//     ObjectUtils_clone(plannerProgram),
//     settings,
//   );
//   for (const ev of [evaluatedWeeks, newEvaluatedWeeks]) {
//     PP_iterate(ev, (exercise) => {
//       if (exercise.repeat != null && exercise.repeat.length > 0) {
//         repeatingExercises.add(exercise.key);
//       }
//     });
//   }
//   for (const ex of additionalRepeatingExercises || []) {
//     repeatingExercises.add(ex);
//   }
//
//   const lastDescriptions: Partial<Record<number, string | undefined>> = {};
//   plannerProgram.weeks.forEach((week) => {
//     week.days.forEach((day, dayInWeekIndex) => {
//       if (lastDescriptions[dayInWeekIndex] == null) {
//         lastDescriptions[dayInWeekIndex] = day.description;
//       } else if (lastDescriptions[dayInWeekIndex] === day.description) {
//         day.description = undefined;
//       } else {
//         lastDescriptions[dayInWeekIndex] = day.description;
//       }
//     });
//   });
//
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
//   for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
//     const week = mapping[weekIndex];
//     for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
//       const day = week[dayIndex];
//       for (const line of day) {
//         if (
//           line.type === "exercise" &&
//           !line.used &&
//           repeatingExercises.has(line.value)
//         ) {
//           const repeatRanges: [number, number | undefined][] = [];
//           for (
//             let repeatWeekIndex = weekIndex + 1;
//             repeatWeekIndex < mapping.length;
//             repeatWeekIndex += 1
//           ) {
//             const repeatDay = mapping[repeatWeekIndex]?.[dayIndex];
//             const repeatedExercises = (repeatDay || []).filter((e) => {
//               if (
//                 e.type !== "exercise" ||
//                 e.value !== line.value ||
//                 e.sectionsToReuse !== line.sectionsToReuse ||
//                 e.exerciseIndex !== line.exerciseIndex ||
//                 !ObjectUtils_isEqual(
//                   e.descriptions || [],
//                   line.descriptions || [],
//                 )
//               ) {
//                 return false;
//               }
//               const oldDay = evaluatedWeeks[repeatWeekIndex][dayIndex];
//               const oldExercise = oldDay.success
//                 ? oldDay.data.find((ex) => ex.key === e.value)
//                 : undefined;
//               return oldExercise?.repeating?.includes(weekIndex + 1);
//             });
//             for (const e of repeatedExercises) {
//               e.used = true;
//             }
//             if (repeatedExercises.length > 0) {
//               if (
//                 repeatRanges.length === 0 ||
//                 repeatRanges[repeatRanges.length - 1][1] != null
//               ) {
//                 repeatRanges.push([repeatWeekIndex, undefined]);
//               }
//             } else {
//               if (repeatRanges.length > 0) {
//                 repeatRanges[repeatRanges.length - 1][1] = repeatWeekIndex;
//               }
//               break;
//             }
//           }
//           if (
//             repeatRanges.length > 0 &&
//             repeatRanges[repeatRanges.length - 1][1] == null
//           ) {
//             repeatRanges[repeatRanges.length - 1][1] = mapping.length;
//           }
//           line.repeatRanges = repeatRanges.map((r) => `${r[0]}-${r[1]}`);
//         }
//       }
//     }
//   }
//
//   for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
//     const programWeek = plannerProgram.weeks[weekIndex];
//     const week = mapping[weekIndex];
//     for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
//       const day = week[dayIndex];
//       const programDay = programWeek.days[dayIndex];
//       let str = "";
//       let ongoingDescriptions = false;
//       for (const line of day) {
//         if (line.type === "description") {
//           ongoingDescriptions = true;
//           //
//         } else if (line.type === "exercise") {
//           ongoingDescriptions = false;
//           if (!line.used) {
//             if (line.descriptions && line.descriptions.length > 0) {
//               str += `${line.descriptions.filter((d) => d.trim()).join("\n\n")}\n`;
//             }
//             let repeatStr = "";
//             if (
//               (line.order != null && line.order !== 0) ||
//               (line.repeatRanges && line.repeatRanges.length > 0)
//             ) {
//               const repeatParts = [];
//               if (line.order != null && line.order !== 0) {
//                 repeatParts.push(line.order);
//               }
//               if (line.repeatRanges && line.repeatRanges.length > 0) {
//                 repeatParts.push(line.repeatRanges.join(","));
//               }
//               repeatStr = `[${repeatParts.join(",")}]`;
//             }
//             str +=
//               [`${line.fullName}${repeatStr}`, line.sections]
//                 .filter((r) => r)
//                 .join(" / ") + `\n`;
//           }
//         } else if (line.type === "empty") {
//           if (!ongoingDescriptions) {
//             str += line.value + "\n";
//           }
//         } else {
//           str += line.value + "\n";
//         }
//       }
//       programDay.exerciseText = str.trim();
//     }
//   }
//
//   return plannerProgram;
// }
//
// function PlannerProgram_groupedTopLines(
//   topLine: IPlannerTopLineItem[][][],
// ): IPlannerTopLineItem[][][][] {
//   const groupedTopLine: IPlannerTopLineItem[][][][] = [];
//   for (let weekIndex = 0; weekIndex < topLine.length; weekIndex += 1) {
//     const topLineWeek = topLine[weekIndex];
//     groupedTopLine.push([]);
//     for (
//       let dayInWeekIndex = 0;
//       dayInWeekIndex < topLineWeek.length;
//       dayInWeekIndex += 1
//     ) {
//       const topLineDay = topLineWeek[dayInWeekIndex];
//       const group: IPlannerTopLineItem[][] = [];
//       groupedTopLine[weekIndex].push(group);
//       let reset = true;
//       for (let lineIndex = 0; lineIndex < topLineDay.length; lineIndex += 1) {
//         if (reset) {
//           group.push([]);
//           reset = false;
//         }
//         const line = topLineDay[lineIndex];
//         group[group.length - 1] = group[group.length - 1] || [];
//         group[group.length - 1].push(line);
//         if (line.type === "exercise") {
//           reset = true;
//         }
//       }
//     }
//   }
//   for (const week of groupedTopLine) {
//     for (const day of week) {
//       day.sort((group1, group2) => {
//         const ex1 = group1.find((l) => l.type === "exercise");
//         const ex2 = group2.find((l) => l.type === "exercise");
//         if (ex1 == null || ex2 == null) {
//           return 0;
//         }
//         if (ex1.exerciseIndex === ex2.exerciseIndex) {
//           return (ex1.repeat?.[0] ?? 0) - (ex2.repeat?.[0] ?? 0);
//         } else {
//           return (ex1.exerciseIndex ?? 0) - (ex2.exerciseIndex ?? 0);
//         }
//       });
//     }
//   }
//   return groupedTopLine;
// }
//
// function PlannerProgram_topLineItems(
//   plannerProgram: IPlannerProgram,
//   settings: ISettings,
// ): IPlannerTopLineItem[][][] {
//   let dayIndex = 0;
//
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
//   for (let weekIndex = 0; weekIndex < mapping.length; weekIndex += 1) {
//     const week = mapping[weekIndex];
//     for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
//       const day = week[dayIndex];
//       for (const exercise of day) {
//         for (const r of exercise.repeat || []) {
//           const reuseDay = mapping[r - 1]?.[dayIndex];
//           if (
//             reuseDay &&
//             !reuseDay.some(
//               (e) => e.type === "exercise" && e.value === exercise.value,
//             )
//           ) {
//             if (exercise.descriptions) {
//               for (let di = 0; di < exercise.descriptions.length; di += 1) {
//                 if (di !== 0) {
//                   reuseDay.push({ type: "empty", value: "" });
//                 }
//                 reuseDay.push({
//                   type: "description",
//                   value: exercise.descriptions[di],
//                 });
//               }
//             }
//             reuseDay.push({ ...exercise, repeat: undefined });
//           }
//         }
//       }
//     }
//   }
//   return mapping;
// }

// function PlannerProgram_evaluate(
//   plannerProgram: IPlannerProgram,
//   settings: ISettings,
// ): { evaluatedWeeks: IPlannerEvalResult[][]; exerciseFullNames: string[] } {
//   return PlannerEvaluator_evaluate(plannerProgram, settings);
// }
//
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
// type IEquipment = t.TypeOf<typeof TEquipment>;

const TExerciseId = t.string;
// type IExerciseId = t.TypeOf<typeof TExerciseId>;

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
// type IUnit = t.TypeOf<typeof TUnit>;

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
// type IPlate = t.TypeOf<typeof TPlate>;

const barKeys = ["barbell", "ezbar", "dumbbell"] as const;

const TBarKey = t.keyof(
  barKeys.reduce<Record<IArrayElement<typeof barKeys>, null>>(
    (memo, barKey) => {
      memo[barKey] = null;
      return memo;
    },
    {} as Record<IArrayElement<typeof barKeys>, null>,
  ),
  "TBarKey",
);
// type IBarKey = t.TypeOf<typeof TBarKey>;

const TBars = t.record(TBarKey, TWeight, "TBars");
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
// type IProgramStateMetadata = t.TypeOf<typeof TProgramStateMetadata>;

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
type IProgramSet = t.TypeOf<typeof TProgramSet>;

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
type IProgramExerciseVariation = Readonly<
  t.TypeOf<typeof TProgramExerciseVariation>
>;

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
  typeof TExercisePickerProgramExercise
>;

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
// type IPlannerProgramDay = t.TypeOf<typeof TPlannerProgramDay>;

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
// type IGym = t.TypeOf<typeof TGym>;

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

type IProgramContentSettings = Partial<
  Pick<
    ISettings,
    "units" | "planner" | "muscleGroups" | "exerciseData" | "workoutSettings"
  > & {
    timers: Partial<ISettings["timers"]>;
  }
>;

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
const ATOMIC_TYPES = [
  "history_record",
  "progress_ui",
  "set",
  "equipment_data",
  "custom_exercise",
  "planner",
  "stat",
  "graph",
  "graphs",
  "subscription_receipt",
  "affiliate",
  "muscle_groups_settings",
] as const;

type IAtomicType = (typeof ATOMIC_TYPES)[number];

// Controlled types - these have specific fields that are versioned
const CONTROLLED_TYPES = [
  "program",
  "gym",
  "progress",
  "history_entry",
] as const;

type IControlledType = (typeof CONTROLLED_TYPES)[number];

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

// function PlannerKey_fromPlannerExercise(
//   plannerExercise: IPlannerProgramExercise,
//   settings: ISettings,
// ): string {
//   if (plannerExercise.exerciseType) {
//     return PlannerKey_fromExerciseType(
//       plannerExercise.exerciseType,
//       plannerExercise.label,
//     );
//   } else {
//     return PlannerKey_fromFullName(
//       plannerExercise.fullName,
//       settings.exercises,
//     );
//   }
// }

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

//#region ________
//#endregion

//#region ________
//#endregion

//#region ________
//#endregion
