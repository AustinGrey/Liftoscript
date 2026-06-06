/**
 * Tools for working with Lezer grammars and parsers.
 */
import {
  IterMode,
  NodeProp,
  type SyntaxNode,
  Tree,
  TreeCursor,
  type SyntaxNodeRef,
  NodeType,
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
    if (node.from >= offset && node.from < offset + lineLength) {
      return [i + 1, node.from - offset];
    }
    offset += lineLength;
  }
  return [linesLengths.length, linesLengths[linesLengths.length - 1]];
}

/**
 * Provide an interface that is like {@link SyntaxNode}, but don't extend since the type returned by cursor is a tree class that doesn't
 * extend SyntaxTree, making them technically incompatible
 */
export interface SourcedSyntaxNode {
  /**
   * The full source code this node was parsed from
   */
  getSource: () => string;
  /**
   * The slice of the full source that this node represents
   */
  source: string;
  getLineAndOffset: () => [number, number];
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

  get from() {
    return this.cursor.from;
  }

  get to() {
    return this.cursor.to;
  }

  get tree() {
    return this.cursor.tree;
  }

  get node(): SourcedSyntaxNode {
    return bindNode(this.cursor.node, this.getSource);
  }

  firstChild() {
    return this.cursor.firstChild();
  }

  lastChild() {
    return this.cursor.lastChild();
  }

  childAfter(pos: number) {
    return this.cursor.childAfter(pos);
  }

  childBefore(pos: number) {
    return this.cursor.childBefore(pos);
  }

  enter(pos: number, side: -1 | 0 | 1, mode?: IterMode) {
    return this.cursor.enter(pos, side, mode);
  }

  parent() {
    return this.cursor.parent();
  }

  nextSibling() {
    return this.cursor.nextSibling();
  }

  prevSibling() {
    return this.cursor.prevSibling();
  }

  next(enter?: boolean) {
    return this.cursor.next(enter);
  }

  prev(enter?: boolean) {
    return this.cursor.prev(enter);
  }

  moveTo(pos: number, side: -1 | 0 | 1 = 0): this {
    this.cursor.moveTo(pos, side);
    return this;
  }

  iterate(
    enter: (node: SyntaxNodeRef) => boolean | void,
    leave?: (node: SyntaxNodeRef) => void,
  ) {
    return this.cursor.iterate(enter, leave);
  }

  matchContext(context: readonly string[]) {
    return this.cursor.matchContext(context);
  }
}

function bindNode(
  node: SyntaxNode,
  getSource: () => string,
): SourcedSyntaxNode {
  const recurse = (node: SyntaxNode | null) => bindMaybeNode(node, getSource);
  const recurseSure = (node: SyntaxNode) => bindNode(node, getSource);
  return {
    getSource,
    get source() {
      return this.getSource().slice(node.from, node.to);
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
    getLineAndOffset: () => getLineAndOffset(getSource(), node),
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
