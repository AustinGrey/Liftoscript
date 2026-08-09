import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
	type ProgressionFormulaValidator,
} from "@/planner/progression-formulas/types.ts";
import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import type { PlanNodes } from "@/planner/parsing/guards.ts";
import type { IEither } from "@/utils/types.ts";
import { parsePct, w } from "@/quantities/weight.ts";

/**
 * @yields any problems found with use of the sum progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (
	[argReps, argWeight, ...argsRest],
	valueNode,
) {
	if (argReps == null || asBase10Int(argReps)) {
		yield nodeError(valueNode, `1st argument of 'sum' should be a number of reps - i.e. a number`);
	}
	if (
		argWeight == null ||
		(!argWeight.endsWith("lb") && !argWeight.endsWith("kg") && !argWeight.endsWith("%"))
	) {
		yield nodeError(
			valueNode,
			`2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
		);
	}
	if (argsRest.length > 0) {
		yield nodeError(valueNode, `Reps Sum Progression 'sum' only has 2 arguments max`);
	}
};

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, SourcedSyntaxError> {
	return {
		success: true,
		data: {
			type: IProgramExerciseProgressType.SUM,
			state: {
				reps: args[0] ? parseInt(args[0], 10) : 0,
				increment: (args[1] ? parsePct(args[1]) : w`0lb`) ?? w`0lb`,
			},
			stateMetadata: {},
			script: `for (var.i in completedReps) {
if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
  weights[var.i] = completedWeights[var.i]
}
}
if (sum(completedReps) >= state.reps) {
for (var.i in completedReps) {
  weights[var.i] = completedWeights[var.i] + state.increment
}
}`,
		},
	};
}
