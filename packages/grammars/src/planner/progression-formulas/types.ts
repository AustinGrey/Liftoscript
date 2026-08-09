import type { SourcedSyntaxError, SourcedSyntaxNode } from "@/utils/lezer.ts";
import type { IProgramState } from "@/common-types.ts";
import type { IProgramStateMetadata } from "@/program";
import type { IPlannerProgramReuse } from "@/evaluators/plan-evaluator-minimal.ts";
import type { SyntaxNode } from "@lezer/common";

export type ProgressionFormulaValidator = (
	fnArgs: (string | undefined)[],
	valueNode: SourcedSyntaxNode,
	/**
	 * If the progression formula allows logic specified via liftoscript, this function is used to validate the embedded liftoscript.
	 */
	validateLiftoscript: (script: string) => Iterable<SourcedSyntaxError>,
) => Iterable<SourcedSyntaxError>;

/**
 * @todo what relationship does this have to {@link IProgramExerciseUpdateType}, if any? Can they be combined?
 */
export enum IProgramExerciseProgressType {
	CUSTOM = "custom",
	LP = "lp",
	DP = "dp",
	SUM = "sum",
	NONE = "none",
}

export interface IProgramExerciseProgress {
	type: IProgramExerciseProgressType;
	state: IProgramState;
	stateMetadata: IProgramStateMetadata;
	script?: string;
	reuse?: IPlannerProgramReuse;
	liftoscriptNode?: SyntaxNode;
}
