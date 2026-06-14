import { SourcedSyntaxError, type SourcedSyntaxNode } from "@/utils/lezer.ts";

export type ProgressionFormulaValidator = (
  fnArgs: (string | undefined)[],
  valueNode: SourcedSyntaxNode,
  /**
   * If the progression formula allows logic specified via liftoscript, this function is used to validate the embedded liftoscript.
   */
  validateLiftoscript: (script: string) => Generator<SourcedSyntaxError>,
) => Generator<SourcedSyntaxError>;
