import { parser } from "@/parsers/workout-plan.ts";
import type { SyntaxNode } from "@lezer/common";

export class PlannerOldSystemError extends Error {}

export type PlannerOldSystemEvalResult =
  | { success: true; exerciseFullNames: string[] }
  | { success: false; error: PlannerOldSystemError; exerciseFullNames: string[] };

function getText(script: string, node: SyntaxNode): string {
  return script.slice(node.from, node.to);
}

function findChild(node: SyntaxNode, name: string): SyntaxNode | undefined {
  const cur = node.cursor();
  if (!cur.firstChild()) return undefined;
  do {
    if (cur.node.type.name === name) return cur.node;
  } while (cur.nextSibling());
  return undefined;
}

/**
 * Minimal "old system" planner evaluator for grammars tests.
 *
 * It parses the program and performs a small amount of validation that we can
 * rely on in tests (e.g. duplicate exercise names within a day).
 */
export function PlannerOldEvaluator_evaluateFull(
  fullProgramText: string,
): PlannerOldSystemEvalResult {
  const tree = parser.parse(fullProgramText);

  const program = tree.topNode;
  const exerciseFullNames: string[] = [];
  const seenInDay = new Set<string>();

  try {
    const cur = program.cursor();
    if (!cur.firstChild()) {
      return { success: true, exerciseFullNames };
    }
    do {
      if (cur.node.type.isError) {
        throw new PlannerOldSystemError("Syntax error");
      }

      if (cur.node.type.name === "Day") {
        seenInDay.clear();
      }

      if (cur.node.type.name === "ExerciseExpression") {
        const nameNode = findChild(cur.node, "ExerciseName");
        if (!nameNode) continue;
        const fullName = getText(fullProgramText, nameNode).trim();
        exerciseFullNames.push(fullName);
        if (seenInDay.has(fullName)) {
          throw new PlannerOldSystemError("Exercise is already used in this day");
        }
        seenInDay.add(fullName);
      }
    } while (cur.nextSibling());

    return { success: true, exerciseFullNames };
  } catch (e) {
    const err =
      e instanceof PlannerOldSystemError
        ? e
        : new PlannerOldSystemError(String(e));
    return { success: false, error: err, exerciseFullNames };
  }
}

