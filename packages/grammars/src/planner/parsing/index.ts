/*
Lezer parsers don't support getting the original source code of a node, so we augment the nodes with our
own version that stores a reference so we can simplify all the other code.
 */

import { parser } from "./workout-plan.ts";
import type { SyntaxNode } from "@lezer/common";

export interface SourcedSyntaxNode extends SyntaxNode {
  /**
   * The source code that this node was parsed from
   */
  getSource: () => string;
}

export function parse(workoutPlan: string): SourcedSyntaxNode {
  return bindNode(parser.parse(workoutPlan).topNode, () => workoutPlan);
}

function bindNode(
  node: SyntaxNode,
  getSource: () => string,
): SourcedSyntaxNode {
  const recurse = (node: SyntaxNode | null) => bindMaybeNode(node, getSource);
  const recurseSure = (node: SyntaxNode) => bindNode(node, getSource);
  return {
    ...node,
    getSource,
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
  };
}

const bindMaybeNode = (node: SyntaxNode | null, getSource: () => string) =>
  node ? bindNode(node, getSource) : null;
