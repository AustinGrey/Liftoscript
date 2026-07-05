import type { ProgressionFormulaValidator } from "@/planner/progression-formulas/types.ts";

/**
 * @yields any problems found with use of the none progression formula in code
 */
export const validate: ProgressionFormulaValidator = function* () {
	/*There are no validations for the none progression formula*/
};
