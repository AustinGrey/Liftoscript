/*
Values which represent weight. Like lbs, kg, etc.
 */

import { z } from "zod";
import { is, isNumber, isRealNumber } from "@/utils/types.ts";

import type { Quantity } from "@/logic/types.ts";
import {
  MathUtils_round,
  MathUtils_roundFloat,
  MathUtils_roundTo000005,
  MathUtils_roundTo005,
  n,
} from "@/utils/math.ts";
import { CollectionUtils_sort } from "@/utils/collection.ts";
import { Exercise_defaultRounding } from "@/models/exercise.ts";
import {
  Equipment_getEquipmentDataForExerciseType,
  Equipment_smallestPlate,
} from "@/models/equipment.ts";
import type { IPlate } from "@/common-types.ts";
import type { IExerciseType } from "@/exercises";
import type { ISettings } from "@/user-settings";
import {
  type TaggedTemplateHandler,
  taggedTemplateToString,
} from "@/utils/string.ts";

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
type TComparison = (left: Quantity, right: Quantity) => boolean;

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
  const key = `${value}_${unit}`;
  return prebuiltWeights[key] != null
    ? prebuiltWeights[key]
    : (prebuiltWeights[key] = {
        value: typeof value === "string" ? parseFloat(value) : value,
        unit,
      });
}

export function convertTo(weight: IWeight, unit: IUnit): IWeight;
export function convertTo(
  weight: IDynamicWeight,
  unit: "%" | IUnit,
): IDynamicWeight;
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
 * If the units cannot be normalized, false is returned.
 * @TODO is that really valid? Should we return some error result to bubble up instead?
 *
 * @param left The left value to compare
 * @param right The right value to compare
 * @param o The comparison function to perform once the units are converted.
 */
function comparison(
  left: IWeight | number | IDynamicWeight,
  right: IWeight | number | IDynamicWeight,
  o: (a: number, b: number) => boolean,
): boolean {
  if (isNumber(left)) {
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
    const aWeight = onerm
      ? multiply(onerm, a.value / 100)
      : MathUtils_roundFloat(a.value / 100, 4);
    return operation(aWeight, b, o);
  }

  if (is(TWeight, a) && isNumber(b)) {
    return operation(a, b, o);
  }
  if (is(TWeight, a) && is(TDynamicWeight, b)) {
    const bWeight = onerm
      ? multiply(onerm, b.value / 100)
      : MathUtils_roundFloat(b.value / 100, 4);
    return operation(a, bWeight, o);
  }
  if (is(TWeight, a) && is(TWeight, b)) {
    return operation(a, b, o);
  }

  throw new Error(`Can't apply operation to ${a} and ${b}`);
}

export function increment(
  weight: IWeight,
  settings: ISettings,
  exerciseType?: IExerciseType,
): IWeight {
  const equipmentData = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  if (equipmentData) {
    const unit = equipmentData.unit ?? weight.unit;
    const roundWeight = round(weight, settings, unit, exerciseType);
    if (equipmentData.isFixed) {
      const items = CollectionUtils_sort(
        equipmentData.fixed.filter((e) => e.unit === unit),
        (a, b) => compare(a, b),
      );
      const item = items.find((i) => gt(i, roundWeight));
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
      } while (
        attempt < 20 &&
        eq(round(newWeight, settings, unit, exerciseType), roundWeight)
      );
      return newWeight;
    }
  } else {
    const roundWeight = round(weight, settings, weight.unit, exerciseType);
    const rounding = exerciseType
      ? Exercise_defaultRounding(exerciseType, settings)
      : 1;
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
      const items = CollectionUtils_sort(
        equipmentData.fixed.filter((e) => e.unit === unit),
        (a, b) => compareReverse(a, b),
      );
      const item = items.find((i) => lt(i, roundWeight));
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
    const rounding = exerciseType
      ? Exercise_defaultRounding(exerciseType, settings)
      : 1;
    return build(roundWeight.value - rounding, roundWeight.unit);
  }
}

export function round(
  weight: IWeight,
  settings: ISettings,
  unit: IUnit,
  exerciseType?: IExerciseType,
): IWeight {
  if (exerciseType == null) {
    return roundTo005(weight);
  }
  return calculatePlates(weight, settings, unit, exerciseType).totalWeight;
}

export function roundTo005(weight: IWeight): IWeight {
  return build(MathUtils_roundTo005(weight.value), weight.unit);
}

export function roundTo000005(weight: IWeight): IWeight {
  return build(MathUtils_roundTo000005(weight.value), weight.unit);
}

export function calculatePlates(
  allWeight: IWeight,
  settings: ISettings,
  units: IUnit,
  exerciseType: IExerciseType,
): { plates: IPlate[]; platesWeight: IWeight; totalWeight: IWeight } {
  const equipmentData = Equipment_getEquipmentDataForExerciseType(
    settings,
    exerciseType,
  );
  if (equipmentData == null) {
    const rounding = Exercise_defaultRounding(exerciseType, settings);
    allWeight = build(
      MathUtils_round(allWeight.value, rounding),
      allWeight.unit,
    );
    return { plates: [], platesWeight: allWeight, totalWeight: allWeight };
  }

  const absAllWeight = abs(allWeight);
  const inverted = allWeight.value < 0;
  if (equipmentData.isFixed) {
    const fixed = CollectionUtils_sort(
      equipmentData.fixed.filter(
        (w) => w.unit === (equipmentData.unit ?? units),
      ),
      (a, b) => b.value - a.value,
    );
    const weight =
      fixed.find((w) => lte(w, absAllWeight)) ||
      fixed[fixed.length - 1] ||
      absAllWeight;
    let roundedWeight = roundTo005(weight);
    roundedWeight = inverted ? invert(roundedWeight) : roundedWeight;
    return {
      plates: [],
      platesWeight: roundedWeight,
      totalWeight: roundedWeight,
    };
  }
  const availablePlatesArr = equipmentData.plates.filter(
    (p) => p.weight.unit === units,
  );
  const barWeight =
    equipmentData.useBodyweightForBar && settings.currentBodyweight
      ? settings.currentBodyweight
      : equipmentData.bar[units];
  const multiplier = equipmentData.multiplier || 1;
  const isAssisting = equipmentData.isAssisting || false;
  const weight = roundTo000005(subtract(absAllWeight, barWeight));
  const availablePlates: IPlate[] = JSON.parse(
    JSON.stringify(availablePlatesArr),
  );
  availablePlates.sort((a, b) => compareReverse(a.weight, b.weight));
  const plates: IPlate[] = calculatePlatesInternalFast(
    weight,
    availablePlates,
    multiplier,
    isAssisting,
  );
  const total = plates.reduce(
    (memo, plate) => {
      const weightToAdd = multiply(plate.weight, plate.num);
      return isAssisting ? subtract(memo, weightToAdd) : add(memo, weightToAdd);
    },
    build(0, allWeight.unit),
  );
  const totalWeight = roundTo000005(
    inverted ? invert(add(total, barWeight)) : add(total, barWeight),
  );
  const thePlatesWeight = inverted ? invert(total) : total;
  return { plates, platesWeight: thePlatesWeight, totalWeight };
}

export function abs(weight: IWeight): IWeight {
  return build(Math.abs(weight.value), weight.unit);
}

export function invert(weight: IWeight): IWeight {
  return build(-weight.value, weight.unit);
}

export function compare(a: IWeight, b: IWeight): number {
  return a.value - convertTo(b, a.unit).value;
}

export function compareReverse(a: IWeight, b: IWeight): number {
  return convertTo(b, a.unit).value - a.value;
}

function calculatePlatesInternalFast(
  weight: IWeight,
  availablePlates: IPlate[],
  multiplier: number,
  isAssisting: boolean,
): IPlate[] {
  const targetValue = isAssisting ? -weight.value : weight.value;
  if (targetValue <= 0) {
    return [];
  }

  const plateTypes: {
    weight: IWeight;
    unitWeight: number;
    maxUnits: number;
  }[] = [];
  for (const p of availablePlates) {
    if (p.num >= multiplier) {
      plateTypes.push({
        weight: p.weight,
        unitWeight: p.weight.value * multiplier,
        maxUnits: Math.floor(p.num / multiplier),
      });
    }
  }
  if (plateTypes.length === 0) {
    return [];
  }

  // Convert to integers for exact arithmetic
  const allValues = [targetValue, ...plateTypes.map((p) => p.unitWeight)];
  let maxDecimals = 0;
  for (const v of allValues) {
    const s = v.toString();
    const dot = s.indexOf(".");
    if (dot >= 0) {
      maxDecimals = Math.max(maxDecimals, s.length - dot - 1);
    }
  }
  const precision = Math.pow(10, Math.min(maxDecimals, 6));
  const intTarget = Math.round(targetValue * precision);
  const intWeights = plateTypes.map((p) =>
    Math.round(p.unitWeight * precision),
  );

  // Max contribution from plates at index i and beyond (for pruning)
  const maxFrom = new Array(plateTypes.length + 1).fill(0);
  for (let i = plateTypes.length - 1; i >= 0; i--) {
    maxFrom[i] = maxFrom[i + 1] + intWeights[i] * plateTypes[i].maxUnits;
  }

  const best = new Array(plateTypes.length).fill(0);
  const current = new Array(plateTypes.length).fill(0);
  let bestRemaining = intTarget + 1;
  let iterations = 0;

  function search(index: number, remaining: number): void {
    if (bestRemaining === 0 || iterations >= 10000) {
      return;
    }
    if (remaining === 0 || index >= plateTypes.length) {
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        for (let i = 0; i < index; i++) {
          best[i] = current[i];
        }
        for (let i = index; i < plateTypes.length; i++) {
          best[i] = 0;
        }
      }
      return;
    }

    iterations += 1;
    const w = intWeights[index];
    const maxCount = Math.min(
      plateTypes[index].maxUnits,
      w > 0 ? Math.floor(remaining / w) : 0,
    );

    for (let count = maxCount; count >= 0; count--) {
      const newRemaining = remaining - count * w;
      if (newRemaining - maxFrom[index + 1] >= bestRemaining) {
        continue;
      }
      current[index] = count;
      search(index + 1, newRemaining);
      if (bestRemaining === 0) {
        return;
      }
    }
  }

  search(0, intTarget);

  const plates: IPlate[] = [];
  for (let i = 0; i < plateTypes.length; i++) {
    if (best[i] > 0) {
      plates.push({ weight: plateTypes[i].weight, num: best[i] * multiplier });
    }
  }
  return plates;
}

export function roundConvertTo(
  weight: IWeight,
  settings: ISettings,
  unit: IUnit,
  exerciseType?: IExerciseType,
): IWeight {
  return round(convertTo(weight, unit), settings, unit, exerciseType);
}

export function getTrainingMax(
  weight: IWeight,
  reps: number,
  settings: ISettings,
): IWeight {
  return round(
    multiply(getOneRepMax(weight, reps), 0.9),
    settings,
    weight.unit,
  );
}

export function getOneRepMax(
  weight: IWeight,
  reps: number,
  rpe?: number,
): IWeight {
  if (reps === 0) {
    return build(0, weight.unit);
  } else if (reps === 1) {
    return weight;
  } else {
    return roundTo005(divide(weight, rpeMultiplier(reps, rpe ?? 10)));
  }
}

export function rpeMultiplier(reps: number, rpe: number): number {
  if (reps === 1 && rpe === 10) {
    return 1;
  }
  reps = Math.max(Math.min(reps, 24), 1);
  rpe = Math.max(Math.min(rpe, 10), 1);

  const x = 10.0 - rpe + (reps - 1);
  if (x >= 16) {
    return 0.5;
  }
  // The formula is taken from
  // https://gitlab.com/openpowerlifting/plsource/-/blob/ba5194be6daa08d082bb1b7959d6f47b82e7802c/static/rpe-calc/index.html#L224
  const intersection = 2.92;
  if (x <= intersection) {
    const a = 0.347619;
    const b = -4.60714;
    const c = 99.9667;
    return (a * x * x + b * x + c) / 100;
  } else {
    const m = -2.64249;
    const b = 97.0955;
    return (m * x + b) / 100;
  }
}

export function convertToWeight(
  onerm: IWeight,
  value: Quantity,
  unit: IUnit,
): IWeight {
  if (isNumber(value)) {
    return build(value, unit);
  } else if (is(TDynamicWeight, value)) {
    return convertTo(
      multiply(onerm, MathUtils_roundFloat(value.value / 100, 4)),
      unit,
    );
  } else {
    return value;
  }
}
/**
 * Parses template literal as a number with a unit, if possible
 */
const asRealNumberWithUnit: TaggedTemplateHandler<{
  amount: number;
  unit: string;
  raw: string;
}> = (s, ...v) => {
  const raw = taggedTemplateToString(s, v);
  // Flatten everything into a single string before splitting the number away from the unit
  const rawString = raw.replaceAll(/\s+/g, "").split(
    // Finds the 0 width boundaries between the number portion, and the unit portion, splitting on that.
    /(?<=[-0-9.])(?=[^-0-9.])/,
  );
  const [amountRaw, unit, ...rest] = rawString;
  const amount = Number(amountRaw);
  if (rest.length || !isRealNumber(amount)) {
    throw new Error(
      `${rawString} can not be interpreted as a single amount with a unit`,
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
export const dw: TaggedTemplateHandler<IDynamicWeight> = (s, ...v) => {
  const { amount, unit, raw } = asRealNumberWithUnit(s, v);
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
export const w: TaggedTemplateHandler<IWeight> = (s, ...v) => {
  const { amount, unit, raw } = asRealNumberWithUnit(s, v);
  if (unit !== "kg" && unit !== "lb") {
    throw new Error(`${raw} is not a valid IWeight`);
  }
  return {
    value: amount,
    unit,
  };
};

/**
 * Converts a quantity to text in a human-readable format
 * @param quantity The value to print
 */
export function print(quantity: Quantity): string {
  if (typeof quantity === "number") {
    return `${n(quantity)}`;
  } else {
    return `${n(quantity.value)}${quantity.unit}`;
  }
}
