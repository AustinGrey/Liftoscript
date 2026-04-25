import type { LogicHandler } from "@/logic/evaluators/types.ts";

// @TODO why bother preserving the unit here? We could simply use the evaluation context to turn this into a static weight value based on the one rep max, and then all logic afterwards can simply use that value like any other weight.
export const handler: LogicHandler<"Percentage"> = (n, t) => {
  // @TODO the original was rounding to 2 decimals. Rounding prior to the result is a loss of precision I don't like, but I should see if it had a purpose
  const value = parseFloat(t.getText(n));
  return { value: isNaN(value) ? 0 : value, unit: "%" };
};
