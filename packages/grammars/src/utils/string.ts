/* eslint-disable no-bitwise */

export function StringUtils_capitalize(string: string): string {
  return string[0].toUpperCase() + string.slice(1);
}

export function StringUtils_dashcase(string: string): string {
  return string.replace(/[:,]/g, "").replace(/\s+/g, "-").toLowerCase();
}

export function StringUtils_undashcase(string: string): string {
  return string.replace(/-/g, " ");
}

export function StringUtils_uncamelCase(string: string): string {
  return string.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function StringUtils_camelCase(string: string): string {
  return string
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase(),
    )
    .replace(/\s+/g, "");
}

export function StringUtils_unindent(string: string): string {
  const indent2 = string
    .split("\n")
    .reduce<number | undefined>((memo, line) => {
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
      .map((s) => (s.trim() === "" ? "" : s.slice(indent2, s.length).trimEnd()))
      .join("\n");
  } else {
    return string;
  }
}

export function StringUtils_fuzzySearch(
  needle: string,
  haystack: string,
): boolean {
  if (needle.length > haystack.length) {
    return false;
  } else if (needle === haystack) {
    return true;
  } else {
    outer: for (let i = 0, j = 0; i < needle.length; i++) {
      const nch = needle.charCodeAt(i);
      while (j < haystack.length) {
        // eslint-disable-next-line no-plusplus
        if (haystack.charCodeAt(j++) === nch) {
          continue outer;
        }
      }
      return false;
    }
    return true;
  }
}

/**
 * Convenience type for when you are defining a tagged template literal handler.
 * @typeParam TReturn The return type of the handler function.
 * @param strings The raw string components of the template literal.
 * @param values The values to be interpolated into the template.
 */
export type TaggedTemplateHandler<TReturn> = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => TReturn;

/**
 * Converts a tagged template literal into a single concatenated string,
 * replacing placeholders with their corresponding values.
 *
 * @param strings - The raw string components of the template literal.
 * @param values - The values to be interpolated into the template.
 * @return The resulting string after merging the strings and interpolated values.
 */
export const taggedTemplateToString: TaggedTemplateHandler<string> = (
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
