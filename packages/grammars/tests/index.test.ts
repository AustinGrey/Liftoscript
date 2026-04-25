import { expect, it } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import {
  type IProgramState,
  LiftoscriptEvaluator,
} from "@/evaluators/logic-evaluator";
import { type LogicResult, run } from "@/evaluators/logic.ts";

import { percent } from "@/models/weight.ts";

function evalLogic(logic: string, state: IProgramState) {
  return new LiftoscriptEvaluator(logic, state).evaluate(
    parser.parse(logic).topNode,
  );
}

it.each<[string, IProgramState, LogicResult]>([
  // Literal Number
  [`1`, {}, 1],
  [`0`, {}, 0],
  [`-1`, {}, -1],
  // Percentages
  ["0%", {}, percent(0)],
  ["NaN%", {}, percent(0)],
  ["50%", {}, percent(50)],
  ["100%", {}, percent(100)],
  ["101%", {}, percent(101)],
  ["-50%", {}, percent(-50)],
  ["-101%", {}, percent(-101)],
  // Comparisons
  [`1 > 0`, {}, true],
  [`1 < 0`, {}, false],
  [`1 >= 0`, {}, true],
  [`1 <= 0`, {}, false],
  [`1 == 0`, {}, false],
  [`1 != 0`, {}, true],
  // Ternary
  // [`true ? 1 : 0`, {}, -1],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 8 }, 5],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 4 }, 4],
  // [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 2 }, 6],
])(
  "$0 resolves to $2 when state is $1 for both old and new",
  (logic, state, expected) => {
    const old = evalLogic(logic, state);
    const result = run(logic);
    expect(old).toEqual(expected);
    expect(result).toEqual(expected);
  },
);
