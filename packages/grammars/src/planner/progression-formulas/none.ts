import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { type PlanNodes } from "@/planner/parsing/guards.ts";
import type { IEither } from "@/utils/types.ts";
import { SourcedSyntaxError } from "@/utils/lezer.ts";

export function evaluate(node: PlanNodes.None): IEither<
	IProgramExerciseProgress,
	// @todo why string or SyntaxError? See if you can drop the string failure type!
	string | SourcedSyntaxError
> {
	return;
}
