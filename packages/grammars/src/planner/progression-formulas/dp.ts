import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import type { PlanNodes } from "@/planner/parsing/guards.ts";
import { fail, type IEither, ifSuccess, type Oneⵜ, succeed } from "@/utils/types.ts";
import { parsePct, w } from "@/quantities/weight.ts";
import { attemptCreateObject } from "@/utils/object.ts";

/**
 * @yields any problems found with use of the double progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
function validate(
	[argWeight, argMinReps, argMaxReps, ...argsRest]: string[],
	valueNode: PlanNodes.FunctionExpression,
) {
	return attemptCreateObject(
		{
			increment: () =>
				!argWeight.endsWith("lb") && !argWeight.endsWith("kg") && !argWeight.endsWith("%")
					? fail(
							nodeError(
								valueNode,
								`1st argument of 'dp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
							),
						)
					: succeed((argWeight ? parsePct(argWeight) : w`0lb`) ?? w`0lb`),
			minReps: () =>
				asBase10Int(argMinReps)
					? fail(
							nodeError(
								valueNode,
								`2nd argument of 'dp' should be min reps in the range - i.e. a number, like 8`,
							),
						)
					: succeed(argMinReps ? parseInt(argMinReps, 10) : 0),
			maxReps: () =>
				asBase10Int(argMaxReps)
					? fail(
							nodeError(
								valueNode,
								`3rd argument of 'dp' should be max reps in the range - i.e. a number, like 12`,
							),
						)
					: succeed(argMaxReps ? parseInt(argMaxReps, 10) : 0),
		},
		() => {
			if (argWeight == null || argMinReps == null || argMaxReps == null || argsRest.length > 0) {
				return nodeError(valueNode, `Double Progression 'dp' should have 3 arguments`);
			}
		},
	);
}

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, Oneⵜ<SourcedSyntaxError>> {
	return ifSuccess(validate(args, node), state => ({
		type: IProgramExerciseProgressType.DP,
		state,
		stateMetadata: {},
		script: `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  if (completedReps >= state.maxReps) {
    reps = state.minReps
    for (var.i in completedReps) {
      var.isInitial = weights[var.i] == 0 && completedWeights[var.i] != 0
      if (var.isInitial) {
        weights[var.i] = completedWeights[var.i] + state.increment
      } else {
        weights[var.i] += (completedWeights[var.i] - weights[var.i]) + state.increment
      }
    }
  } else {
    for (var.i in completedReps) {
      reps[var.i] = completedReps[var.i] + 1 > state.maxReps ?
        state.maxReps :
        completedReps[var.i] + 1
    }
  }
}`,
	}));
}
