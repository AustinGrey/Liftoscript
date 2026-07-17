import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { nodeError } from "@/utils/lezer.ts";

export const handler: LogicHandler<"LineComment"> = n => {
	throw nodeError(n, "Not implemented");
};
