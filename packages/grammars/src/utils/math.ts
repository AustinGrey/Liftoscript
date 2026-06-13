import { isInteger } from "es-toolkit/compat";

export function MathUtils_round(value: number, to: number): number {
  return MathUtils_roundFloat(Math.round(value / to) * to, 4);
}

export function MathUtils_roundTo005(value: number): number {
  return MathUtils_round(value, 0.05);
}

export function MathUtils_roundTo0005(value: number): number {
  return MathUtils_round(value, 0.005);
}

export function MathUtils_roundTo000005(value: number): number {
  return MathUtils_round(value, 0.00005);
}

export function MathUtils_roundFloat(value: number, precision: number): number {
  if (typeof value !== "number" || isNaN(value)) {
    return 0;
  }
  return +value.toFixed(precision);
}

/**
 * Determines what the final result of an assignment expression will be
 * @TODO this name is awful. Rename to getAssignmentResult
 * @param a left side
 * @param b right side
 * @param opr Which assignment operator is being applied
 */
export function MathUtils_applyOp(
  a: number,
  b: number,
  opr: "+=" | "-=" | "*=" | "/=" | "=",
): number {
  if (opr === "=") {
    return b;
  } else if (opr === "+=") {
    return a + b;
  } else if (opr === "-=") {
    return a - b;
  } else if (opr === "*=") {
    return MathUtils_roundTo005(a * b);
  } else {
    return MathUtils_roundTo005(a / b);
  }
}

export function MathUtils_clamp(
  value: number,
  min?: number,
  max?: number,
): number {
  if (min != null && max != null) {
    return Math.max(min, Math.min(max, value));
  } else if (min != null) {
    return Math.max(min, value);
  } else if (max != null) {
    return Math.min(max, value);
  } else {
    return value;
  }
}

export function n(value: number, precision: number = 2): string {
  return `${MathUtils_roundFloat(value, precision)}`;
}

/**
 * @returns the string as a base 10 integer, or undefined if it parsed to a non real number like NaN or infinity
 * @param text The string to convert
 */
export function asBase10Int(text?: string): number | undefined {
  if (!text) return undefined;
  const parsed = parseInt(text, 10);
  return isInteger(parsed) ? undefined : parsed;
}
