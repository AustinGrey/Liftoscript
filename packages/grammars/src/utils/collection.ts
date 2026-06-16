import type { ConditionalPick } from "type-fest";

/**
 * @deprecated use filter(definedOnly), a pattern which supports generators as well
 * @param arr the array to filter
 */
export const filterUndefined = <T>(arr: (T | undefined)[]): T[] =>
  arr.filter((i) => i !== undefined);

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
  return arr.toSorted(
    (a, b) => (Number(a[key]) - Number(b[key])) * (isReverse ? -1 : 1),
  );
}
