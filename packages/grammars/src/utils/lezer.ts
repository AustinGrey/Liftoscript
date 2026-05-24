/**
 * Tools for working with Lezer grammars and parsers.
 */
import type { SyntaxNode } from "@lezer/common";

/**
 * @returns Line/offset in script that tells where the node given starts.
 * ASSUMPTION: The node came from the script provided
 * @param script The script the node came from
 * @param node The node to get the line and offest for
 */
export function getLineAndOffset(
  script: string,
  node: SyntaxNode,
): [number, number] {
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
