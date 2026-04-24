import { expect, it } from "vite-plus/test";
import { parser } from "@/parsers/logic.ts";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator.ts";

it("ternary", () => {
  const parsed = parser.parse(`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`);
  const rawResult = new LiftoscriptEvaluator().parse(parsed.topNode);
  console.log(parsed);
});
