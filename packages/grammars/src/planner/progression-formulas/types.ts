import type { SourcedSyntaxNode } from "@/utils/lezer.ts";
import type { PlannerSyntaxError } from "@/planner/parsing/guards.ts";

export type ProgressionFormulaValidator = (
  fnArgs: (string | undefined)[],
  valueNode: SourcedSyntaxNode,
) => Generator<PlannerSyntaxError>;
