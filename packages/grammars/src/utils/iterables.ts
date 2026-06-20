import { partition } from "es-toolkit";

/**
 * Like {@link partition}, but handles generators too
 * @param iterable The collection to split
 * @param predicate The condition to split on
 */
export function splitBy<T, TTruthy extends T>(
  iterable: Iterable<T>,
  predicate: (item: T) => item is TTruthy,
): [TTruthy[], Exclude<T, TTruthy>[]] {
  return partition(Array.from(iterable), predicate);
}
