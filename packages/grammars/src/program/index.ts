import {
  gt,
  type IWeight,
  multiply,
  roundConvertTo,
  TWeight,
  w,
} from "@/quantities/weight.ts";
import {
  getExerciseOrDefault,
  type IExerciseType,
  isUnilateral,
  TExerciseType,
} from "@/exercises";
import { getPreferredUnit, type ISettings } from "@/user-settings";
import { type ISet, TProgramState } from "@/common-types.ts";
import { isNumber } from "@/utils/types.ts";
import { generateUid } from "@/utils/uid.ts";
import { z } from "zod";

export const TProgramExerciseWarmupSet = z.strictObject({
  reps: z.number(),
  value: z.union([TWeight, z.number()]),
  threshold: TWeight,
});
export type IProgramExerciseWarmupSet = Readonly<
  z.infer<typeof TProgramExerciseWarmupSet>
>;

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
          (weight != null && gt(weight, programExerciseWarmupSet.threshold))
        ) {
          const value = programExerciseWarmupSet.value;
          const unit = getPreferredUnit(settings, exerciseType);
          if (!isNumber(value) || weight != null) {
            const warmupWeight = isNumber(value)
              ? multiply(weight!, value)
              : value;
            const roundedWeight = roundConvertTo(
              warmupWeight,
              settings,
              unit,
              exerciseType,
            );
            memo.push({
              index,
              id: generateUid(6),
              reps: programExerciseWarmupSet.reps,
              isUnilateral: exerciseType
                ? isUnilateral(exerciseType, settings)
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

/**
 * Determines what warmup sets to use for an exercise in a program.
 * @param exercise The exercise to get warmup sets for
 * @param weight The weight to use for warmup sets
 * @param settings The user settings
 * @param programExerciseWarmupSets The warmup sets defined in the program
 */
export function getWarmupSets(
  exercise: IExerciseType,
  weight: IWeight | undefined,
  settings: ISettings,
  programExerciseWarmupSets?: IProgramExerciseWarmupSet[],
): ISet[] {
  if (programExerciseWarmupSets) {
    return warmup(programExerciseWarmupSets, true)(weight, settings, exercise);
  }

  const def = getExerciseOrDefault(exercise, settings.exercises).defaultWarmup;
  if (def !== 10 && def !== 45 && def !== 95) {
    return [];
  }
  const reps = 5;
  const first = { reps, value: 0.3 };
  const second = { reps, value: 0.5 };
  const third = { reps, value: 0.8 };
  const isLb = settings.units === "lb";
  return warmup(
    def === 10
      ? [
          { ...first, threshold: isLb ? w`60lb` : w`30kg` },
          { ...second, threshold: isLb ? w`30lb` : w`15kg` },
          { ...third, threshold: isLb ? w`10lb` : w`5kg` },
        ]
      : def === 45
        ? [
            { ...first, threshold: isLb ? w`120lb` : w`60kg` },
            { ...second, threshold: isLb ? w`90lb` : w`45kg` },
            { ...third, threshold: isLb ? w`45lb` : w`20kg` },
          ]
        : def === 95
          ? [
              { ...first, threshold: isLb ? w`150lb` : w`70kg` },
              { ...second, threshold: isLb ? w`125lb` : w`60kg` },
              { ...third, threshold: isLb ? w`95lb` : w`40kg` },
            ]
          : [],
  )(weight, settings, exercise);
}
const TProgramStateMetadataValue = z.strictObject({
  userPrompted: z.boolean().optional(),
});
const TProgramStateMetadata = z.record(z.string(), TProgramStateMetadataValue);
export type IProgramStateMetadata = z.infer<typeof TProgramStateMetadata>;
const TProgramSet = z.strictObject({
  repsExpr: z.string(),
  weightExpr: z.string(),
  isAmrap: z.boolean().optional(),
  rpeExpr: z.string().optional(),
  minRepsExpr: z.string().optional(),
  logRpe: z.boolean().optional(),
  askWeight: z.boolean().optional(),
  label: z.string().optional(),
  timerExpr: z.string().optional(),
});
const TProgramExerciseVariation = z.strictObject({
  sets: z.array(TProgramSet),
  quickAddSets: z.boolean().optional(),
});
const TProgramExerciseReuseLogic = z.strictObject({
  selected: z.union([z.string(), z.undefined()]),
  states: z.record(z.string(), TProgramState),
});
const TProgramExercise = z.strictObject({
  exerciseType: TExerciseType,
  id: z.string(),
  name: z.string(),
  variations: z.array(TProgramExerciseVariation),
  state: TProgramState,
  variationExpr: z.string(),
  finishDayExpr: z.string(),
  descriptions: z.array(z.string()),
  tags: z.array(z.number()).optional(),
  updateDayExpr: z.string().optional(),
  diffPaths: z.array(z.string()).optional(),
  description: z.string().optional(),
  descriptionExpr: z.string().optional(),
  quickAddSets: z.boolean().optional(),
  enableRepRanges: z.boolean().optional(),
  enableRpe: z.boolean().optional(),
  stateMetadata: TProgramStateMetadata.optional(),
  timerExpr: z.string().optional(),
  reuseLogic: TProgramExerciseReuseLogic.optional(),
  warmupSets: z.array(TProgramExerciseWarmupSet).optional(),
  reuseFinishDayScript: z.string().optional(),
  reuseUpdateDayScript: z.string().optional(),
});
const TProgramWeek = z.strictObject({
  id: z.string(),
  name: z.string(),
  days: z.array(
    z.strictObject({
      id: z.string(),
    }),
  ),
  description: z.string().optional(),
});
const TProgramDay = z.strictObject({
  id: z.string(),
  name: z.string(),
  exercises: z.array(
    z.strictObject({
      id: z.string(),
    }),
  ),
  description: z.string().optional(),
});
const TPlannerProgramDay = z.strictObject({
  name: z.string(),
  exerciseText: z.string(),
  id: z.string().optional(),
  description: z.string().optional(),
});
export type IPlannerProgramDay = z.infer<typeof TPlannerProgramDay>;
const TPlannerProgramWeek = z.strictObject({
  name: z.string(),
  days: z.array(TPlannerProgramDay),
  id: z.string().optional(),
  description: z.string().optional(),
});
export type IPlannerProgramWeek = Readonly<z.infer<typeof TPlannerProgramWeek>>;
const TPlannerProgram = z.strictObject({
  name: z.string(),
  weeks: z.array(TPlannerProgramWeek),
});
export type IPlannerProgram = Readonly<z.infer<typeof TPlannerProgram>>;
const TProgram = z.object({
  exercises: z.array(TProgramExercise),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  url: z.string(),
  author: z.string(),
  nextDay: z.number(),
  days: z.array(TProgramDay),
  weeks: z.array(TProgramWeek),
  deletedDays: z.array(z.string()).optional(),
  deletedWeeks: z.array(z.string()).optional(),
  deletedExercises: z.array(z.string()).optional(),
  clonedAt: z.number().optional(),
  shortDescription: z.string().optional(),
  planner: TPlannerProgram.optional(),
  updatedAt: z.number().optional(),
  authorid: z.string().nullish(),
  source: z.string().nullish(),
});
export type IProgram = z.infer<typeof TProgram>;
