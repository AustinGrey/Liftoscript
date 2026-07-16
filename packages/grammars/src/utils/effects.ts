import { Option as $ } from "effect";
// This is going to be used literally everywhere. A short, consistent alias aids readability.
export { Option as $ } from "effect";

export const orUndefined = $.getOrElse(() => undefined);
