import type { LogicHandler } from "@/logic/evaluators/types.ts";

export const handler: LogicHandler<"LineComment"> = (n, t) =>
  t.error("Not implemented", n);
