import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import { asBase10Int } from "@/utils/math.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { type PlanNodes } from "@/planner/parsing/guards.ts";
import { type IDynamicWeight, type IWeight, parsePct, w } from "@/quantities/weight.ts";
import { fail, type IEither, ifSuccess, type OneOrMore, succeed } from "@/utils/types.ts";
import { attemptCreateObject } from "@/utils/object.ts";

/**
 * @yields any problems found with use of the linear progression formula in code
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 */
function validate(
	[
		argWeight,
		argAttempts,
		argSuccessfulAttempts,
		argNextWeight,
		argFailedAttempts,
		argFailedAttemptsUpToDate,
		...argsRest
	]: Iterable<string>,
	valueNode: PlanNodes.FunctionExpression,
) {
	const result = attemptCreateObject<
		{
			increment: IWeight | IDynamicWeight;
			successes: number;
			successCounter: number;
			decrement: IWeight | IDynamicWeight;
			failures: number;
			failureCounter: number;
		},
		SourcedSyntaxError
	>({
		increment: () =>
			argWeight &&
			!argWeight.endsWith("lb") &&
			!argWeight.endsWith("kg") &&
			!argWeight.endsWith("%")
				? fail(
						nodeError(
							valueNode,
							`1st argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
						),
					)
				: succeed(parsePct(argWeight) ?? w`0lb`),
		successes: () =>
			argAttempts != null && asBase10Int(argAttempts)
				? fail(
						nodeError(
							valueNode,
							`2nd argument of 'lp' should be a number of attempts - i.e. a number`,
						),
					)
				: succeed(argAttempts ? parseInt(argAttempts, 10) : 1),
		successCounter: () =>
			argSuccessfulAttempts != null && asBase10Int(argSuccessfulAttempts)
				? fail(
						nodeError(
							valueNode,
							`3rd argument of 'lp' should be a current number of successful attempts up to date - i.e. a number`,
						),
					)
				: succeed(argSuccessfulAttempts ? parseInt(argSuccessfulAttempts, 10) : 0),
		decrement: () =>
			argNextWeight != null &&
			!argNextWeight.endsWith("lb") &&
			!argNextWeight.endsWith("kg") &&
			!argNextWeight.endsWith("%")
				? fail(
						nodeError(
							valueNode,
							`4th argument of 'lp' should be weight (ending with 'lb' or 'kg') or percentage (ending with '%'). For example '10lb' or '30%'.`,
						),
					)
				: succeed(parsePct(argNextWeight) ?? w`0lb`),
		failures: soFar =>
			argFailedAttempts != null && asBase10Int(argFailedAttempts)
				? fail(
						nodeError(
							valueNode,
							`5th argument of 'lp' should be a number of failed attempts - i.e. a number`,
						),
					)
				: succeed(
						argFailedAttempts
							? parseInt(argFailedAttempts, 10)
							: (soFar.decrement?.value ?? 0) > 0
								? 1
								: 0,
					),
		failureCounter: () =>
			argFailedAttemptsUpToDate != null && asBase10Int(argFailedAttemptsUpToDate)
				? fail(
						nodeError(
							valueNode,
							`6th argument of 'lp' should be a current number of failed attempts up to date - i.e. a number`,
						),
					)
				: succeed(argFailedAttemptsUpToDate ? parseInt(argFailedAttemptsUpToDate, 10) : 0),
	});
	return argsRest.length > 0
		? fail([
				...(!result.success ? result.error : []),
				nodeError(valueNode, `Linear Progression 'lp' only has 6 arguments max`),
			] as OneOrMore<SourcedSyntaxError>)
		: result;
}

// @todo make the validators return well typed arg objects so that you can well type the args here!
export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: Iterable<string>,
): IEither<IProgramExerciseProgress, OneOrMore<SourcedSyntaxError>> {
	return ifSuccess(validate(args, node), state => ({
		type: IProgramExerciseProgressType.LP,
		state,
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
	}));
}
