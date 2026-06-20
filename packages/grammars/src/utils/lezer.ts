/**
 * Tools for working with Lezer grammars and parsers.
 */
import {
  IterMode,
  NodeProp,
  NodeType,
  type SyntaxNode,
  Tree,
  TreeCursor,
} from "@lezer/common";
import { LRParser } from "@lezer/lr";

/**
 * @returns Line/offset in script that tells where the node given starts.
 * ASSUMPTION: The node came from the script provided
 * @param script The script the node came from
 * @param node The node to get the line and offest for
 */
function getLineAndOffset(script: string, node: SyntaxNode): [number, number] {
  const linesLengths = script.split("\n").map((l) => l.length + 1);
  let offset = 0;
  for (let i = 0; i < linesLengths.length; i++) {
    const lineLength = linesLengths[i];
    // @todo original liftoscript had conflicting implementations -> `node.from > offset` or `node.from >= offset`.
    //    As of yet I don't know which is correct, just using one arbitrarily.
    if (node.from >= offset && node.from < offset + lineLength) {
      return [i + 1, node.from - offset];
    }
    offset += lineLength;
  }
  return [linesLengths.length, linesLengths[linesLengths.length - 1]];
}

/**
 * Points to a particular location in the source code
 */
export type ISyntaxPointer = {
  /**
   * Which line (1-indexed) the location starts at
   */
  line: number;
  /**
   * Which offset (0-indexed) within the line the location starts at
   */
  offset: number;
  /**
   * Which character index (0-indexed) within the full source code the location starts at
   */
  from: number;
  /**
   * Which character index (0-indexed) within the full source code the location ends at
   */
  to: number;
};

/**
 * Provide an interface that is like {@link SyntaxNode}, but don't extend since the type returned by cursor is a tree class that doesn't
 * extend SyntaxTree, making them technically incompatible
 */
export interface SourcedSyntaxNode {
  /**
   * The full source code this node was parsed from
   */
  getSourceFile: () => string;
  /**
   * The slice of the full source that this node represents
   */
  source: string;
  /**
   * Gets a pointer to the code in the original source where this node was parsed from
   */
  getPointer: () => ISyntaxPointer;
  parent: SourcedSyntaxNode | null;
  firstChild: SourcedSyntaxNode | null;
  lastChild: SourcedSyntaxNode | null;
  childAfter(pos: number): SourcedSyntaxNode | null;
  childBefore(pos: number): SourcedSyntaxNode | null;
  enter(
    pos: number,
    side: -1 | 0 | 1,
    mode?: IterMode,
  ): SourcedSyntaxNode | null;
  nextSibling: SourcedSyntaxNode | null;
  prevSibling: SourcedSyntaxNode | null;
  prop<T>(prop: NodeProp<T>): T | undefined;
  cursor(mode?: IterMode): SourcedTreeCursor;
  resolve(pos: number, side?: -1 | 0 | 1): SourcedSyntaxNode;
  resolveInner(pos: number, side?: -1 | 0 | 1): SourcedSyntaxNode;
  enterUnfinishedNodesBefore(pos: number): SourcedSyntaxNode;
  toTree(): Tree;
  getChild(
    type: string | number,
    before?: string | number | null,
    after?: string | number | null,
  ): SourcedSyntaxNode | null;
  getChildren(
    type: string | number,
    before?: string | number | null,
    after?: string | number | null,
  ): SourcedSyntaxNode[];
  readonly from: number;
  readonly to: number;
  readonly type: NodeType;
  readonly name: string;
  readonly tree: Tree | null;
  readonly node: SyntaxNode;
  matchContext(context: readonly string[]): boolean;
}

class SourcedTreeCursor {
  constructor(
    private cursor: TreeCursor,
    private getSource: () => string,
  ) {}

  get type() {
    return this.cursor.type;
  }

  get name() {
    return this.cursor.name;
  }

  get to() {
    return this.cursor.to;
  }

  get node(): SourcedSyntaxNode {
    return bindNode(this.cursor.node, this.getSource);
  }

  firstChild() {
    return this.cursor.firstChild();
  }

  nextSibling() {
    return this.cursor.nextSibling();
  }

  next(enter?: boolean) {
    return this.cursor.next(enter);
  }
}

function bindNode(
  node: SyntaxNode,
  getSource: () => string,
): SourcedSyntaxNode {
  const recurse = (node: SyntaxNode | null) => bindMaybeNode(node, getSource);
  const recurseSure = (node: SyntaxNode) => bindNode(node, getSource);
  return {
    getSourceFile: getSource,
    get source() {
      return this.getSourceFile().slice(node.from, node.to);
    },
    childAfter: (...args) => recurse(node.childAfter(...args)),
    childBefore: (...args) => recurse(node.childBefore(...args)),
    enter: (...args) => recurse(node.enter(...args)),
    get nextSibling() {
      return recurse(node.nextSibling);
    },
    get prevSibling() {
      return recurse(node.prevSibling);
    },
    get parent() {
      return recurse(node.parent);
    },
    get firstChild() {
      return recurse(node.firstChild);
    },
    get lastChild() {
      return recurse(node.lastChild);
    },
    resolve: (...args) => recurseSure(node.resolve(...args)),
    resolveInner: (...args) => recurseSure(node.resolveInner(...args)),
    enterUnfinishedNodesBefore: (...args) =>
      recurseSure(node.enterUnfinishedNodesBefore(...args)),
    getChild: (...args) => recurse(node.getChild(...args)),
    getChildren: (...args) => node.getChildren(...args).map(recurseSure),
    cursor: (...args) => new SourcedTreeCursor(node.cursor(...args), getSource),
    get type() {
      return node.type;
    },
    get from() {
      return node.from;
    },
    get name() {
      return node.name;
    },
    get node() {
      return node.node;
    },
    get to() {
      return node.to;
    },
    get tree() {
      return node.tree;
    },
    matchContext: (...args) => node.matchContext(...args),
    prop: (...args) => node.prop(...args),
    toTree: (...args) => node.toTree(...args),
    getPointer: () => {
      const [line, offset] = getLineAndOffset(getSource(), node);
      return {
        line,
        offset,
        from: node.from,
        to: node.to,
      };
    },
  };
}

const bindMaybeNode = (node: SyntaxNode | null, getSource: () => string) =>
  node ? bindNode(node, getSource) : null;

/**
 * Parses the given script, using the given parser, and binds the script to the returned nodes so that it can be accessed later when needed.
 * Lezer parsers normally require you to store the original script and use it to get the original text a node covers, but this simplifies all that storage.
 * @param parser The parser to use
 * @param script The script to parse
 */
export function parseBound(
  parser: LRParser,
  script: string,
): SourcedSyntaxNode {
  return bindNode(parser.parse(script).topNode, () => script);
}

export class SourcedSyntaxError extends SyntaxError {
  public readonly line: number;
  public readonly offset: number;
  public readonly from: number;
  public readonly to: number;

  constructor(
    message: string,
    line: number,
    offset: number,
    from: number,
    to: number,
  ) {
    super(message);
    this.line = line;
    this.offset = offset;
    this.from = from;
    this.to = to;
  }
}

export function isSourcedSyntaxError(
  error: unknown,
): error is SourcedSyntaxError {
  return error instanceof SourcedSyntaxError;
}

/**
 * Creates a new SourcedSyntaxError from the given node and message
 * @param node The node this error is for
 * @param message The message to use. By default the user is told which node encountered and error, but you can override that.
 *   The line and offset are automatically determined from the node, and appended to the message, which can't be overridden.
 */
export function nodeError(
  node: SourcedSyntaxNode,
  // This default is carefully chosen so it still makes sense if the node is actually an error node
  message: string = `Error detected on '${node.type.name}' node`,
) {
  const { line, offset, from, to } = node.getPointer();
  return new SourcedSyntaxError(
    `${message} (${line}:${offset})`,
    line,
    offset,
    from,
    to,
  );
}

/**
 * @returns The first found node of the provided node and all it's descendants which is an error node, undefined if none found
 * @param expr The node to look into
 */
export function findErrorNode(
  expr: SourcedSyntaxNode,
): SourcedSyntaxNode | undefined {
  const cursor = expr.cursor();
  do {
    if (cursor.node.type.isError) {
      return cursor.node;
    }
  } while (cursor.next());
}
