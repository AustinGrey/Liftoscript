import type { SourcedSyntaxNode } from "@/utils/lezer.ts";

/**
 * Options when querying for children of a syntax node
 */
type QueryOptions<TTypes extends string> = Partial<{
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
  { atLeast, ofType, includeSkipped }: QueryOptions<TTypes> = {},
): Generator<SourcedSyntaxNode> {
  const cur = node.cursor();
  let count = 0;
  if (!cur.firstChild()) {
    if (atLeast !== undefined && atLeast !== 0) {
      throw new SyntaxError(
        `Expected at least${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
      );
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
    yield cur.node;
    count++;
  } while (cur.nextSibling());
  if (atLeast !== undefined && count < atLeast) {
    throw new SyntaxError(
      `Expected at least ${atLeast} children${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
    );
  }
}

/**
 * Gets child, or throws an error if there are no children
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
 * @todo THIS MIGHT BE BROKEN AND NOT DO WHAT YOU EXPECT. CURSORS ARE WEIRD!!!!!!!
 * @yields all descendants of a syntax node in depth-first (pre-order) order.
 * @param node The node to get descendants of
 * @param options
 * @param options.atLeast - If provided, throws an error if fewer than this many matching descendants are found
 * @param options.ofType - If provided, only yields descendants of this type
 * @param options.includeSkipped - If true, includes skipped nodes in the result. Otherwise they are skipped.
 */
export function* queryDescendants<TTypes extends string>(
  node: SourcedSyntaxNode,
  { atLeast, ofType, includeSkipped }: QueryOptions<TTypes> = {},
): Generator<SourcedSyntaxNode> {
  const cur = node.cursor();
  let count = 0;
  // First .next ensures we skip the node itself
  while (cur.next()) {
    const current = cur.node;
    const matchesType = !ofType || current.type.name === ofType;
    const matchesSkipped = includeSkipped || !current.type.isSkipped;
    if (matchesType && matchesSkipped) {
      yield current;
      count++;
    }
  }
  if (atLeast !== undefined && atLeast !== count) {
    throw new SyntaxError(
      `Expected at least ${atLeast} descendant${atLeast === 1 ? "" : "s"}${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
    );
  }
}

/**
 * @todo THIS MIGHT BE BROKEN AND NOT DO WHAT YOU EXPECT. CURSORS ARE WEIRD!!!!!!!
 * Gets the descendant of a node that matches the given type.
 * Throws if there is more than one matching descendant.
 * @param node The node to get the first matching descendant of
 * @param options The query options to use when searching for the descendant
 */
export function getDescendant<TTypes extends string>(
  node: SourcedSyntaxNode,
  options: QueryOptions<TTypes> = {},
): SourcedSyntaxNode {
  const [result, ...rest] = queryDescendants(node, options);
  if (!result) {
    throw new SyntaxError(
      `Expected descendant${options.ofType ? ` of type ${options.ofType}` : ""}, but found none`,
    );
  }
  if (rest.length > 0) {
    throw new SyntaxError(
      `Expected only one descendant${options.ofType ? ` of type ${options.ofType}` : ""}, but found ${rest.length}`,
    );
  }
  return result;
}

/**
 * Gets child, or returns undefined if there are no children
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
