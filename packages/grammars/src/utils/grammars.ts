import { nodeError, SourcedSyntaxError, type SourcedSyntaxNode } from "@/utils/lezer.ts";
import { throwError } from "@/utils/errors.ts";
import { isNumber } from "@/utils/types.ts";

/**
 * Options when querying for children of a syntax node
 */
export type QueryOptions<TTypes extends string> = Partial<{
	/**
	 * If provided, throws an error if the node has fewer than this many children of the given type
	 */
	atLeast: number;
	/**
	 * If provided, skips all children not of this type
	 */
	ofType: TTypes;
	/**
	 * If true, includes skipped nodes in the result. Otherwise they are skipped.
	 * Defaults to false.
	 */
	includeSkipped: boolean;
}>;

/**
 * @yields all children of a syntax node, optionally restricting by type, and potentially returning nothing
 * @param node The node to get the children of
 * @param options
 * @param options.atLeast - If provided, throws an error if the node has fewer than this many children
 * @param options.ofType - If provided, only yields children of this type, and atLeast ensures that there are at least that number of children of this type
 */
export function* queryChildren<TTypes extends string>(
	node: SourcedSyntaxNode,
	options?: QueryOptions<TTypes>,
): Generator<SourcedSyntaxNode> {
	yield* tryQueryChildren(node, options).map((r) =>
		r instanceof SourcedSyntaxError ? throwError(r) : r,
	);
}

export type TQueryResult<
	TNode extends SourcedSyntaxNode,
	TQueryOptions extends QueryOptions<string>,
> = TQueryOptions extends undefined
	? TNode
	: TQueryOptions["atLeast"] extends number
		? SourcedSyntaxError | TNode
		: TNode;

/**
 * @yields all children of a syntax node, optionally restricting by type. If atLeast is provided, it may yield errors, but the types will warn you if so.
 * @param node The node to get the children of
 * @param options
 * @param options.atLeast - If provided, yields an error if the node has fewer than this many children
 * @param options.ofType - If provided, only yields children of this type, and atLeast ensures that there are at least that number of children of this type
 */
export function* tryQueryChildren<TTypes extends string, TOptions extends QueryOptions<TTypes>>(
	node: SourcedSyntaxNode,
	options?: TOptions,
): Generator<TQueryResult<SourcedSyntaxNode, TOptions>> {
	/*TS can't infer conditional type, so casting is required at every return */
	type TResult = TQueryResult<SourcedSyntaxNode, TOptions>;
	const { atLeast, ofType, includeSkipped } = options ?? {};
	const cur = node.cursor();
	let count = 0;
	if (!cur.firstChild()) {
		if (isNumber(atLeast) && atLeast !== 0) {
			yield nodeError(
				node,
				`Expected at least${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
			) as TResult;
			return;
		}
		return;
	}
	do {
		if (ofType && cur.node.type.name !== ofType) {
			continue;
		}
		if (cur.node.type.isSkipped && !includeSkipped) {
			continue;
		}
		yield cur.node as TResult;
		count++;
	} while (cur.nextSibling());
	if (isNumber(atLeast) && count < atLeast) {
		yield nodeError(
			node,
			`Expected at least ${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
		) as TResult;
		return;
	}
}

/**
 * Gets child, or throws an error if there are no (matching) children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function getChild<TTypes extends string>(
	node: SourcedSyntaxNode,
	options: QueryOptions<TTypes> = {},
): SourcedSyntaxNode {
	const [result] = queryChildren(node, { ...options, atLeast: 1 });
	return result;
}

/**
 * Gets child, or returns undefined if there are no (matching) children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function queryChild<TTypes extends string>(
	node: SourcedSyntaxNode,
	options: QueryOptions<TTypes> = {},
): SourcedSyntaxNode | undefined {
	const [result] = queryChildren(node, options);
	return result;
}

/**
 * Gets all nodes in the tree of the node that is passed
 * @param node The node that is the root of the tree
 * @param where The filter function to use
 */
export function* queryTree(
	node: SourcedSyntaxNode,
	where?: (node: SourcedSyntaxNode) => boolean,
): Generator<SourcedSyntaxNode> {
	const cursor = node.cursor();
	do {
		if (!where || where(cursor.node)) {
			yield cursor.node;
		}
	} while (cursor.next());
}
