import { expect, it } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import {
  type IProgramState,
  LiftoscriptEvaluator,
} from "@/evaluators/logic-evaluator";
import { type LogicResult, run } from "@/evaluators/logic.ts";

function evalLogic(logic: string, state: IProgramState) {
  return new LiftoscriptEvaluator(logic, state).evaluate(
    parser.parse(logic).topNode,
  );
}

it.each<[string, IProgramState, LogicResult]>([
  [`1`, {}, 1],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 8 }, 5],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 4 }, 4],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 2 }, 6],
])(
  "$script resolves to $expected when state is $state for both old and new",
  (logic, state, expected) => {
    const old = evalLogic(logic, state);
    const result = run(logic);
    expect(old).toEqual(expected);
    expect(result).toEqual(expected);
  },
);
