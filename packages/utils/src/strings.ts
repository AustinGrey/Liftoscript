/**
 * True if the given value is a string that contains at least one visible (non-whitespace) character
 * @param s The string to check
 */
export function isVisibleString(s: unknown): s is string {
	return typeof s === "string" && s.trim() !== "";
}
