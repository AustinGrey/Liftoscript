import { PlannerNodeName, type PlanNodes } from "@/planner/parsing/guards.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
	type ProgressionFormulaValidator,
} from "@/planner/progression-formulas/types.ts";
import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import type { IEither } from "@/utils/types.ts";
import {
	fnArgsToStateVars,
	getNodeSourceEscapedWhiteSpace,
} from "@/evaluators/plan-evaluator-minimal.ts";

/**
 * @yields any problems found with use of the custom progression formula in code
 * @param _ The args passed to the function
 * @param valueNode The node where the formula use was defined
 * @param validateLiftoscript The method used to validate embedded liftoscript
 */
export const validate: ProgressionFormulaValidator = function* (_, valueNode, validateLiftoscript) {
	const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
	const script = liftoscriptNode?.source;
	const body = valueNode
		.getChild(PlannerNodeName.ReuseLiftoscript)
		?.getChild(PlannerNodeName.ReuseSection)
		?.getChild(PlannerNodeName.ExerciseName)?.source;
	if (!script && !body) {
		yield nodeError(
			valueNode,
			`'custom' progression requires either to specify Liftoscript block or specify which one to reuse`,
		);
	}
	if (script) {
		const { line, from } = liftoscriptNode.getPointer();
		yield* Array.from(validateLiftoscript(script)).map(
			err =>
				new SourcedSyntaxError(
					err.message,
					line + err.line,
					err.offset,
					from + err.from,
					from + err.to,
				),
		);
	}
};

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: string[],
): IEither<IProgramExerciseProgress, SourcedSyntaxError> {
	const reuseLiftoscriptNode = node
		.getChild(PlannerNodeName.ReuseLiftoscript)
		?.getChild(PlannerNodeName.ReuseSection)
		?.getChild(PlannerNodeName.ExerciseName);
	let errorMessage: SourcedSyntaxError | undefined;
	const { state, stateMetadata } = fnArgsToStateVars(args, message => {
		errorMessage = nodeError(node, message);
	});
	if (errorMessage) {
		return {
			success: false,
			error: errorMessage,
		};
	}
	const reuseFullname = reuseLiftoscriptNode
		? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
		: undefined;
	return {
		success: true,
		data: {
			type: IProgramExerciseProgressType.CUSTOM,
			state,
			stateMetadata,
			script: node.getChild(PlannerNodeName.Liftoscript)?.source,
			reuse: reuseFullname ? { fullName: reuseFullname, source: "specific" } : undefined,
		},
	};
}
