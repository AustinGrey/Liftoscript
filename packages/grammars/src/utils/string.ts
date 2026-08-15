/* eslint-disable no-bitwise */

export function StringUtils_unindent(string: string): string {
	const indent2 = string.split("\n").reduce<number | undefined>((memo, line) => {
		const match = line.match(/^(\s*)\S/);
		if (match != null) {
			const spaces = match[1];
			if (memo == null || memo > spaces.length) {
				return spaces.length;
			}
		}
		return memo;
	}, undefined);
	if (indent2 != null) {
		return string
			.split("\n")
			.map(s => (s.trim() === "" ? "" : s.slice(indent2, s.length).trimEnd()))
			.join("\n");
	} else {
		return string;
	}
}

/**
 * Convenience type for when you are defining a tagged template literal handler.
 * @typeParam TReturn The return type of the handler function.
 * @param strings The raw string components of the template literal.
 * @param values The values to be interpolated into the template.
 */
export type TaggedTemplateHandler<TReturn, TValues extends unknown> = (
	strings: TemplateStringsArray,
	...values: TValues[]
) => TReturn;

/**
 * Converts a tagged template literal into a single concatenated string,
 * replacing placeholders with their corresponding values.
 *
 * @param strings - The raw string components of the template literal.
 * @param values - The values to be interpolated into the template.
 * @return The resulting string after merging the strings and interpolated values.
 */
export const taggedTemplateToString: TaggedTemplateHandler<string, string | number> = (
	strings,
	...values
) => strings.reduce((acc, str, i) => acc + str + String(values[i] ?? ""), "");

export function sameCaseInsensitive(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

/**
 * Common filter predicate, true if the string contains any characters at all
 * @param a The string to check
 */
export function isNonEmpty(a: string): boolean {
	return !!a;
}

/**
 * Common filter predicate, true if the string contains any non-whitespace characters
 * @param a The string to check
 */
export function hasNonWhitespace(a: string): boolean {
	return !!a.trim();
}
