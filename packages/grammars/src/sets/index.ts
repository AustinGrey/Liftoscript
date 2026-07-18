import { type IDynamicWeight, type IWeight, rpePct, TWeight } from "@/quantities/weight.ts";
import { $ } from "@/utils/effects.ts";
import { z } from "zod";

/**
 * Represents a dynamic weight value which is a "percentage of first working set's weight"
 * DO NOT confuse with TDynamicWeight, as that's a percentage but calculated against the 1RM.
 */
export const TWorkingWeightPercent = z.number().brand("% of first working weight");
export type IWorkingWeightPercent = z.infer<typeof TWorkingWeightPercent>;

export const TProgramExerciseWarmupSet = z.strictObject({
	reps: z.number(),
	/**
	 * The weight to use for the warmup
	 */
	value: z.union([TWeight, TWorkingWeightPercent]),
	threshold: TWeight,
});
export type IProgramExerciseWarmupSet = Readonly<z.infer<typeof TProgramExerciseWarmupSet>>;

export interface IPlannerProgramExerciseWarmupSet {
	type: "warmup";
	numberOfSets: number;
	reps: number;
	percentage?: IWorkingWeightPercent;
	weight?: IWeight;
}

/**
 * Information about a potentially flexible number of repetitions
 * @todo rename to "IMovement"? This is more than a range of reps, it's number of sets!
 */
export interface IRepRange {
	/**
	 * The many times this rep range should be done
	 */
	numberOfSets: number;
	/**
	 * The highest number of repetitions that should be done
	 */
	maxrep?: number;
	/**
	 * The lowest number of repetitions that should be done
	 */
	minrep?: number;
	/**
	 * If true, there is no maximum, instead the movement should be done until failure
	 */
	isAmrap: boolean;
	isQuickAddSet: boolean;
}

export interface IPlannerProgramExerciseSet {
	repRange?: IRepRange;
	timer?: number;
	rpe?: number;
	logRpe?: boolean;
	percentage?: number;
	weight?: IWeight;
	label?: string;
	askWeight?: boolean;
}

export interface IPlannerProgramExerciseEvaluatedSet {
	maxrep?: number;
	weight?: IWeight | IDynamicWeight;
	minrep?: number;
	timer?: number;
	rpe?: number;
	logRpe: boolean;
	label?: string;
	isAmrap: boolean;
	isQuickAddSet: boolean;
	askWeight: boolean;
}

/**
 * Gets the weight defined for a set, which could be either static, dynamic, or neither if the set is malformed
 * @param set The set (weight x reps) this is for
 */
export function tryGetWeight(
	set: IPlannerProgramExerciseEvaluatedSet,
): $.Option<IWeight | IDynamicWeight> {
	return $.fromNullable(
		set.weight
			? set.weight
			: set.maxrep != null && set.rpe != null
				? rpePct(set.maxrep, set.rpe)
				: undefined,
	);
}
