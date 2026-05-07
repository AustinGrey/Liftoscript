import type { ISettings } from "@/types.ts";

export type PlannerRunInput = {
  fullProgramText: string;
  settings: ISettings;
};

export type PlannerRunOutput = unknown;

/**
 * New planner evaluation system (scaffolding).
 *
 * This intentionally does not implement evaluation yet; tests should be added
 * in parallel to drive the implementation.
 */
export function run(_input: PlannerRunInput): PlannerRunOutput {
  throw new Error("Planner new-system evaluator not implemented");
}

