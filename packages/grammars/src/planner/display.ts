import type { IPlannerProgramWeek } from "@/evaluators/logic-evaluator.ts";

export function PlannerProgram_generateFullText(
  weeks: IPlannerProgramWeek[],
): string {
  let lines: string[] = [];
  for (const week of weeks) {
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
