import { type IDynamicWeight, type IWeight, rpePct } from "@/quantities/weight.ts";
import { $ } from "@/utils/effects.ts";

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
