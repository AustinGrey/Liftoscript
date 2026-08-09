import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
	type ProgressionFormulaValidator,
} from "@/planner/progression-formulas/types.ts";
import { type PlanNodes } from "@/planner/parsing/guards.ts";
import { parsePct, w } from "@/quantities/weight.ts";
import type { IEither } from "@/utils/types.ts";

/**
 * @yields any problems found with use of the linear progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export const validate: ProgressionFormulaValidator = function* (
	[
		argWeight,
		argAttempts,
		argSuccessfulAttempts,
		argNextWeight,
		argFailedAttempts,
		argFailedAttemptsUpToDate,
		...argsRest
	],
	valueNode,
) {
	if (
		argWeight &&
		!argWeight.endsWith("lb") &&
		!argWeight.endsWith("kg") &&
		!argWeight.endsWith("%")
	) {
		yield nodeError(
			valueNode,
			`1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
		);
	}
	if (argAttempts != null && asBase10Int(argAttempts)) {
		yield nodeError(
			valueNode,
			`2nd argument of 'lp' should be a number of attempts - i.e. a number`,
		);
	}
	if (argSuccessfulAttempts != null && asBase10Int(argSuccessfulAttempts)) {
		yield nodeError(
			valueNode,
			`3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
		);
	}
	if (
		argNextWeight != null &&
		!argNextWeight.endsWith("lb") &&
		!argNextWeight.endsWith("kg") &&
		!argNextWeight.endsWith("%")
	) {
		yield nodeError(
			valueNode,
			`4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
		);
	}
	if (argFailedAttempts != null && asBase10Int(argFailedAttempts)) {
		yield nodeError(
			valueNode,
			`5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
		);
	}
	if (argFailedAttemptsUpToDate != null && asBase10Int(argFailedAttemptsUpToDate)) {
		yield nodeError(
			valueNode,
			`6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
		);
	}
	if (argsRest.length > 0) {
		yield nodeError(valueNode, `Linear Progression 'lp' only has 6 arguments max`);
	}
};

// @todo make the validators return well typed arg objects so that you can well type the args here!
export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, SourcedSyntaxError> {
	const decrement = args[3] ? parsePct(args[3]) : w`0lb`;
	return {
		success: true,
		data: {
			type: IProgramExerciseProgressType.LP,
			state: {
				increment: (args[0] ? parsePct(args[0]) : w`0lb`) ?? w`0lb`,
				successes: args[1] ? parseInt(args[1], 10) : 1,
				successCounter: args[2] ? parseInt(args[2], 10) : 0,
				decrement: decrement ?? w`0lb`,
				failures: args[4] ? parseInt(args[4], 10) : (decrement?.value ?? 0) > 0 ? 1 : 0,
				failureCounter: args[5] ? parseInt(args[5], 10) : 0,
			},
			stateMetadata: {},
			script: `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  state.successCounter += 1
  if (state.successCounter >= state.successes) {
    for (var.i in completedReps) {
      var.isInitial = weights[var.i] == 0 && completedWeights[var.i] != 0
      if (var.isInitial) {
        weights[var.i] = completedWeights[var.i] + state.increment
      } else {
        weights[var.i] += (completedWeights[var.i] - weights[var.i]) + state.increment
      }
    }
    state.successCounter = 0
    state.failureCounter = 0
  }
}
if (state.decrement > 0 && state.failures > 0) {
  if (!(completedReps >= minReps && completedRPE <= RPE)) {
    state.failureCounter += 1
    if (state.failureCounter >= state.failures) {
      weights -= state.decrement
      state.failureCounter = 0
      state.successCounter = 0
    }
  }
}`,
		},
	};
}
