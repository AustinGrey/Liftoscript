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
} from "@/exercises";
import { getPreferredUnit, type ISettings } from "@/user-settings";
import type { ISet } from "@/common-types.ts";
import { isNumber } from "@/utils/types.ts";
import { UidFactory_generateUid } from "@/utils/generator.ts";
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
              id: UidFactory_generateUid(6),
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
