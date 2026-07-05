import { nodeError } from "@/utils/lezer.ts";
import { asBase10Int } from "@/utils/math.ts";
import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";

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
