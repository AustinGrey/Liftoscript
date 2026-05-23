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
  /** The measured circumference ofcalfRight */
  neck: dataSeries(TLength),
  /** The measured circumference of the calfRight */
  shoulders: dataSeries(TLength),
  /** The measured circumference of the calfRight */
  bicepLeft: dataSeries(TLength),
  /** The measured circumference of the bcalfRight */
  bicepRight: dataSeries(TLength),
  /** The measured circumference of the focalfRight */
  forearmLeft: dataSeries(TLength),
  /** The measured circumference of the forcalfRight */
  forearmRight: dataSeries(TLength),
  /** The measured circumference of calfRight */
  chest: dataSeries(TLength),
  /** The measured circumference of calfRight */
  waist: dataSeries(TLength),
  /** The measured circumference ofcalfRight */
  hips: dataSeries(TLength),
  /** The measured circumference of the calfRight */
  thighLeft: dataSeries(TLength),
  /** The measured circumference of the tcalfRight */
  thighRight: dataSeries(TLength),
  /** The measured circumference of thecalfRight */
  calfLeft: dataSeries(TLength),
  /** The measured circumference of the calfRight */
  calfRight: dataSeries(TLength),
  /** The measured percent weight of bodyfat */
  bodyfat: dataSeries(TDynamicWeight),
});
export type IStats = z.infer<typeof TStats>;

function Stats_getCurrentBodyweight(stats: IStats): IWeight | undefined {
  return CollectionUtils_sortBy(stats.weight, "timestamp", true).at(0)?.value;
}

/**
 * Calculates a moving average of the body weight stat based on a given window size
 * @param stats The source statistics
 * @param resultingUnits The units to return the moving average in
 * @param movingAverageWindowSize The window size, in number of samples. If undefined, 0, or larger than the number of samples, returns current body weight.
 *   @todo It seems non-sensical to return the current body weight if the window size is too large. Couldn't you just return the average over all samples in that case?
 * @constructor
 */
export function Stats_getCurrentMovingAverageBodyweight(
  stats: IStats,
  resultingUnits: "kg" | "lb",
  movingAverageWindowSize: number | undefined,
): IWeight | undefined {
  if (!movingAverageWindowSize) {
    return Stats_getCurrentBodyweight(stats);
  }
  const weights = CollectionUtils_sortBy(stats.weight, "timestamp", true);
  if (weights.length < movingAverageWindowSize) {
    return Stats_getCurrentBodyweight(stats);
  }
  const recentWeights = weights.slice(0, movingAverageWindowSize);
  const totalWeight = recentWeights.reduce(
    (sum, item) => add(sum, item.value),
    build(0, resultingUnits),
  );
  return divide(totalWeight, recentWeights.length);
}
