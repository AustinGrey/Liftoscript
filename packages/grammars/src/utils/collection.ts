import type { ConditionalPick } from "type-fest";
import { castAs0, type IndexFrom0 } from "@/utils/indexes.ts";

/**
 * A common filter predicate, removed undefined values
 * @param value the value to check
 */
export function definedOnly<T>(value: T | undefined): value is T {
	return value !== undefined;
}

/**
 * Sorts an array of objects by the given numeric key.
 * @param arr The array to sort.
 * @param key The key to sort by.
 * @param isReverse Whether to sort in reverse order.
 */
export function CollectionUtils_sortBy<
	T extends {},
	K extends keyof ConditionalPick<T, number> & keyof T,
>(arr: T[], key: K, isReverse?: boolean): T[] {
	return arr.toSorted((a, b) => (Number(a[key]) - Number(b[key])) * (isReverse ? -1 : 1));
}

/**
 * A typesafe version of findIndex
 * @param arr the collection to search
 * @param predicate the predicate to check
 */
export function tryFindIndex<T>(
	arr: T[],
	predicate: (value: T) => boolean,
): IndexFrom0 | undefined {
	const result = arr.findIndex(predicate);
	return result === -1 ? undefined : castAs0(result);
}
