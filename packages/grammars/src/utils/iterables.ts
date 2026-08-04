import { partition } from "es-toolkit";
import { type IndexFrom0, entriesOf, next, ZERO } from "@/utils/indexes.ts";

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

type NestedForReturn<TItem, TContext> = Generator<{
	item: TItem;
	context: TContext;
	/**
	 * Flat 0-based index of the leaf's immediate parent across the whole traversal.
	 * Advances once per parent, including parents whose unwrapped children are empty.
	 * e.g. for weeks → days → exercises, this is the program-wide day index.
	 */
	globalIndex: IndexFrom0;
}>;
/**
 * An unwrapping method
 */
type UW<A, B> = (a: A) => readonly B[];

/**
 * When traversing deeply nested elements, this simplifies the many for loop boiler plates into a single
 * less nested call. Generating the end result elements, with the ancestor loop information.
 * @param outer The top level iterable
 * @param unwrappers The series of unwrappers to get from the top level to the leaf elements
 * @returns the leaf element, the context it's in, and `globalIndex` (flat index of the leaf's parent).
 *    You'll generally want to destructure the context to get just the items you need
 *    e.g. const [week,, day,, exercise, exerciseIndex] = context;
 */
export function nestedFor<A, B>(
	outer: readonly A[],
	unwrappers: [UW<A, B>],
): NestedForReturn<B, [A, IndexFrom0, B, IndexFrom0]>;
export function nestedFor<A, B, C>(
	outer: readonly A[],
	unwrappers: [UW<A, B>, UW<B, C>],
): NestedForReturn<C, [A, IndexFrom0, B, IndexFrom0, C, IndexFrom0]>;
export function nestedFor<A, B, C, D>(
	outer: readonly A[],
	unwrappers: [UW<A, B>, UW<B, C>, UW<C, D>],
): NestedForReturn<D, [A, IndexFrom0, B, IndexFrom0, C, IndexFrom0, D, IndexFrom0]>;
export function nestedFor<A, B, C, D, E>(
	outer: readonly A[],
	unwrappers: [UW<A, B>, UW<B, C>, UW<C, D>, UW<D, E>],
): NestedForReturn<E, [A, IndexFrom0, B, IndexFrom0, C, IndexFrom0, D, IndexFrom0, E, IndexFrom0]>;
export function* nestedFor(
	outer: readonly any[],
	unwrappers: ((u: any) => readonly any[])[],
): Generator<any> {
	const lastDepth = unwrappers.length - 1;
	let globalIndex = ZERO;

	function* walk(items: readonly any[], depth: number, context: any[]): Generator<any> {
		for (const [index, node] of entriesOf(items)) {
			const children = unwrappers[depth](node);
			const contextWithNode = [...context, node, index];

			if (depth === lastDepth) {
				const parentGlobalIndex = globalIndex;
				globalIndex = next(globalIndex);
				for (const [childIndex, item] of entriesOf(children)) {
					yield {
						item,
						context: [...contextWithNode, item, childIndex],
						globalIndex: parentGlobalIndex,
					};
				}
			} else {
				yield* walk(children, depth + 1, contextWithNode);
			}
		}
	}

	yield* walk(outer, 0, []);
}
