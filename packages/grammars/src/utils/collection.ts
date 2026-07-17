import { castAs0, type IndexFrom0 } from "@/utils/indexes.ts";

/**
 * A common filter predicate, removed undefined values
 * @param value the value to check
 */
export function definedOnly<T>(value: T | undefined): value is T {
	return value !== undefined;
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

/**
 * Finds the index of the first item in the collection that is marked as current, or the first item if none are marked as current.
 * @param collection The collection to search.
 */
export function findIndexOfCurrentOrFirst(collection: { isCurrent: boolean }[]): IndexFrom0 {
	return tryFindIndex(collection, item => item.isCurrent) ?? castAs0(0);
}
