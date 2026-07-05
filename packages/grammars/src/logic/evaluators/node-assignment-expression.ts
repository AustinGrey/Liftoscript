import { type LogicHandler, type Validator } from "@/logic/evaluators/types.ts";
import { getChild, isLogicNodeOfType, queryChild, queryChildren } from "@/logic/parsing/guards.ts";
import { isQuantity } from "@/logic/types.ts";
import { toNumberUnsafe } from "@/logic/result-handling.ts";
import { isOneOf } from "@/utils/types.ts";
import {
	changeBinding,
	changeNumberOfSets,
	recordVariableUpdate,
} from "@/logic/evaluators/common.ts";
import { nodeError } from "@/utils/lezer.ts";
import { convertToWeight } from "@/quantities/weight.ts";

export const handler: LogicHandler<"AssignmentExpression"> = (n, t) => {
	const [variableNode, expression] = queryChildren(n, { atLeast: 2 });
	if (isLogicNodeOfType("VariableExpression", variableNode)) {
		const nameNode = getChild(variableNode, { ofType: "Keyword" });
		if (nameNode == null) {
			throw nodeError(variableNode, `Missing variable name`);
		}
		const [...indexExprs] = queryChildren(variableNode, {
			ofType: "VariableIndex",
		});
		const variable = nameNode.source;
		if (variable === "rm1") {
			if (indexExprs.length > 0) {
				throw nodeError(n, `rm1 is not an array`);
			}
			const evaluatedValue = t.recurse(expression);
			let value = Array.isArray(evaluatedValue) ? evaluatedValue[0] : evaluatedValue;
			value = value ?? 0;
			value = value === true ? 1 : value === false ? 0 : value;
			value = convertToWeight(
				t.getGlobal("rm1"),
				value,

				// @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
				//     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
				// this.unit,
				"kg",
			);
			t.updateGlobal("rm1", value);
			return value;
		} else if (
			t.mode === "planner" &&
			isOneOf(
				variable,
				"reps",
				"weights",
				"RPE",
				"minReps",
				"timers",
				"logrpes",
				"amraps",
				"askweights",
				"setVariationIndex",
				"descriptionIndex",
				"numberOfSets",
			)
		) {
			return recordVariableUpdate(variable, expression, indexExprs, "=", t);
		} else if (t.mode === "update" && variable === "numberOfSets") {
			return changeNumberOfSets(expression, "=", t);
		} else if (
			t.mode === "update" &&
			isOneOf(
				variable,
				"reps",
				"weights",
				"RPE",
				"amraps",
				"logrpes",
				"askweights",
				"minReps",
				"timers",
			)
		) {
			return changeBinding(variable, expression, indexExprs, "=", t);
		} else {
			throw nodeError(variableNode, `Unknown variable '${variable}'`);
		}
	} else if (isLogicNodeOfType("Variable", variableNode)) {
		const varKey = variableNode.source.replace("var.", "");
		const value = t.recurse(expression);
		return t.updateVar(varKey, isQuantity(value) ? value : value ? 1 : 0);
	} else if (isLogicNodeOfType("StateVariable", variableNode)) {
		const indexNode = queryChild(variableNode, {
			ofType: "StateVariableIndex",
		});
		const stateKey = queryChild(variableNode, { ofType: "Keyword" })?.source;
		if (stateKey == null) {
			return 0;
		}

		// There are two different state sources - the normal "state" and the "otherStates" collection of various states
		// @TODO Why? What makes these two different from each other? Hypothesis - "state" is the state of the current exercise, while otherStates is the state of all the other exercises, indexed by set
		// If there is no index node, we assume we are trying to update the current state, otherwise, we pull the state from the other states at that index.
		const value = t.recurse(expression);
		t.updateState(
			stateKey,
			// @TODO why would we be forcing this to be a number? Would it make more sense to bubble an error?
			isQuantity(value) ? value : value ? 1 : 0,
			n,
			indexNode ? toNumberUnsafe(t.recurse(indexNode)) : undefined,
		);
		return value;
	}
	throw nodeError(n, "Cannot assign a value to something other than a variable");
};

export const validator: Validator<"AssignmentExpression"> = function* (n, t) {
	const [variableNode] = queryChildren(n);

	if (isLogicNodeOfType("Variable", variableNode)) {
		t.trackVariable(variableNode.source);
		return;
	}

	if (!isLogicNodeOfType("VariableExpression", variableNode)) {
		return;
	}
	const name = queryChild(variableNode, { ofType: "Keyword" })?.source;
	if (name !== undefined && t.mode === "update") {
		if (
			![
				"reps",
				"weights",
				"RPE",
				"minReps",
				"numberOfSets",
				"timers",
				"askweights",
				"amraps",
				"logrpes",
			].includes(name)
		) {
			yield nodeError(variableNode, `Cannot assign to '${name}'`);
			return;
		}
		const indexExprs = queryChildren(variableNode, {
			ofType: "VariableIndex",
		}).toArray();
		if (name === "numberOfSets" && indexExprs.length > 0) {
			yield nodeError(variableNode, `${name} is not an array`);
			return;
		}

		if (indexExprs.length > 1) {
			yield nodeError(variableNode, `Can't assign to set variations, weeks or days here`);
			return;
		}
	}
};
