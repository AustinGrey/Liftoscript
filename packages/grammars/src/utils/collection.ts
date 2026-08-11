import { castAs0, type IndexFrom0 } from "@/utils/indexes.ts";
import { isEqual } from "es-toolkit";

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
	arr: T[] | undefined,
	predicate: (value: T) => boolean,
): IndexFrom0 | undefined {
	const result = arr?.findIndex(predicate);
	return result === -1 ? undefined : castAs0(result);
}

/**
 * Finds the index of the first item in the collection that is marked as current, or the first item if none are marked as current.
 * @param collection The collection to search.
 */
export function findIndexOfCurrentOrFirst(collection: { isCurrent: boolean }[]): IndexFrom0 {
	return tryFindIndex(collection, item => item.isCurrent) ?? castAs0(0);
}

/**
 * Groups consecutive objects by a returned key. If you don't care about consecutiveness, use 'groupBy' from estoolkit
 *
 * E.g. `['a', 'a', 'b', 'a']` with a key function `i=>i.toUpperCase()`, will group as
 * ```
 * [
 * 	['A', ['a', 'a']],
 * 	['B', ['b']],
 * 	['A', ['a']],
 * ]
 * ```
 * @param items The items to group
 * @param keyOf Produces the comparison key for a given item. Keys are compared by likeness, so object and array keys are useful. Consider using 'pick' if you want to consider only part of an object for equality
 */
export function groupConsecutiveBy<T, K>(
	items: readonly T[],
	keyOf: (item: T) => K,
): { key: K; groupedElements: [T, ...T[]] }[] {
	const groups: { key: K; groupedElements: [T, ...T[]] }[] = [];
	for (const item of items) {
		const key = keyOf(item);
		const last = groups[groups.length - 1];
		if (last && isEqual(last.key, key)) last.groupedElements.push(item);
		else groups.push({ key, groupedElements: [item] });
	}
	return groups;
}

export function throwFirstIfExists(source: Iterable<unknown>): void {
	const [first] = source;
	if (first) throw first;
}
