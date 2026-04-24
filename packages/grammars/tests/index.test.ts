import { expect, it } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator";

function evalLogic(logic: string) {
  const parsed = parser.parse(logic);
  const rawResult = new LiftoscriptEvaluator(script, { foo: 4 }).evaluate(
    parsed.topNode,
  );
}

it("ternary", () => {
  const script = `state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`;
  const parsed = parser.parse(script);
  const rawResult = new LiftoscriptEvaluator(script, { foo: 4 }).evaluate(
    parsed.topNode,
  );
  console.log(rawResult);
});
