import { z } from "zod";

export type IEither<T, U> = { success: true; data: T } | { success: false; error: U };

/**
 * Creates a successful {@link IEither}.
 * @param data The successful value
 */
export function succeed<T>(data: T): { success: true; data: T } {
	return { success: true, data };
}

/**
 * Creates a failed {@link IEither}.
 * @param error The error value
 */
export function fail<U>(error: U): { success: false; error: U } {
	return { success: false, error };
}

export type IArrayElement<ArrayType extends readonly unknown[]> = ArrayType[number];
export type INonNullObject<T> = {
	[K in keyof T as T[K] extends null ? never : K]: T[K];
};
/**
 * Record is normally closed. If you say something is a Record<string, number> what you are saying
 * is that there is a value for every possible string. Which can't be true.
 *
 * An open record is shorthand that not all keys will have values.
 *
 * The key is defined second since it's almost always just a string, and we want to allow leaving it out for code simplicity.
 */
export type OpenRecord<TVal, TKey extends string | number | symbol = string> = Partial<
	Record<TKey, TVal>
>;

export function isNumber(value: unknown): value is number {
	return typeof value === "number";
}
/**
 * @deprecated This should not be a typeguard, instead this should accept a number so that others can typeguard to number first. Otherwise it's use as a typeguard could cause missing cases in switches etc.
 */
export function isRealNumber(value: unknown): value is number {
	return typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value);
}
export function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

/**
 * Typeguard any Zod schema
 * @param schema The schema to check against
 * @param value The value to check
 */
export function is<TSchema extends z.ZodTypeAny>(
	schema: TSchema,
	value: unknown,
): value is z.infer<TSchema> {
	return schema.safeParse(value).success;
}

export function isOneOf<TTarget, const TGuard extends TTarget>(
	text: TTarget,
	...options: TGuard[]
): text is TGuard {
	return options.includes(text as TGuard);
}

/**
 * Swaps keys for values in a record
 */
export type Swap<T extends Record<string, string | number | symbol>> = {
	[K in keyof T as T[K]]: K;
};

export function isEnumValue<T extends string | number | symbol>(
	enumObject: Record<string, T>,
	value: unknown,
): value is T {
	return Object.values(enumObject).includes(value as T);
}

/**
 * An array that is not empty.
 * Oddly enough, [T, ...T[]] is insufficient if you build the one or more array by appending
 * a known element to a possibly empty array, so we have to explicitly state we are okay if the known element is
 * either first or last
 */
export type OneOrMore<T> = [T, ...T[]] | [...T[], T];
export function isOneOrMore<T>(arr: T[]): arr is OneOrMore<T> {
	return arr.length > 0;
}
