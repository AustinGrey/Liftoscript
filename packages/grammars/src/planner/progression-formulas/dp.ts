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
 * @yields any problems found with use of the double progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (
	[argWeight, argMinReps, argMaxReps, ...argsRest],
	valueNode,
) {
	if (argWeight == null || argMinReps == null || argMaxReps == null || argsRest.length > 0) {
		yield nodeError(valueNode, `Double Progression 'dp' should have 3 arguments`);
		return;
	}
	if (!argWeight.endsWith("lb") && !argWeight.endsWith("kg") && !argWeight.endsWith("%")) {
		yield nodeError(
			valueNode,
			`1st argument of 'dp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
		);
	}
	if (asBase10Int(argMinReps)) {
		yield nodeError(
			valueNode,
			`2nd argument of 'dp' should be min reps in the range - i.e. a number, like 8`,
		);
	}
	if (asBase10Int(argMaxReps)) {
		yield nodeError(
			valueNode,
			`3rd argument of 'dp' should be max reps in the range - i.e. a number, like 12`,
		);
	}
};

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, SourcedSyntaxError> {
	return {
		success: true,
		data: {
			type: IProgramExerciseProgressType.DP,
			state: {
				increment: (args[0] ? parsePct(args[0]) : w`0lb`) ?? w`0lb`,
				minReps: args[1] ? parseInt(args[1], 10) : 0,
				maxReps: args[2] ? parseInt(args[2], 10) : 0,
			},
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
		},
	};
}
