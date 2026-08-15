import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import type { PlanNodes } from "@/planner/parsing/guards.ts";
import { fail, type IEither, ifSuccess, type OneOrMore, succeed } from "@/utils/types.ts";
import { type IDynamicWeight, type IWeight, parsePct, w } from "@/quantities/weight.ts";
import { attemptCreateObject } from "@/utils/object.ts";

/**
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
function validate(
	[argReps, argWeight, ...argsRest]: Iterable<string>,
	valueNode: PlanNodes.FunctionExpression,
): IEither<
	{
		reps: number;
		increment: IWeight | IDynamicWeight;
	},
	OneOrMore<SourcedSyntaxError>
> {
	return attemptCreateObject(
		{
			reps: () =>
				argReps == null || asBase10Int(argReps)
					? fail(
							nodeError(
								valueNode,
								`1st argument of 'sum' should be a number of reps - i.e. a number`,
							),
						)
					: succeed(parseInt(argReps, 10)),
			increment: () =>
				argWeight == null ||
				(!argWeight.endsWith("lb") && !argWeight.endsWith("kg") && !argWeight.endsWith("%"))
					? fail(
							nodeError(
								valueNode,
								`2nd argument of 'sum' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
							),
						)
					: succeed(parsePct(argWeight) ?? w`0lb`),
		},
		() => {
			if (argsRest.length > 0) {
				return nodeError(valueNode, `Reps Sum Progression 'sum' only has 2 arguments max`);
			}
		},
	);
}

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: Iterable<string>,
): IEither<IProgramExerciseProgress, OneOrMore<SourcedSyntaxError>> {
	return ifSuccess(validate(args, node), state => ({
		type: IProgramExerciseProgressType.SUM,
		state,
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
	}));
}
