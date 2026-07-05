import { type LogicHandler, type Validator } from "@/logic/evaluators/types.ts";
import { nodeError } from "@/utils/lezer.ts";
import { throwError } from "@/utils/errors.ts";
import { type NodeNames_Logic, queryChild, type TypedLogicNode } from "@/logic/parsing/guards.ts";

export const handler: LogicHandler<"StateVariable"> = (n, t) => {
	const stateKey =
		getStateKey(n) ??
		throwError(
			nodeError(n, `You cannot read from other exercise's states, you can only write to them`),
		);
	return t.getState(stateKey, n);
};

/**
 * Gets the text of the variable attempting to be accessed on the state
 * e.g. state.foo, this would return 'foo'
 * @param expr The node to get the state key from
 */

function getStateKey(expr: TypedLogicNode<NodeNames_Logic>): string | undefined {
	const index = queryChild(expr, { ofType: "StateVariableIndex" });
	if (index === undefined) {
		const stateKeyNode = queryChild(expr, { ofType: "Keyword" });
		if (stateKeyNode != null) {
			return stateKeyNode.source;
		}
	}
	return undefined;
}

export const validator: Validator<"StateVariable"> = function* (n, t) {
	const stateKey = getStateKey(n);
	if (stateKey != null && !t.knownStateVariables.includes(stateKey)) {
		yield nodeError(n, `There's no state variable '${stateKey}'`);
	}
};
