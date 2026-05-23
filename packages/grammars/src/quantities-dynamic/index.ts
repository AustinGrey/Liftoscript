import {
  getExerciseOrDefault,
  getOrmOrStartingWeight,
  type IExerciseType,
} from "@/exercises";
import type { ISettings } from "@/user-settings";
import { is } from "@/utils/types.ts";
import {
  type IDynamicWeight,
  type IWeight,
  multiply,
  TWeight,
} from "@/quantities/weight.ts";

/**
 * Evaluates a potentially dynamic weight into a guaranteed static one.
 * @param weight The potentially dynamic weight to evaluate
 * @param exerciseType The exercise type for which the weight is being evaluated
 * @param settings The settings object containing exercise and onerm data
 */
export function evaluateWeight(
  weight: IWeight | IDynamicWeight,
  exerciseType: IExerciseType,
  settings: ISettings,
): IWeight {
  if (is(TWeight, weight)) {
    return weight;
  }
  const exercise = getExerciseOrDefault(exerciseType, settings.exercises);
  const onerm = getOrmOrStartingWeight(exercise, settings);
  return multiply(onerm, weight.value / 100);
}
