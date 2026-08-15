import { PlannerNodeName, type PlanNodes } from "@/planner/parsing/guards.ts";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";
import { nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import {
	fail,
	type IEither,
	ifSuccess,
	isOneOrMore,
	type OneOrMore,
	succeed,
} from "@/utils/types.ts";
import {
	fnArgsToStateVars,
	getNodeSourceEscapedWhiteSpace,
	type IPlannerProgramReuse,
} from "@/evaluators/plan-evaluator-minimal.ts";
import type { IProgramState } from "@/common-types.ts";
import type { IProgramStateMetadata } from "@/program";

/**
 * @param args The args passed to the function
 * @param valueNode The node where the formula use was defined
 * @param validateLiftoscript The method used to validate embedded liftoscript
 */
function validate(
	args: Iterable<string>,
	valueNode: PlanNodes.FunctionExpression,
	validateLiftoscript: (script: string) => Iterable<SourcedSyntaxError>,
): IEither<
	{
		state: IProgramState;
		stateMetadata: IProgramStateMetadata;
		script: string | undefined;
		reuse: IPlannerProgramReuse | undefined;
	},
	OneOrMore<SourcedSyntaxError>
> {
	const liftoscriptNode = valueNode.getChild(PlannerNodeName.Liftoscript);
	const script = liftoscriptNode?.source;
	const reuseLiftoscriptNode = valueNode
		.getChild(PlannerNodeName.ReuseLiftoscript)
		?.getChild(PlannerNodeName.ReuseSection)
		?.getChild(PlannerNodeName.ExerciseName);
	const reuseFullName = reuseLiftoscriptNode
		? getNodeSourceEscapedWhiteSpace(reuseLiftoscriptNode)
		: undefined;

	const errors: SourcedSyntaxError[] = [];
	let argsError: SourcedSyntaxError | undefined;
	const { state, stateMetadata } = fnArgsToStateVars(args, message => {
		argsError = nodeError(valueNode, message);
	});
	if (argsError) {
		errors.push(argsError);
	}
	if (!script && !reuseFullName) {
		errors.push(
			nodeError(
				valueNode,
				`'custom' progression requires either to specify Liftoscript block or specify which one to reuse`,
			),
		);
	}
	if (script && liftoscriptNode) {
		const { line, from } = liftoscriptNode.getPointer();
		errors.push(
			...Array.from(validateLiftoscript(script)).map(
				err =>
					new SourcedSyntaxError(
						err.message,
						line + err.line,
						err.offset,
						from + err.from,
						from + err.to,
					),
			),
		);
	}

	return isOneOrMore(errors)
		? fail(errors)
		: succeed({
				state,
				stateMetadata,
				script,
				reuse: reuseFullName ? { fullName: reuseFullName, source: "specific" } : undefined,
			});
}

export function evaluate(
	node: PlanNodes.FunctionExpression,
	args: Iterable<string>,
	validateLiftoscript: (script: string) => Iterable<SourcedSyntaxError>,
): IEither<IProgramExerciseProgress, OneOrMore<SourcedSyntaxError>> {
	return ifSuccess(
		validate(args, node, validateLiftoscript),
		({ state, stateMetadata, script, reuse }) => ({
			type: IProgramExerciseProgressType.CUSTOM,
			state,
			stateMetadata,
			script,
			reuse,
		}),
	);
}
