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
  source: string;
}

export function parse(workoutPlan: string): SourcedSyntaxNode {
  const result = parser.parse(workoutPlan).topNode;
  // now what?
}
