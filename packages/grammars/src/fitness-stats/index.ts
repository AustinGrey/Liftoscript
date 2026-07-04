import { TLengthUnit } from "@/common-types.ts";
import {
  add,
  build,
  divide,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/quantities/weight.ts";
import { CollectionUtils_sortBy } from "@/utils/collection.ts";
import { z, type ZodType } from "zod";

const TLength = z.object({
  value: z.number(),
  unit: TLengthUnit,
});

/**
 * A timestamped series of samples. They may or may not be in order, but can be sorted via the time stamp
 * @param valueSchema
 */
function dataSeries<TValue extends ZodType>(valueSchema: TValue) {
  return z.array(
    z.object({
      value: valueSchema,
      timestamp: z.number(),
    }),
  );
}

const TStats = z.strictObject({
  /** The user's bodyweight */
  weight: dataSeries(TWeight),
  /** The measured circumference of the neck */
  neck: dataSeries(TLength),
  /** The measured width of the shoulders */
  shoulders: dataSeries(TLength),
  /** The measured circumference of the left bicep */
  bicepLeft: dataSeries(TLength),
  /** The measured circumference of the right bicep */
  bicepRight: dataSeries(TLength),
  /** The measured circumference of the left forearm */
  forearmLeft: dataSeries(TLength),
  /** The measured circumference of the right forearm */
  forearmRight: dataSeries(TLength),
  /** The measured circumference of the chest */
  chest: dataSeries(TLength),
  /** The measured circumference of the waist */
  waist: dataSeries(TLength),
  /** The measured circumference of the hips */
  hips: dataSeries(TLength),
  /** The measured circumference of the left thigh */
  thighLeft: dataSeries(TLength),
  /** The measured circumference of the right thigh */
  thighRight: dataSeries(TLength),
  /** The measured circumference of the left calf */
  calfLeft: dataSeries(TLength),
  /** The measured circumference of the right calf */
  calfRight: dataSeries(TLength),
  /** The measured percent weight of bodyfat */
  bodyfat: dataSeries(TDynamicWeight),
});
export type IStats = z.infer<typeof TStats>;

/**
 * Builds an empty {@link IStats} object with no recorded samples in any series.
 * Useful as a starting point for simulations or tests where body measurements
 * are not relevant.
 */
export function Stats_build(): IStats {
  return {
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
  };
}

/**
 * Calculates a moving average of the body weight stat based on a given window size
 * @param stats The source statistics
 * @param resultingUnits The units to return the moving average in
 * @param movingAverageWindowSize The window size, in number of samples. If undefined, 0, or larger than the number of samples, returns current body weight.
 *   @todo It seems non-sensical to return the current body weight if the window size is too large. Couldn't you just return the average over all samples in that case?
 * @constructor
 */
export function getAverageBodyweight(
  stats: IStats,
  resultingUnits: "kg" | "lb",
  movingAverageWindowSize: number | undefined,
): IWeight | undefined {
  const samples = CollectionUtils_sortBy(stats.weight, "timestamp", true).slice(
    0,
    movingAverageWindowSize,
  );
  if (!movingAverageWindowSize || samples.length < movingAverageWindowSize) {
    return samples.at(0)?.value;
  }
  const totalWeight = samples.reduce(
    (sum, item) => add(sum, item.value),
    build(0, resultingUnits),
  );
  return divide(totalWeight, samples.length);
}
