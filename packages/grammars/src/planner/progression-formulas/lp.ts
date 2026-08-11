import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { type PlanNodes } from "@/planner/parsing/guards.ts";
import { type IDynamicWeight, type IWeight, parsePct, w } from "@/quantities/weight.ts";
import { fail, type IEither, type OneOrMore, succeed } from "@/utils/types.ts";
import { attemptCreateObject } from "@/utils/object.ts";

/**
 * @yields any problems found with use of the linear progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
export function validate(
	[
		argWeight,
		argAttempts,
		argSuccessfulAttempts,
		argNextWeight,
		argFailedAttempts,
		argFailedAttemptsUpToDate,
		...argsRest
	]: string[],
	valueNode: PlanNodes.FunctionExpression,
): IEither<
	{
		weight: IWeight | IDynamicWeight;
		attempts: number;
		successfulAttemptsUpToDate: number;
		nextWeight: IWeight | IDynamicWeight;
		failedAttempts: number;
		failedAttemptsUpToDate: number;
	},
	OneOrMore<SourcedSyntaxError>
> {
	const result = attemptCreateObject<
		{
			weight: IWeight | IDynamicWeight;
			attempts: number;
			successfulAttemptsUpToDate: number;
			nextWeight: IWeight | IDynamicWeight;
			failedAttempts: number;
			failedAttemptsUpToDate: number;
		},
		SourcedSyntaxError
	>({
		weight: () => {
			return argWeight &&
				!argWeight.endsWith("lb") &&
				!argWeight.endsWith("kg") &&
				!argWeight.endsWith("%")
				? fail(
						nodeError(
							valueNode,
							`1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
						),
					)
				: succeed(parsePct(argWeight) ?? w`0lb`);
		},
		attempts: () => {
			return argAttempts != null && asBase10Int(argAttempts)
				? fail(
						nodeError(
							valueNode,
							`2nd argument of 'lp' should be a number of attempts - i.e. a number`,
						),
					)
				: succeed(argAttempts ? parseInt(argAttempts, 10) : 1);
		},
		successfulAttemptsUpToDate: () => {
			return argSuccessfulAttempts != null && asBase10Int(argSuccessfulAttempts)
				? fail(
						nodeError(
							valueNode,
							`3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
						),
					)
				: succeed(argSuccessfulAttempts ? parseInt(argSuccessfulAttempts, 10) : 0);
		},
		nextWeight: () => {
			return argNextWeight != null &&
				!argNextWeight.endsWith("lb") &&
				!argNextWeight.endsWith("kg") &&
				!argNextWeight.endsWith("%")
				? fail(
						nodeError(
							valueNode,
							`4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
						),
					)
				: succeed(parsePct(argNextWeight) ?? w`0lb`);
		},
		failedAttempts: soFar => {
			return argFailedAttempts != null && asBase10Int(argFailedAttempts)
				? fail(
						nodeError(
							valueNode,
							`5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
						),
					)
				: succeed(
						argFailedAttempts
							? parseInt(argFailedAttempts, 10)
							: (soFar.nextWeight?.value ?? 0) > 0
								? 1
								: 0,
					);
		},
		failedAttemptsUpToDate: () => {
			return argFailedAttemptsUpToDate != null && asBase10Int(argFailedAttemptsUpToDate)
				? fail(
						nodeError(
							valueNode,
							`6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
						),
					)
				: succeed(argFailedAttemptsUpToDate ? parseInt(argFailedAttemptsUpToDate, 10) : 0);
		},
	});
	if (argsRest.length > 0) {
		return fail([
			...(!result.success ? result.error : []),
			nodeError(valueNode, `Linear Progression 'lp' only has 6 arguments max`),
		]);
	}
	return result;
}

// @todo make the validators return well typed arg objects so that you can well type the args here!
export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, OneOrMore<SourcedSyntaxError>> {
	const result = validate(args, node);
	if (!result.success) {
		return result;
	}
	const {
		weight,
		attempts,
		successfulAttemptsUpToDate,
		nextWeight,
		failedAttempts,
		failedAttemptsUpToDate,
	} = result.data;
	return {
		success: true,
		data: {
			type: IProgramExerciseProgressType.LP,
			state: {
				increment: weight,
				successes: attempts,
				successCounter: successfulAttemptsUpToDate,
				decrement: nextWeight,
				failures: failedAttempts,
				failureCounter: failedAttemptsUpToDate,
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
