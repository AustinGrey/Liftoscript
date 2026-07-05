import type { EvaluateTools } from "@/logic/evaluators/types.ts";
import { definedOnly } from "@/utils/collection.ts";
import { is, isNumber } from "@/utils/types.ts";
import * as Weight from "@/quantities/weight.ts";
import {
	build,
	buildAny,
	convertToWeight,
	type IDynamicWeight,
	type IWeight,
	TDynamicWeight,
	TWeight,
} from "@/quantities/weight.ts";
import type { IAssignmentOp, Quantity } from "@/logic/types.ts";
import { queryChild } from "@/utils/grammars.ts";
import { MathUtils_applyOp, MathUtils_clamp, MathUtils_round } from "@/utils/math.ts";
import { nodeError, type SourcedSyntaxNode } from "@/utils/lezer.ts";
import { isLogicNodeOfType } from "@/logic/parsing/guards.ts";

export function calculateIndexValues(
	indexes: SourcedSyntaxNode[],
	tools: EvaluateTools,
): (number | "*")[] {
	return indexes.filter(definedOnly).map((ie) => {
		if (isLogicNodeOfType("Wildcard", ie)) {
			return "*" as const;
		} else {
			const v = tools.recurse(ie);
			const v1 = Array.isArray(v) ? v[0] : v;
			return is(TWeight, v1) ? v1.value : isNumber(v1) ? v1 : v1 ? 1 : 0;
		}
	});
}

export function evaluateToNumber(expr: SourcedSyntaxNode, tools: EvaluateTools): number {
	const v = tools.recurse(expr);
	const v1 = Array.isArray(v) ? v[0] : v;
	return is(TWeight, v1) ? v1.value : isNumber(v1) ? v1 : v1 ? 1 : 0;
}

export function evaluateToQuantity(expr: SourcedSyntaxNode, tools: EvaluateTools): Quantity {
	const v = tools.recurse(expr);
	const v1 = Array.isArray(v) ? v[0] : v;
	return is(TWeight, v1) || is(TDynamicWeight, v1) || isNumber(v1) ? v1 : v1 ? 1 : 0;
}

/**
 * Adds '*' to the front of an array until it reaches the specified length.
 * Returns a new array, the original is untouched
 * @param target The target array
 * @param length The target length to pad to
 * @TODO move to the collection utils
 */
export function normalizeTarget(
	target: Readonly<(number | "*")[]>,
	length: number,
): (number | "*")[] {
	const newTarget = [...target];
	for (let i = 0; i < length - target.length; i++) {
		newTarget.unshift("*");
	}
	return newTarget;
}

export function changeBinding(
	key: "reps" | "weights" | "RPE" | "minReps" | "timers" | "logrpes" | "amraps" | "askweights",
	expression: SourcedSyntaxNode,
	indexExprs: SourcedSyntaxNode[],
	op: IAssignmentOp,
	tools: EvaluateTools,
): number | IWeight | IDynamicWeight {
	const indexes = indexExprs.map((ie) => queryChild(ie)).filter((x) => x !== undefined);
	const maxTargetLength = 1;
	if (indexes.length > maxTargetLength) {
		throw nodeError(expression, `${key} can only have 1 value inside []`);
	}
	const indexValues = calculateIndexValues(indexes, tools);
	const normalizedIndexValues = normalizeTarget(indexValues, maxTargetLength);
	const [setIndex] = normalizedIndexValues;
	let value: number | IWeight | IDynamicWeight = 0;
	if (key === "weights") {
		for (let i = 0; i < tools.getGlobal("weights").length; i += 1) {
			if (!tools.getGlobal("isCompleted")[i] && (setIndex === "*" || setIndex === i + 1)) {
				const evalutedValue = evaluateToQuantity(expression, tools);
				const newValue = Weight.applyOp(
					tools.getGlobal("rm1"),
					tools.getGlobal("weights")[i] ??
						build(
							0,
							// @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
							//     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
							// this.unit,
							"kg",
						),
					evalutedValue,
					op,
				);
				value = convertToWeight(
					tools.getGlobal("rm1"),
					newValue,
					// @TODO original liftoscript used "this.unit" which implied some sort of preference of units at the time the script is being executed
					//     I don't think that's necessary, we can always convert to KG, do math in KG, and then convert to whatever unit we want afterwards
					// this.unit,
					"kg",
				);
				tools.getGlobal("originalWeights")[i] = value;
				tools.getGlobal("weights")[i] = tools.publicFunctions.roundWeight(value, tools.fnContext);
			}
		}
	} else {
		for (let i = 0; i < tools.getGlobal(key).length; i += 1) {
			if (!tools.getGlobal("isCompleted")[i] && (setIndex === "*" || setIndex === i + 1)) {
				const evaluatedValue = evaluateToNumber(expression, tools);
				value = MathUtils_applyOp(tools.getGlobal(key)[i] ?? 0, evaluatedValue, op);
				if (key === "RPE") {
					value = MathUtils_round(MathUtils_clamp(value, 0, 10), 0.5);
				}
				if (key === "amraps" || key === "logrpes" || key === "askweights") {
					value = Math.round(MathUtils_clamp(value, 0, 1));
				}
				tools.getGlobal(key)[i] = value;
			}
		}
	}
	return value;
}

export function recordVariableUpdate(
	key:
		| "reps"
		| "weights"
		| "timers"
		| "RPE"
		| "minReps"
		| "setVariationIndex"
		| "descriptionIndex"
		| "numberOfSets"
		| "logrpes"
		| "amraps"
		| "askweights",
	expression: SourcedSyntaxNode,
	indexExprs: SourcedSyntaxNode[],
	op: IAssignmentOp,
	tools: EvaluateTools,
): Quantity {
	const indexes = indexExprs.map((ie) => queryChild(ie)).filter((i) => i != undefined);
	const maxTargetLength =
		key === "setVariationIndex" || key === "descriptionIndex" ? 2 : key === "numberOfSets" ? 3 : 4;
	if (key === "setVariationIndex") {
		if (indexes.length > maxTargetLength) {
			throw nodeError(expression, `setVariationIndex can only have 2 values inside [*:*]`);
		}
	} else if (key === "descriptionIndex") {
		if (indexes.length > maxTargetLength) {
			throw nodeError(expression, `descriptionIndex can only have 2 values inside [*:*]`);
		}
	} else if (key === "numberOfSets") {
		if (indexes.length > maxTargetLength) {
			throw nodeError(expression, `numberOfSets can only have 3 values inside [*:*:*]`);
		}
	} else if (indexes.length > maxTargetLength) {
		throw nodeError(expression, `${key} can only have 4 values inside [*:*:*:*]`);
	}
	const indexValues = calculateIndexValues(indexes, tools);
	const normalizedIndexValues = normalizeTarget(indexValues, maxTargetLength);
	let result: number | IWeight | IDynamicWeight;
	if (key === "weights") {
		result = evaluateToQuantity(expression, tools);
		tools.requestUpdate({
			type: key,
			value: { value: result, op, target: normalizedIndexValues },
		});
	} else {
		result = evaluateToNumber(expression, tools);
		tools.requestUpdate({
			type: key,
			value: { value: result, op, target: normalizedIndexValues },
		});
		if (key === "setVariationIndex") {
			const [week, day] = normalizedIndexValues;
			if (
				(week === "*" || week === tools.getGlobal("week")) &&
				(day === "*" || day === tools.getGlobal("day"))
			) {
				tools.updateGlobal("setVariationIndex", result);
			}
		} else if (key === "descriptionIndex") {
			const [week, day] = normalizedIndexValues;
			if (
				(week === "*" || week === tools.getGlobal("week")) &&
				(day === "*" || day === tools.getGlobal("day"))
			) {
				tools.updateGlobal("descriptionIndex", result);
			}
		} else if (key === "numberOfSets") {
			const [week, day, setVariationIndex] = normalizedIndexValues;
			if (
				(week === "*" || week === tools.getGlobal("week")) &&
				(day === "*" || day === tools.getGlobal("day")) &&
				(setVariationIndex === "*" || setVariationIndex === tools.getGlobal("setVariationIndex"))
			) {
				tools.updateGlobal("numberOfSets", result);
				tools.updateGlobal("ns", result);
			}
		}
	}

	return result;
}

/**
 * Many pieces of data in the globals are arrays that have the same length, the number of sets.
 * So if you change the number of sets, you have to change the length of all these arrays too
 * @TODO this hints at a problem with how this data is stored. If some data is a property of one of the sets, then we should probably have a "set" object, and an array of those
 * @param expression The expression that will be evaluated to decide how many sets there will be
 * @param op The operation used to evaluate the expression
 * @param tools The evaluation tools in the current context
 */
export function changeNumberOfSets(
	expression: SourcedSyntaxNode,
	op: IAssignmentOp,
	tools: EvaluateTools,
): number | IWeight | IDynamicWeight {
	const oldNumberOfSets = tools.getGlobal("weights").length;
	const ns = oldNumberOfSets - 1;
	const evaluatedValue = MathUtils_applyOp(
		tools.getGlobal("numberOfSets"),
		evaluateToNumber(expression, tools),
		op,
	);

	// For each array whose length is based on the number of sets, we slice it in case the evaluated value is less than the current value, and then we concat a fill in case it's more than the current value
	function chopOrFill<T>(arr: readonly T[], filler: T): T[] {
		const spotsToFill = Math.max(evaluatedValue - arr.length, 0);
		return arr.slice(0, evaluatedValue).concat(Array(spotsToFill).fill(filler));
	}

	// @TODO several of these elements are aliases for others, but we have to duplicate and maintain consistent copies of the data. This is not good design. We should only store data for the vars once, and re-route aliases to access the single copy
	tools.updateGlobal("originalWeights", (x) =>
		chopOrFill(
			x,
			// Copy the last entry to fill
			buildAny(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
		),
	);
	tools.updateGlobal("timers", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("amraps", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("logrpes", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("askweights", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("RPE", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("completedRepsLeft", (x) => chopOrFill(x, undefined));
	tools.updateGlobal("completedRPE", (x) => chopOrFill(x, undefined));
	tools.updateGlobal("isCompleted", (x) => chopOrFill(x, 0));

	// @TODO duplicated
	tools.updateGlobal("weights", (x) =>
		chopOrFill(
			x,
			// Copy the last entry to fill
			Weight.build(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
		),
	);
	tools.updateGlobal("w", (x) =>
		chopOrFill(
			x, // Copy the last entry to fill
			Weight.build(x[ns]?.value ?? 0, x[ns]?.unit || "lb"),
		),
	);

	// @TODO duplicated
	tools.updateGlobal("reps", (x) => chopOrFill(x, x[ns] ?? 0));
	tools.updateGlobal("r", (x) => chopOrFill(x, x[ns] ?? 0));

	// @TODO duplicated
	tools.updateGlobal("minReps", (x) => chopOrFill(x, x[ns]));
	tools.updateGlobal("mr", (x) => chopOrFill(x, x[ns]));

	// @TODO duplicated
	tools.updateGlobal("completedReps", (x) => chopOrFill(x, undefined));
	tools.updateGlobal("cr", (x) => chopOrFill(x, undefined));

	// @TODO duplicated
	tools.updateGlobal("completedWeights", (x) => chopOrFill(x, undefined));
	tools.updateGlobal("cw", (x) => chopOrFill(x, undefined));

	// Then we can finally update the value
	// @TODO duplicated
	tools.updateGlobal("numberOfSets", evaluatedValue);
	tools.updateGlobal("ns", evaluatedValue);

	return evaluatedValue;
}
