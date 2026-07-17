/*
Values which represent weight. Like lbs, kg, etc.
 */

import { z } from "zod";
import { is, isBoolean, isNumber, isRealNumber } from "@/utils/types.ts";

import type { Quantity } from "@/logic/types.ts";
import {
	MathUtils_round,
	MathUtils_roundFloat,
	MathUtils_roundTo000005,
	MathUtils_roundTo005,
	n,
} from "@/utils/math.ts";
import { Exercise_defaultRounding } from "@/models/exercise.ts";
import {
	Equipment_getEquipmentDataForExerciseType,
	Equipment_smallestPlate,
} from "@/models/equipment.ts";
import type { IPlate } from "@/common-types.ts";
import type { IExerciseType } from "@/exercises";
import type { ISettings } from "@/user-settings";
import { type TaggedTemplateHandler, taggedTemplateToString } from "@/utils/string.ts";
import { by, type SortingPredicate } from "@/utils/sorting.ts";
import { closestBoundedSum } from "@/utils/knapsack.ts";
import { rpeMultiplier } from "@/rate-of-perceived-exertion.ts";
import { pipe } from "effect";

export const TUnit = z.union([z.literal("kg"), z.literal("lb")]);
export type IUnit = "kg" | "lb";
export const TWeight = z.object({
	value: z.number(),
	unit: TUnit,
});
export type IWeight = z.infer<typeof TWeight>;
export const TDynamicWeight = z.strictObject({
	value: z.number(),
	unit: z.literal("%"),
});
export type IDynamicWeight = z.infer<typeof TDynamicWeight>;

/**
 * @returns Model for specifying a percentage of the user's current one rep max
 * @param value The percentage value
 */
export function percentORM(value: number): IDynamicWeight {
	return { value, unit: "%" };
}

/**
 * A weight operation that only allows the right operand to be a number
 */
type TOperation = (left: IWeight, right: IWeight | number) => IWeight;
/**
 * A weight operation that allows both operands to be numbers, weights, or percentages
 */
type TComparison = (left: Quantity | undefined, right: Quantity | undefined) => boolean;

export const add: TOperation = (l, r) => operation(l, r, (a, b) => a + b);
export const subtract: TOperation = (l, r) => operation(l, r, (a, b) => a - b);
export const multiply: TOperation = (l, r) => operation(l, r, (a, b) => a * b);
export const divide: TOperation = (l, r) => operation(l, r, (a, b) => a / b);
export const modulo: TOperation = (l, r) => operation(l, r, (a, b) => a % b);
export const gt: TComparison = (l, r) => comparison(l, r, (a, b) => a > b);
export const lt: TComparison = (l, r) => comparison(l, r, (a, b) => a < b);
export const gte: TComparison = (l, r) => comparison(l, r, (a, b) => a >= b);
export const lte: TComparison = (l, r) => comparison(l, r, (a, b) => a <= b);
export const eq: TComparison = (l, r) => comparison(l, r, (a, b) => a === b);

export function operation(
	left: IWeight,
	right: IWeight | number,
	o: (a: number, b: number) => number,
): IWeight;
export function operation(
	left: IWeight | number,
	right: IWeight,
	o: (a: number, b: number) => number,
): IWeight;
export function operation(
	left: IWeight | number,
	right: IWeight | number,
	o: (a: number, b: number) => number,
): IWeight {
	if (isNumber(left) && !isNumber(right)) {
		return build(o(left, right.value), right.unit);
	} else if (!isNumber(left) && isNumber(right)) {
		return build(o(left.value, right), left.unit);
	} else if (!isNumber(left) && !isNumber(right)) {
		return build(o(left.value, convertTo(right, left.unit).value), left.unit);
	} else {
		throw new Error("Weight.operation should never work with numbers only");
	}
}

const prebuiltWeights: Partial<Record<string, IWeight>> = {};
/**
 * Creates a new weight object. Memoized so that it doesn't create a new object for the same value and unit combination.
 * @TODO is memoization really important here? This seems insanely over engineered.
 * @param value The value to set
 * @param unit The unit to use for the weight
 */
export function build(value: number, unit: IUnit): IWeight {
	return (prebuiltWeights[`${value}_${unit}`] ??= { value, unit });
}

export function buildAny(value: number, unit: IUnit | "%"): IWeight | IDynamicWeight {
	if (unit === "%") {
		return percentORM(value);
	} else {
		return build(value, unit);
	}
}

export function convertTo(weight: IWeight, unit: IUnit): IWeight;
export function convertTo(weight: IDynamicWeight, unit: "%" | IUnit): IDynamicWeight;
export function convertTo(weight: number, unit: IUnit): number;
export function convertTo(
	weight: IWeight | number | IDynamicWeight,
	unit: IUnit | "%",
): IWeight | number | IDynamicWeight {
	if (isNumber(weight)) {
		return weight;
	} else if (weight.unit === "%" || unit === "%") {
		return weight;
	} else {
		if (weight.unit === unit) {
			return weight;
		} else if (weight.unit === "kg" && unit === "lb") {
			// @TODO what kind of precision is being rounded to here? It's not a particular number of decimal places or else it would be / 10 then round then * 10. Instead it's * 2 then round divide by 2
			return build(Math.round((weight.value * 2.205) / 0.5) * 0.5, unit);
		} else {
			return build(Math.round(weight.value / 2.205 / 0.5) * 0.5, unit);
		}
	}
}

/**
 * Performs the operation on the two values after making sure they are in the same units
 *
 * Plain numbers are considered "weak" - they are treated as being in the units of the other term if that term has units.
 *
 * If the units cannot be normalized, false is returned.
 * @TODO is that really valid? Should we return some error result to bubble up instead?
 *
 * @param left The left value to compare
 * @param right The right value to compare
 * @param o The comparison function to perform once the units are converted.
 */
function comparison(
	left: Quantity | undefined,
	right: Quantity | undefined,
	o: (a: number, b: number) => boolean,
): boolean {
	if (left === undefined) {
		if (right === undefined) {
			return true;
		}
	} else if (right === undefined) {
		return false;
	} else if (isNumber(left)) {
		if (isNumber(right)) {
			return o(left, right);
		}
		return o(left, right.value);
	} else if (isNumber(right)) {
		return o(left.value, right);
	} else if (left.unit === "%" && right.unit === "%") {
		return o(left.value, right.value);
	} else if (is(TWeight, left) && is(TWeight, right)) {
		return o(left.value, convertTo(right, left.unit).value);
	}
	return false;
}

/**
 * Applies the given operation after normalizing the units of the two quantities.
 * @param onerm The 1 rep max weight
 * @param a The first quantity
 * @param b The second quantity
 * @param o The operation to perform
 */
export function operateAfterNormalized(
	onerm: IWeight | undefined,
	a: Quantity,
	b: Quantity,
	o: (x: number, y: number) => number,
): Quantity {
	if (isNumber(a) && isNumber(b)) {
		return o(a, b);
	}
	if (isNumber(a) && is(TDynamicWeight, b)) {
		return percentORM(o(a, b.value));
	}
	if (isNumber(a) && is(TWeight, b)) {
		return operation(a, b, o);
	}

	if (is(TDynamicWeight, a) && isNumber(b)) {
		return percentORM(o(a.value, b));
	}
	if (is(TDynamicWeight, a) && is(TDynamicWeight, b)) {
		return percentORM(o(a.value, b.value));
	}
	if (is(TDynamicWeight, a) && is(TWeight, b)) {
		const aWeight = onerm ? multiply(onerm, a.value / 100) : MathUtils_roundFloat(a.value / 100, 4);
		return operation(aWeight, b, o);
	}

	if (is(TWeight, a) && isNumber(b)) {
		return operation(a, b, o);
	}
	if (is(TWeight, a) && is(TDynamicWeight, b)) {
		const bWeight = onerm ? multiply(onerm, b.value / 100) : MathUtils_roundFloat(b.value / 100, 4);
		return operation(a, bWeight, o);
	}
	if (is(TWeight, a) && is(TWeight, b)) {
		return operation(a, b, o);
	}

	throw new Error(`Can't apply operation to ${typeof a} and ${typeof b}`);
}

export const compare: SortingPredicate<IWeight> = (a, b) => a.value - convertTo(b, a.unit).value;

export const compareReverse: SortingPredicate<IWeight> = (a, b) =>
	convertTo(b, a.unit).value - a.value;

export function increment(
	weight: IWeight,
	settings: ISettings,
	exerciseType?: IExerciseType,
): IWeight {
	const equipmentData = Equipment_getEquipmentDataForExerciseType(settings, exerciseType);
	if (equipmentData) {
		const unit = equipmentData.unit ?? weight.unit;
		const roundWeight = round(weight, settings, unit, exerciseType);
		if (equipmentData.isFixed) {
			const items = equipmentData.fixed.filter(e => e.unit === unit).toSorted(compare);
			const item = items.find(i => gt(i, roundWeight));
			return item ?? items[items.length - 1] ?? roundWeight;
		} else {
			const smallestPlate = multiply(
				Equipment_smallestPlate(equipmentData, unit),
				equipmentData.multiplier,
			);
			let newWeight = roundWeight;
			let attempt = 0;
			do {
				newWeight = add(newWeight, smallestPlate);
				attempt += 1;
			} while (attempt < 20 && eq(round(newWeight, settings, unit, exerciseType), roundWeight));
			return newWeight;
		}
	} else {
		const roundWeight = round(weight, settings, weight.unit, exerciseType);
		const rounding = exerciseType ? Exercise_defaultRounding(exerciseType, settings) : 1;
		return build(roundWeight.value + rounding, roundWeight.unit);
	}
}

export function decrement(
	weight: IWeight,
	settings: ISettings,
	exerciseType?: IExerciseType,
): IWeight {
	const equipmentData = exerciseType
		? Equipment_getEquipmentDataForExerciseType(settings, exerciseType)
		: undefined;
	if (equipmentData) {
		const unit = equipmentData.unit ?? weight.unit;
		const roundWeight = round(weight, settings, unit, exerciseType);
		if (equipmentData.isFixed) {
			const items = equipmentData.fixed.filter(e => e.unit === unit).toSorted(compareReverse);
			const item = items.find(i => lt(i, roundWeight));
			return item ?? items[items.length - 1] ?? roundWeight;
		} else {
			const smallestPlate = multiply(
				Equipment_smallestPlate(equipmentData, unit),
				equipmentData.multiplier,
			);
			const subtracted = subtract(roundWeight, smallestPlate);
			const newWeight = round(subtracted, settings, unit, exerciseType);
			return build(newWeight.value, newWeight.unit);
		}
	} else {
		const roundWeight = round(weight, settings, weight.unit, exerciseType);
		const rounding = exerciseType ? Exercise_defaultRounding(exerciseType, settings) : 1;
		return build(roundWeight.value - rounding, roundWeight.unit);
	}
}

/**
 * Tries to round the value to match the available plates on the equipment
 * If you don't care about equipment, just use {@link roundTo005} directly.
 * @param weight The weight to round
 * @param settings The user's settings
 * @param unit The unit to round to
 * @param exerciseType The type of exercise
 */
export function round(
	weight: IWeight,
	settings: ISettings,
	unit: IUnit,
	exerciseType: IExerciseType | undefined,
): IWeight {
	// @todo why different rounding strategies?
	return exerciseType
		? roundTo000005(calculatePlates(weight, settings, unit, exerciseType).totalWeight)
		: roundTo005(weight);
}

export function roundTo005(weight: IWeight): IWeight {
	return build(MathUtils_roundTo005(weight.value), weight.unit);
}

export function roundTo000005(weight: IWeight): IWeight {
	return build(MathUtils_roundTo000005(weight.value), weight.unit);
}

/**
 * Calculates which plates can be added to an exercise's machine in order to reach the closest possible weight.
 * @todo actually also return the plates for the purpose of displaying them in a helpful way
 * @todo this might belong in the exercise module, it doesn't really make sense in the generic weight module
 * @param allWeight The target weight to reach
 * @param settings The user settings
 * @param units The desired units - which filters available plates if mixed plates are available
 *     @todo is that even desirable? In a mixed plates setting, you should be able to choose from any available plates rather than focus on only kg or lb plates.
 * @param exerciseType The exercise type, which determines what settings are involved.
 */
function calculatePlates(
	allWeight: IWeight,
	settings: ISettings,
	units: IUnit,
	exerciseType: IExerciseType,
): { totalWeight: IWeight } {
	const equipmentData = Equipment_getEquipmentDataForExerciseType(settings, exerciseType);
	if (equipmentData == null) {
		return {
			totalWeight: build(
				MathUtils_round(allWeight.value, Exercise_defaultRounding(exerciseType, settings)),
				allWeight.unit,
			),
		};
	}

	const absAllWeight = abs(allWeight);
	const inverted = allWeight.value < 0;
	if (equipmentData.isFixed) {
		const fixed = equipmentData.fixed
			.filter(w => w.unit === (equipmentData.unit ?? units))
			.toSorted((a, b) => b.value - a.value);
		const weight = fixed.find(w => lte(w, absAllWeight)) || fixed.at(-1) || absAllWeight;
		const roundedWeight = roundTo005(weight);
		return {
			totalWeight: inverted ? invert(roundedWeight) : roundedWeight,
		};
	}
	const barWeight =
		equipmentData.useBodyweightForBar && settings.currentBodyweight
			? settings.currentBodyweight
			: equipmentData.bar[units];
	const isAssisting = equipmentData.isAssisting || false;
	const multiplier = equipmentData.multiplier || 1;
	const availablePlates = equipmentData.plates
		.filter(p => p.weight.unit === units)
		.sort(by(o => o.weight, compareReverse));
	const targetValue =
		roundTo000005(subtract(absAllWeight, barWeight)).value * (isAssisting ? -1 : 1);
	const plateTypes = availablePlates
		.filter(p => p.num >= multiplier)
		.map(p => ({
			weight: p.weight,
			unitWeight: p.weight.value * multiplier,
			maxUnits: Math.floor(p.num / multiplier),
		}));
	const counts = closestBoundedSum(
		plateTypes.map(p => ({ value: p.unitWeight, maxCount: p.maxUnits })),
		targetValue,
	);
	const plates: IPlate[] = plateTypes.flatMap((plate, i) =>
		counts[i] > 0 ? [{ weight: plate.weight, num: counts[i] * multiplier }] : [],
	);

	const total = plates.reduce(
		(memo, plate) => {
			const weightToAdd = multiply(plate.weight, plate.num);
			return isAssisting ? subtract(memo, weightToAdd) : add(memo, weightToAdd);
		},
		build(0, allWeight.unit),
	);
	const added = add(total, barWeight);
	return {
		totalWeight: inverted ? invert(added) : added,
		// @todo these seem valuable to keep around, but don't currently have a use case
		// platesWeight: inverted ? invert(total) : total,
		// plates
	};
}

function abs(weight: IWeight): IWeight {
	return build(Math.abs(weight.value), weight.unit);
}

function invert(weight: IWeight): IWeight {
	return build(-weight.value, weight.unit);
}

export function getTrainingMax(weight: IWeight, reps: number): IWeight {
	return multiply(getOneRepMax(weight, reps), 0.9);
}

export function getOneRepMax(weight: IWeight, reps: number, rpe?: number): IWeight {
	switch (reps) {
		case 0:
			return build(0, weight.unit);
		case 1:
			return weight;
		default:
			return divide(weight, rpeMultiplier(reps, rpe));
	}
}

export function rpePct(reps: number, rpe: number): IDynamicWeight {
	return pipe(
		rpeMultiplier(reps, rpe),
		m => m * 100, // Turn into a percent
		m => MathUtils_roundTo005(m),
		m => percentORM(m),
	);
}

export function convertToWeight(onerm: IWeight, value: Quantity, unit: IUnit): IWeight {
	if (isNumber(value)) {
		return build(value, unit);
	} else if (is(TDynamicWeight, value)) {
		return convertTo(multiply(onerm, MathUtils_roundFloat(value.value / 100, 4)), unit);
	} else {
		return value;
	}
}
/**
 * Parses template literal as a number with a unit, if possible
 */
const asRealNumberWithUnit: TaggedTemplateHandler<
	{
		amount: number;
		unit: string;
		raw: string;
	},
	string
> = (s, ...v) => {
	const raw = taggedTemplateToString(s, ...v);
	// Flatten everything into a single string before splitting the number away from the unit
	const rawString = raw.replaceAll(/\s+/g, "").split(
		// Finds the 0 width boundaries between the number portion, and the unit portion, splitting on that.
		/(?<=[-0-9.])(?=[^-0-9.])/,
	);
	const [amountRaw, unit, ...rest] = rawString;
	const amount = Number(amountRaw);
	if (rest.length || !isRealNumber(amount)) {
		throw new Error(
			`${rawString.join(", ")} can not be interpreted as a single amount with a unit`,
		);
	}
	return {
		amount,
		unit,
		raw,
	};
};
/**
 * Builds {@link IDynamicWeight} from a string
 */
export const dw: TaggedTemplateHandler<IDynamicWeight, string> = (s, ...v) => {
	const { amount, unit, raw } = asRealNumberWithUnit(s, ...v);
	if (unit !== "%") {
		throw new Error(`${raw} is not a valid IDynamicWeight`);
	}
	return {
		value: amount,
		unit,
	};
};
/**
 * Builds {@link IWeight} from a string
 */
export const w: TaggedTemplateHandler<IWeight, string> = (s, ...v) => {
	const { amount, unit, raw } = asRealNumberWithUnit(s, ...v);
	if (unit !== "kg" && unit !== "lb") {
		throw new Error(`${raw} is not a valid IWeight`);
	}
	return {
		value: amount,
		unit,
	};
};

/**
 * @todo Duplicate of {@link w}?
 * @param str
 */
export function parse(str: string): IWeight | undefined {
	const match = str.match(/^([-+]?[0-9.]+)\s*(kg|lb)$/);
	if (match) {
		return build(MathUtils_roundFloat(parseFloat(match[1]), 2), match[2] as IUnit);
	} else {
		return undefined;
	}
}

/**
 * @todo Duplicate of {@link dw}?
 * @param str
 */
export function parsePct(str?: string): IDynamicWeight | IWeight | undefined {
	if (str == null) {
		return undefined;
	}
	const match = str.match(/^([-+]?[0-9.]+)%$/);
	if (match) {
		return percentORM(MathUtils_roundFloat(parseFloat(match[1]), 2));
	} else {
		return parse(str);
	}
}

/**
 * Converts a quantity to text in a human-readable format
 * @param quantity The value to print
 */
export function print(quantity: Quantity | undefined): string {
	if (quantity === undefined) {
		return "";
	} else if (typeof quantity === "number") {
		return `${n(quantity)}`;
	} else {
		return `${n(quantity.value)}${quantity.unit}`;
	}
}

function coerceToQuantity(value: Quantity | boolean | undefined): Quantity {
	return isBoolean(value) ? (value ? 1 : 0) : (value ?? 0);
}

/** Result type of {@link op} based on operand types. */
export type OpResult<A extends Quantity, B extends Quantity> = [A, B] extends [number, number]
	? number
	: A extends IWeight
		? IWeight
		: B extends IWeight
			? IWeight
			: A extends IDynamicWeight
				? IDynamicWeight
				: B extends IDynamicWeight
					? IDynamicWeight
					: Quantity;

/**
 * Apply an operation to two quantities.
 * @param onerm If the quantities are one weight and one dynamic weight, this is necessary to convert the dynamic weight to a weight.
 * @param oldValueRaw The original value of the quantity before the operation.
 * @param value The value to apply the operation to.
 * @param opr The operation to apply.
 */
export function applyOp<
	TA extends Quantity | boolean | undefined,
	TB extends Quantity,
	TOpr extends "+=" | "-=" | "*=" | "/=" | "=",
>(
	onerm: IWeight | undefined,
	oldValueRaw: TA,
	value: TB,
	opr: TOpr,
): TOpr extends "=" ? TB : OpResult<TA extends boolean | undefined ? Quantity : TA, TB> {
	const oldValue = coerceToQuantity(oldValueRaw);
	if (opr === "=")
		return value as TOpr extends "="
			? TB
			: OpResult<TA extends boolean | undefined ? Quantity : TA, TB>;
	return op(onerm, oldValue, value, (a, b): number => {
		if (opr === "+=") return a + b;
		if (opr === "-=") return a - b;
		// @todo Rounding here just propagates errors. Rounding should happen only right before display.
		if (opr === "*=") return MathUtils_roundTo005(a * b);
		if (opr === "/=") return MathUtils_roundTo005(a / b);
		opr satisfies never;
		throw new Error(`Invalid operator: ${opr}`);
	}) as TOpr extends "=" ? TB : OpResult<TA extends boolean | undefined ? Quantity : TA, TB>;
}

function op<TA extends Quantity, TB extends Quantity>(
	onerm: IWeight | undefined,
	a: TA,
	b: TB,
	o: (x: number, y: number) => number,
): OpResult<TA, TB> /* More readable with hand formatting */ /* prettier-ignore*/ {
  if(isNumber(a)){
    if (isNumber(b)          ) return o(a, b) as OpResult<TA, TB>;
    if (is(TDynamicWeight, b)) return percentORM(o(a, b.value)) as OpResult<TA, TB>;
    if (is(TWeight, b)       ) return operation(a, b, o) as OpResult<TA, TB>;
  }
  if(is(TDynamicWeight, a)){
    if (isNumber(b)          ) return percentORM(o(a.value, b)) as OpResult<TA, TB>;
    if (is(TDynamicWeight, b)) return percentORM(o(a.value, b.value)) as OpResult<TA, TB>;
    if (is(TWeight, b)       ) return operation(onerm ? multiply(onerm, a.value / 100) : MathUtils_roundFloat(a.value / 100, 4), b, o) as OpResult<TA, TB>;
  }
  if(is(TWeight, a)){
    if (isNumber(b)          ) return operation(a, b, o) as OpResult<TA, TB>;
    if (is(TDynamicWeight, b)) return operation(a, onerm ? multiply(onerm, b.value / 100) : MathUtils_roundFloat(b.value / 100, 4), o) as OpResult<TA, TB>;
    if (is(TWeight, b)       ) return operation(a, b, o) as OpResult<TA, TB>;
  }
  throw new Error(`Can't apply operation to ${typeof a} and ${typeof b}`);
}

/**
 * Returns a string explaining the type of a (potentially undefined) quantity.
 * @param value
 */
export function typeOf(
	value: Quantity | undefined,
): "weight" | "percentage" | "number" | "undefined" {
	if (value === undefined) {
		return "undefined";
	}
	if (isNumber(value)) {
		return "number";
	}
	if (is(TDynamicWeight, value)) {
		return "percentage";
	}
	return "weight";
}

/**
 * Converts a weight to the other kind of unit, but also rounds to something generally useful in that weight.
 * @param weight The weight to convert
 * @param toUnit The unit to convert to
 */
export function smartConvert(weight: IWeight, toUnit: IUnit): IWeight {
	if (weight.unit === toUnit) {
		return weight;
	}
	const value = weight.value;
	let converted: number;
	if (weight.unit === "kg") {
		if (value < 15) {
			converted = value * 2;
		} else {
			converted = MathUtils_round(value * 2.25, 5);
		}
	} else {
		if (value < 15) {
			converted = MathUtils_round(value / 2, 0.25);
		} else {
			converted = MathUtils_round(value / 2.25, 2.5);
		}
	}
	return build(converted, toUnit);
}
