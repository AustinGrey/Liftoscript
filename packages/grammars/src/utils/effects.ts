import { Option as $ } from "effect";

export const orUndefined = $.getOrElse(() => undefined);
