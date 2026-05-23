import {
  Program_create,
  Program_evaluate,
  Program_applyEvaluatedProgram,
  Program_nextHistoryRecord,
  Program_runAllFinishDayScripts,
  Settings_build,
  PlannerProgram_evaluateText,
  PlannerProgram_replaceWeight,
  PlannerProgram_generateFullText,
  PlannerProgram_replaceAndValidateExercise,
  type IProgram,
  type ISettings,
  type IPlannerProgram,
  type IExerciseType,
  type IWeight,
  type IWeightChange,
  ProgramExercise_weightChanges,
  PlannerKey_fromFullName,
} from "@/evaluators/plan-evaluator-minimal.ts";
import type { IStats } from "@/fitness-stats";

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
  return PlannerProgram_generateFullText(newProgram.planner?.weeks || []);
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
    return PlannerProgram_generateFullText(result.data.planner?.weeks || []);
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
  const nextHistoryRecord = Program_nextHistoryRecord(
    program,
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
