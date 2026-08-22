import type { SetRequired } from "type-fest";

/**
 * Creates a filter predicate which only allows objects where the property is defined
 * @example
 * ```TypeScript
 *  [{a: 1}, {b: 2}].filter(wherePropertyIsDefined("a"));
 *  // [{a: 1}]
 * ```
 * @param property The property to check will be defined.
 */
export function wherePropertyIsDefined<T extends {}, K extends keyof T>(
	property: K,
): (obj: T) => obj is T & SetRequired<T, K> {
	return (obj): obj is T & SetRequired<T, K> => obj[property] != null;
}
