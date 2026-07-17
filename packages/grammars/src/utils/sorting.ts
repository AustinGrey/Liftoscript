/**
 * A predicate which can be passed to Array.sort/toSorted
 */
export type SortingPredicate<T> = (a: T, b: T) => number;

/**
 * Array.sort/toSorted predicate which gets a property from the objects to sort by
 */
export function by<T, P>(extract: (o: T) => P, sorter: SortingPredicate<P>): SortingPredicate<T> {
	return (a: T, b: T) => sorter(extract(a), extract(b));
}

export const asNumericAscending: SortingPredicate<number> = (a, b) => a - b;
export const asNumericDescending: SortingPredicate<number> = (a, b) => b - a;
