import { isEqual } from "es-toolkit";
import {
	asArray,
	fail,
	type IEither,
	isOneOrMore,
	type Oneⵜ,
	pushZeroⵜ,
	succeed,
	type Zeroⵜ,
} from "@/utils/types.ts";

/**
 * Gets the well-typed keys of an object.
 * @param obj the object to get the keys of
 */
export const ObjectUtils_keys = <T extends {}>(obj: T | undefined): (keyof T)[] =>
	obj ? (Object.keys(obj) as Array<keyof T>) : [];

/**
 * @param obj the object to get the values of
 */
export const ObjectUtils_values = <T extends {}>(obj: T | undefined): Array<T[keyof T]> =>
	obj ? Object.values(obj) : [];

/**
 * Get the entries of an object with well typed keys
 * @param obj
 * @constructor
 */
export const ObjectUtils_entries = <T extends {}>(obj: T | undefined): [keyof T, T[keyof T]][] =>
	obj ? (Object.entries(obj) as Array<[keyof T, T[keyof T]]>) : [];

/**
 * @returns true if the two objects are equal after transforming them with the given function
 * @param a 1st object to compare
 * @param b 2nd object to compare
 * @param transform the function to transform the objects with
 */
export function isEqualAfterTransform<TObj, TTransformed>(
	a: TObj,
	b: TObj,
	transform: (obj: TObj) => TTransformed,
) {
	return isEqual(transform(a), transform(b));
}

/**
 * Attempts to create an object by running a creator for each property.
 * Every creator is evaluated. Creators may fail with a single error or an
 * array of errors; all failures are flattened into one array on the result
 * so callers can surface complete feedback.
 *
 * Each creator receives the object built so far (properties that succeeded
 * earlier in enumeration order). Failed properties are omitted from that
 * partial, so dependents should treat prior fields as optional.
 *
 * @param creators An object mapping each property to a function that attempts to create its value
 * @param overallCheck Additional checks you can run which, if it produces errors, will fail the object creation still
 * @returns The created object on success, or every property creation error that occurred
 *
 * @example
 * ```ts
 * const result = attemptCreateObject({
 *   weight: () => parseWeight(argWeight),
 *   attempts: (soFar) => parseAttempts(argAttempts, soFar.weight),
 * });
 * if (!result.success) {
 *   return { success: false, error: result.error };
 * }
 * // result.data is { weight: ..., attempts: ... }
 * ```
 */
export function attemptCreateObject<T extends object, E>(
	creators: {
		[K in keyof T]: (soFar: Partial<T>) => IEither<T[K], Oneⵜ<E>>;
	},
	overallCheck?: () => Oneⵜ<E> | undefined,
): IEither<T, Oneⵜ<E>> {
	const data = {} as T;
	const errors: E[] = [];
	for (const key of ObjectUtils_keys(creators)) {
		const created = creators[key](data);
		if (!created.success) {
			pushZeroⵜ(errors, created.error);
			continue;
		}
		data[key] = created.data;
	}
	pushZeroⵜ(errors, overallCheck?.());

	return isOneOrMore(errors) ? fail(errors) : succeed(data);
}
