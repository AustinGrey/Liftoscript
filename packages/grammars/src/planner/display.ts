import type { IPlannerProgram } from "@/evaluators/plan-evaluator-minimal.ts";

/**
 * @returns the script that would represent the provided program
 * @param program The program to convert to a script
 */
export function asProgramScript(program: IPlannerProgram | undefined): string {
  if (!program) {
    return "";
  }
  let lines: string[] = [];
  for (const week of program.weeks) {
    // @todo This logic preserves empty comments. But does that really provide value?
    if (week.description != null) {
      lines.push(
        week.description
          .split("\n")
          .map((l) => (l ? `// ${l}` : "//"))
          .join("\n"),
      );
    }
    lines.push(`# ${week.name}`);
    for (const day of week.days) {
      if (day.description != null) {
        lines.push(
          day.description
            .split("\n")
            .map((l) => `// ${l}`)
            .join("\n"),
        );
      }
      lines.push(`## ${day.name}`);
      lines.push(`${day.exerciseText}\n`);
    }
    lines.push("");
  }
  return lines.join("\n") + "\n";
}
