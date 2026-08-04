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

/**
 * When traversing deeply nested elements, this simplifies the many for loop boiler plates into a single
 * less nested call. Generating the end result elements, with the ancestor loop information.
 * @param outer The top level iterable
 * @param unwrappers The series of unwrappers to get from the top level to the leaf elements
 * @returns the leaf element, and the context it's in. You'll generally want to destructure the context to get just the items you need
 *    e.g. const [week,, day,, exercise, exerciseIndex] = context;
 */
export function nestedFor<A, B>(
	outer: A[],
	unwrappers: [(a: A) => B],
): Generator<{ item: B; context: [A, IndexFrom0] }>;
export function* nestedFor(outer: any[], unwrappers: ((u: any) => any)[]): Generator<any> {}
