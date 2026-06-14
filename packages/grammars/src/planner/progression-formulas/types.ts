import type { SourcedSyntaxNode } from "@/utils/lezer.ts";
import type { PlannerSyntaxError } from "@/planner/parsing/guards.ts";
import type { LiftoscriptSyntaxError } from "@/logic/evaluators/types.ts";

export type ProgressionFormulaValidator = (
  fnArgs: (string | undefined)[],
  valueNode: SourcedSyntaxNode,
  /**
   * If the progression formula allows logic specified via liftoscript, this function is used to validate the embedded liftoscript.
   */
  validateLiftoscript: (script: string) => Generator<LiftoscriptSyntaxError>,
) => Generator<PlannerSyntaxError>;
