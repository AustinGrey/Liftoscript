import type { IPlannerProgram } from "@/program";

/**
 * @returns the script that would represent the provided program
 * @param program The program to convert to a script
 */
export function asProgramScript(program: IPlannerProgram): string {
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

/**
 * Formats the given text so as one or more comment lines.
 * Blank lines won't have trailing space
 * e.g.
 * ```
 * this is my
 * text on multiple
 *
 * lines
 * ```
 * returns
 * ```
 * - "// this is my"
 * - "// text on multiple"
 * - "//"
 * - "// lines"
 * ```
 * @param text The text to format
 */
function formatAsCommentLines(text?: string): string[] {
  return text?.split("\n").map((l) => (l ? `// ${l}` : "//")) ?? [];
}

/**
 * @returns the script that would represent the provided program
 * @param program The program to convert to a script
 */
export function asProgramScript2(program: IPlannerProgram): string {
  return program.weeks
    .flatMap((week) => [
      ...formatAsCommentLines(week.description),
      `# ${week.name}`,

      ...week.days.flatMap((day) => [
        ...formatAsCommentLines(day.description),
        `## ${day.name}`,

        // @todo I think it's an error that there is an extra \n here after every exercise. The original program text doesn't have it, so why add it?
        `${day.exerciseText}\n`,
      ]),
    ])
    .join("\n");
}
