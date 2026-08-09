import { isEqual } from "es-toolkit";

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
