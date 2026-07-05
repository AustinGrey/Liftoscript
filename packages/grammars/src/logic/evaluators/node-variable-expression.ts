import {
	type IScriptBindings,
	type LogicHandler,
	type Validator,
} from "@/logic/evaluators/types.ts";
import { nodeError } from "@/utils/lezer.ts";
import { getChild, isLogicNodeOfType, queryChildren } from "@/logic/parsing/guards.ts";
import { is } from "@/utils/types.ts";
import { TDynamicWeight, TWeight } from "@/quantities/weight.ts";

export const handler: LogicHandler<"VariableExpression"> = (n, t) => {
	// Get the variable to be indexed
	const nameNode = getChild(n);
	const name = nameNode.source as keyof IScriptBindings;

	// Get the logic that will determine which index to pull from the variable
	// Ignore other nodes found here.
	const [firstIndexExpression, ...otherIndexExpressions] = queryChildren(n, {
		ofType: "VariableIndex",
	});
	if (!firstIndexExpression) {
		// There is no indexing happening
		let value = t.getGlobal(name);
		if (Array.isArray(value) && name === "minReps") {
			value = value.map((v, i) => (v as number) ?? t.getGlobal("reps")[i]);
		}
		return value;
	} else if (otherIndexExpressions.length === 0) {
		// There is only one index expression, so we can evaluate it
		const [indexNode] = queryChildren(firstIndexExpression, { atLeast: 1 });
		if (
			isLogicNodeOfType("Wildcard", indexNode)
			// @todo Original liftoscript had this condition, which is invalid
			//    clearly "current" is the node name for the "_" sigil, but that's not in the grammar? Why? Should it be added into the grammar?
			// || isLogicNodeOfType("Current", indexNode)
		) {
			throw nodeError(indexNode, `Can't use '*' or '_' as an index when reading from variables`);
		}
		const indexEval = t.recurse(indexNode);
		let index: number;
		if (is(TWeight, indexEval) || is(TDynamicWeight, indexEval)) {
			index = indexEval.value;
		} else if (typeof indexEval === "number") {
			index = indexEval;
		} else {
			index = indexEval ? 1 : 0;
		}
		index -= 1;
		const binding = t.getGlobal(name);
		if (!Array.isArray(binding)) {
			throw nodeError(nameNode, `Variable ${name} should be an array`);
		}
		if (index >= binding.length) {
			throw nodeError(nameNode, `Out of bounds index ${index + 1} for array ${name}`);
		}
		let value = binding[index];
		if (value == null) {
			value = name === "minReps" ? (t.getGlobal("reps")[index] ?? 0) : 0;
		}
		return value;
	} else {
		throw nodeError(n, `Can't use [1:1] syntax when reading from the ${name} variable`);
	}
};

export const validator: Validator<"VariableExpression"> = function* (n, t) {
	const [nameNode, indexExpr] = queryChildren(n);
	if (nameNode == null) {
		yield nodeError(
			n,
			`Expected a VariableExpression child in a StateVariable node, but found none`,
		);
		return;
	}
	const name = nameNode.source;
	if (indexExpr != null) {
		const validNames: (keyof IScriptBindings)[] = [
			"originalWeights",
			"weights",
			"reps",
			"minReps",
			"completedReps",
			"completedRepsLeft",
			"completedWeights",
			"timers",
			"w",
			"r",
			"cr",
			"cw",
			"mr",
			"completedRPE",
			"bodyweight",
			"RPE",
			"setVariationIndex",
			"descriptionIndex",
			"numberOfSets",
			"programNumberOfSets",
			"completedNumberOfSets",
			"amraps",
			"logrpes",
			"askweights",
		];
		if (!validNames.includes(name as keyof IScriptBindings)) {
			yield nodeError(nameNode, `${name} is not an array variable`);
			return;
		}
	}

	if (indexExpr == null && !t.knownBindings.includes(name)) {
		yield nodeError(nameNode, `${name} is not a valid variable`);
	}
};
