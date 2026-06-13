import {
  convertToPlanner,
  forExerciseInEvaluatedWeeks,
  getExercisesInProgram,
  type IDayData,
  type IWeightChange,
  PlannerKey_fromExerciseType,
  PlannerKey_fromFullName,
  PlannerKey_fromLabelNameAndEquipment,
  Program_applyEvaluatedProgram,
  Program_create,
  Program_evaluate,
  Program_nextHistoryRecordFromEvaluated,
  Program_runAllFinishDayScripts,
  ProgramExercise_weightChanges,
} from "@/evaluators/plan-evaluator-minimal.ts";
import type { IStats } from "@/fitness-stats";
import type { IPlannerProgram, IProgram } from "@/program";
import { type ISettings, Settings_build } from "@/user-settings";
import {
  PlannerEvaluator_evaluate,
  PlannerProgram_evaluateText,
  PlannerProgram_replaceWeight,
} from "@/planner/evaluators";
import { asProgramScript } from "@/planner/display.ts";
import type { IExerciseType } from "@/exercises";
import type { IEither } from "@/utils/types.ts";
import { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import { filterUndefined } from "@/utils/collection.ts";
import { generateUid } from "@/utils/uid.ts";
import type { IWeight } from "@/quantities/weight.ts";

export interface ICompletedEntries {
  completedReps: number[][];
  completedWeights?: IWeight[][];
}

export function PlannerTestUtils_get(text: string): {
  program: IProgram;
  planner: IPlannerProgram;
} {
  const planner: IPlannerProgram = {
    name: "MyProgram",
    weeks: PlannerProgram_evaluateText(text),
  };
  const program: IProgram = { ...Program_create("MyProgram"), planner };
  return { program, planner };
}

export function PlannerTestUtils_changeWeight(
  programText: string,
  cb: (weightChanges: IWeightChange[]) => IWeightChange[],
): string {
  const { program } = PlannerTestUtils_get(programText);
  const settings = Settings_build();
  const evaluatedProgram = Program_evaluate(program, settings);
  const programExercise = evaluatedProgram.weeks[0].days[0].exercises[0];
  const weightChanges = ProgramExercise_weightChanges(
    evaluatedProgram,
    programExercise.key,
  );
  const newWeightChanges = cb(weightChanges);
  const newEvaluatedProgram = PlannerProgram_replaceWeight(
    evaluatedProgram,
    programExercise.key,
    newWeightChanges,
  );
  const newProgram = Program_applyEvaluatedProgram(
    program,
    newEvaluatedProgram,
    settings,
  );
  return newProgram.planner ? asProgramScript(newProgram.planner) : "";
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

function PlannerProgram_replaceAndValidateExercise(
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

export function PlannerTestUtils_changeExercise(
  programText: string,
  oldExercise: string,
  newExercise: IExerciseType,
): string {
  const { program } = PlannerTestUtils_get(programText);
  const settings = Settings_build();
  const key = PlannerKey_fromFullName(oldExercise, settings.exercises);
  const result = PlannerProgram_replaceAndValidateExercise(
    program,
    key,
    newExercise,
    settings,
  );
  if (result.success) {
    return result.data.planner ? asProgramScript(result.data.planner) : "";
  } else {
    throw result.error;
  }
}

export function PlannerTestUtils_finish(
  text: string,
  completed: ICompletedEntries,
  settings: ISettings = Settings_build(),
  stats: IStats = {
    weight: [],
    neck: [],
    shoulders: [],
    bicepLeft: [],
    bicepRight: [],
    forearmLeft: [],
    forearmRight: [],
    chest: [],
    waist: [],
    hips: [],
    thighLeft: [],
    thighRight: [],
    calfLeft: [],
    calfRight: [],
    bodyfat: [],
  },
  dayIndex?: number,
): { program: IProgram } {
  const { program } = PlannerTestUtils_get(text);
  const nextHistoryRecord = Program_nextHistoryRecordFromEvaluated(
    Program_evaluate(program, settings),
    settings,
    {
      weight: [],
      neck: [],
      shoulders: [],
      bicepLeft: [],
      bicepRight: [],
      forearmLeft: [],
      forearmRight: [],
      chest: [],
      waist: [],
      hips: [],
      thighLeft: [],
      thighRight: [],
      calfLeft: [],
      calfRight: [],
      bodyfat: [],
    },
    dayIndex,
  );
  for (
    let entryIndex = 0;
    entryIndex < completed.completedReps.length;
    entryIndex++
  ) {
    for (
      let setIndex = 0;
      setIndex < completed.completedReps[entryIndex].length;
      setIndex++
    ) {
      const set = nextHistoryRecord.entries?.[entryIndex]?.sets[setIndex];
      const completedReps = completed.completedReps?.[entryIndex]?.[setIndex];
      const completedWeights =
        completed.completedWeights?.[entryIndex]?.[setIndex];
      if (set != null && completedReps != null) {
        set.completedReps = completedReps;
        set.completedWeight = completedWeights ?? set.weight;
        set.isCompleted = true;
      }
    }
  }
  const { program: newProgram } = Program_runAllFinishDayScripts(
    program,
    nextHistoryRecord,
    stats,
    settings,
  );
  return { program: newProgram };
}
