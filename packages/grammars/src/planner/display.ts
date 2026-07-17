import type { IPlannerProgram } from "@/program";

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
	return text?.split("\n").map(l => (l ? `// ${l}` : "//")) ?? [];
}

/**
 * @returns the script that would represent the provided program
 * @param program The program to convert to a script
 * @param compatibilityOptions Old liftoscript would add extra spaces in a lot of places for no good reason.
 *   If you really need full compatibility, such as to compare with old output, set addExtraSpace to true.
 */
export function asProgramScript(
	program: IPlannerProgram,
	compatibilityOptions: { addExtraSpace?: boolean } = {},
): string {
	return (
		program.weeks
			.flatMap(week => [
				...formatAsCommentLines(week.description),
				`# ${week.name}`,

				...week.days.flatMap(day => [
					...formatAsCommentLines(day.description).map(line =>
						compatibilityOptions.addExtraSpace && line === "//" ? "// " : line,
					),
					`## ${day.name}`,

					// @todo I think it's an error that there is an extra \n here after every exercise. The original program text doesn't have it, so why add it?
					`${day.exerciseText}\n`,
				]),
				...(compatibilityOptions.addExtraSpace ? [""] : []),
			])
			.join("\n") + (compatibilityOptions.addExtraSpace ? "\n" : "")
	);
}
