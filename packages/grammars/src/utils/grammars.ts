import type { SyntaxNode } from "@lezer/common";

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
  node: SyntaxNode,
  { atLeast, ofType, includeSkipped }: QueryOptions<TTypes> = {},
): Generator<SyntaxNode> {
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
  node: SyntaxNode,
  options: QueryOptions<TTypes> = {},
): SyntaxNode {
  const [result] = queryChildren(node, { ...options, atLeast: 1 });
  return result;
}

/**
 * @yields all descendants of a syntax node in depth-first (pre-order) order.
 * @param node The node to get descendants of
 * @param options
 * @param options.atLeast - If provided, throws an error if fewer than this many matching descendants are found
 * @param options.ofType - If provided, only yields descendants of this type
 * @param options.includeSkipped - If true, includes skipped nodes in the result. Otherwise they are skipped.
 */
export function* queryDescendants<TTypes extends string>(
  node: SyntaxNode,
  { atLeast, ofType, includeSkipped }: QueryOptions<TTypes> = {},
): Generator<SyntaxNode> {
  const cur = node.cursor();
  let count = 0;

  // Depth-first traversal over descendants (excluding `node` itself).
  if (!cur.firstChild()) {
    if (atLeast !== undefined && atLeast !== 0) {
      throw new SyntaxError(
        `Expected at least ${atLeast} descendant${atLeast === 1 ? "" : "s"}${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
      );
    }
    return;
  }

  while (true) {
    const current = cur.node;
    const matchesType = !ofType || current.type.name === ofType;
    const matchesSkipped = includeSkipped || !current.type.isSkipped;
    if (matchesType && matchesSkipped) {
      yield current;
      count++;
    }

    if (cur.firstChild()) {
      continue;
    }

    while (!cur.nextSibling()) {
      if (!cur.parent() || cur.node === node) {
        if (atLeast !== undefined && count < atLeast) {
          throw new SyntaxError(
            `Expected at least ${atLeast} descendant${atLeast === 1 ? "" : "s"}${ofType ? ` of type ${ofType}` : ""}, but got ${count}`,
          );
        }
        return;
      }
    }
  }
}

/**
 * Gets the first descendant of a node that matches the given type.
 * @param node The node to get the first matching descendant of
 * @param options
 */
export function getDescendant<TTypes extends string>(
  node: SyntaxNode,
  options: QueryOptions<TTypes> = {},
): SyntaxNode {
  const { ofType, includeSkipped } = options;
  const cur = node.cursor();

  // Depth-first search (pre-order) over descendants (excluding `node` itself).
  if (!cur.firstChild()) {
    throw new SyntaxError(
      `Expected descendant${ofType ? ` of type ${ofType}` : ""}, but found none`,
    );
  }

  while (true) {
    const current = cur.node;
    const matchesType = !ofType || current.type.name === ofType;
    const matchesSkipped = includeSkipped || !current.type.isSkipped;
    if (matchesType && matchesSkipped) {
      return current;
    }

    if (cur.firstChild()) {
      continue;
    }

    while (!cur.nextSibling()) {
      if (!cur.parent() || cur.node === node) {
        throw new SyntaxError(
          `Expected descendant${ofType ? ` of type ${ofType}` : ""}, but found none`,
        );
      }
    }
  }
}

/**
 * Gets child, or returns undefined if there are no children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function queryChild<TTypes extends string>(
  node: SyntaxNode,
  options: QueryOptions<TTypes> = {},
): SyntaxNode | undefined {
  const [result] = queryChildren(node, options);
  return result;
}
