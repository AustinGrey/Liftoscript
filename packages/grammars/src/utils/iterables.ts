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
	 * Index of the leaf's immediate parent across the whole traversal.
	 * Advances once per parent, including parents whose unwrapped children are empty.
	 * e.g. If traversing [[[1,2,3,4],[],[14]],[]] the globalParentIndex of 14 is 2, because it's parent is the 3rd array. While for 4 it's 0, since it's in the first array
	 *
	 */
	globalParentIndex: IndexFrom0;
}>;
/**
 * An unwrapping method. Returning `undefined` is treated as an empty array.
 * Or an object with `unwrap` plus `extract`, to compute a value once per item at that level
 * and include it as the third element of that level's context tuple.
 */
type UW<A, B, E = never> =
	| ((a: A) => readonly B[] | undefined)
	| { unwrap: (a: A) => readonly B[] | undefined; extract: (item: B) => E };

/** Context entry for one nesting level. Includes extracted value when that level's unwrapper had `extract`. */
type CtxEntry<T, E = never> = [E] extends [never] ? [T, IndexFrom0] : [T, IndexFrom0, E];

function resolveUW(uw: UW<any, any, any>): {
	unwrap: (a: any) => readonly any[] | undefined;
	extract?: (item: any) => any;
} {
	return typeof uw === "function" ? { unwrap: uw } : uw;
}

function contextEntry(item: any, index: IndexFrom0, extract?: (item: any) => any) {
	return extract ? [item, index, extract(item)] : [item, index];
}

/**
 * When traversing deeply nested elements, this simplifies the many for loop boiler plates into a single
 * less nested call. Generating the end result elements, with the ancestor loop information.
 * @param outer The top level iterable
 * @param unwrappers The series of unwrappers to get from the top level to the leaf elements.
 *    Each may be a function, or `{ unwrap, extract }` to also compute a per-item value for that level.
 *    Unwrap may return `undefined`, which is treated as an empty array.
 * @returns the leaf element, the context it's in, and `globalParentIndex` (flat index of the leaf's parent).
 *    Context is an array of `[item, index]` or `[item, index, extracted]` tuples, one per nesting level.
 *    e.g. const [[week], [day], [exercise, exerciseIndex, currentVariation]] = context;
 */
export function nestedFor<A, B, BE = never>(
	outer: readonly A[],
	unwrappers: [UW<A, B, BE>],
): NestedForReturn<B, [[A, IndexFrom0], CtxEntry<B, BE>]>;
export function nestedFor<A, B, C, BE = never, CE = never>(
	outer: readonly A[],
	unwrappers: [UW<A, B, BE>, UW<B, C, CE>],
): NestedForReturn<C, [[A, IndexFrom0], CtxEntry<B, BE>, CtxEntry<C, CE>]>;
export function nestedFor<A, B, C, D, BE = never, CE = never, DE = never>(
	outer: readonly A[],
	unwrappers: [UW<A, B, BE>, UW<B, C, CE>, UW<C, D, DE>],
): NestedForReturn<D, [[A, IndexFrom0], CtxEntry<B, BE>, CtxEntry<C, CE>, CtxEntry<D, DE>]>;
export function nestedFor<A, B, C, D, E, BE = never, CE = never, DE = never, EE = never>(
	outer: readonly A[],
	unwrappers: [UW<A, B, BE>, UW<B, C, CE>, UW<C, D, DE>, UW<D, E, EE>],
): NestedForReturn<
	E,
	[[A, IndexFrom0], CtxEntry<B, BE>, CtxEntry<C, CE>, CtxEntry<D, DE>, CtxEntry<E, EE>]
>;
export function* nestedFor(
	outer: readonly any[],
	unwrappers: UW<any, any, any>[],
): Generator<any> {
	const lastDepth = unwrappers.length - 1;
	let globalParentIndex = ZERO;
	const resolved = unwrappers.map(resolveUW);

	function* walk(
		items: readonly any[] | undefined,
		depth: number,
		context: any[],
		extractFromParent?: (item: any) => any,
	): Generator<any> {
		for (const [index, node] of entriesOf(items)) {
			const contextWithNode = [...context, contextEntry(node, index, extractFromParent)];
			const { unwrap, extract } = resolved[depth];
			const children = unwrap(node);

			if (depth === lastDepth) {
				const parentGlobalIndex = globalParentIndex;
				globalParentIndex = next(globalParentIndex);
				for (const [childIndex, item] of entriesOf(children)) {
					yield {
						item,
						context: [...contextWithNode, contextEntry(item, childIndex, extract)],
						globalParentIndex: parentGlobalIndex,
					};
				}
			} else {
				yield* walk(children, depth + 1, contextWithNode, extract);
			}
		}
	}

	yield* walk(outer, 0, []);
}
