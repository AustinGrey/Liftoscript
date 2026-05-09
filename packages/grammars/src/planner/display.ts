import type { IPlannerProgramWeek } from "@/evaluators/logic-evaluator.ts";

export function PlannerProgram_generateFullText(
  weeks: IPlannerProgramWeek[],
): string {
  let fullText = "";
  for (const week of weeks) {
    if (week.description != null) {
      fullText +=
        week.description
          .split("\n")
          .map((l) => (l ? `// ${l}` : "//"))
          .join("\n") + "\n";
    }
    fullText += `# ${week.name}\n`;
    for (const day of week.days) {
      if (day.description != null) {
        fullText +=
          day.description
            .split("\n")
            .map((l) => `// ${l}`)
            .join("\n") + "\n";
      }
      fullText += `## ${day.name}\n`;
      fullText += `${day.exerciseText}\n\n`;
    }
    fullText += "\n";
  }
  return fullText;
}
