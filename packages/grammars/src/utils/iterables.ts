import { partition } from "es-toolkit";
import { type IndexFrom0, next, ZERO } from "@/utils/indexes.ts";

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

/**
 * Loops x number of times, generating a value for every integer in the range.
 * @param numberOfLoops The number of times to loop
 * @param generator The method that produces a loop's result value. Receives the iteration index as an argument
 */
export function* generateRange<T>(
	numberOfLoops: number,
	generator: (index: IndexFrom0) => T,
): Generator<T> {
	for (let i = ZERO; i < numberOfLoops; i = next(i)) {
		yield generator(i);
	}
}
