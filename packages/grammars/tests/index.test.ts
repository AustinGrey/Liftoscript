import { expect, test, describe } from "vite-plus/test";
import { parser } from "@/parsers/logic";
import { LiftoscriptEvaluator } from "@/evaluators/logic-evaluator";
import { run } from "@/logic/evaluators";

import { percentORM } from "@/models/weight.ts";
import type { IProgramState, LogicResult } from "@/logic/evaluators/types.ts";

function evalLogic(logic: string, state: IProgramState) {
  return new LiftoscriptEvaluator(logic, state).evaluate(
    parser.parse(logic).topNode,
  );
}

describe.each<[string, IProgramState, LogicResult]>([
  // Literal Number
  [`1`, {}, 1],
  [`0`, {}, 0],
  [`-1`, {}, -1],
  // Percentages of one rep max
  ["0%", {}, percentORM(0)],
  ["50%", {}, percentORM(50)],
  ["100%", {}, percentORM(100)],
  ["101%", {}, percentORM(101)],
  /* Bad Cases
    ["NaN%", {}, percentORM(0)],
    ["-50%", {}, percentORM(-50)],
    ["-101%", {}, percentORM(-101)],
     */
  // Comparisons
  [`1 > 0`, {}, true],
  [`1 < 0`, {}, false],
  [`1 >= 0`, {}, true],
  [`1 <= 0`, {}, false],
  [`1 == 0`, {}, false],
  [`1 != 0`, {}, true],
  [`1kg > 0`, {}, true],
  [`1kg < 0`, {}, false],
  [`1kg >= 0`, {}, true],
  [`1kg <= 0`, {}, false],
  [`1kg == 0`, {}, false],
  [`1kg != 0`, {}, true],
  [`1lb > 0`, {}, true],
  [`1lb < 0`, {}, false],
  [`1lb >= 0`, {}, true],
  [`1lb <= 0`, {}, false],
  [`1lb == 0`, {}, false],
  [`1lb != 0`, {}, true],
  [`1 > 0kg`, {}, true],
  [`1 < 0kg`, {}, false],
  [`1 >= 0kg`, {}, true],
  [`1 <= 0kg`, {}, false],
  [`1 == 0kg`, {}, false],
  [`1 != 0kg`, {}, true],
  [`1 > 0lb`, {}, true],
  [`1 < 0lb`, {}, false],
  [`1 >= 0lb`, {}, true],
  [`1 <= 0lb`, {}, false],
  [`1 == 0lb`, {}, false],
  [`1 != 0lb`, {}, true],
  [`1kg > 1lb`, {}, true],
  [`1kg < 1lb`, {}, false],
  [`1kg >= 1lb`, {}, true],
  [`1kg <= 1lb`, {}, false],
  [`1kg == 1lb`, {}, false],
  [`1kg != 1lb`, {}, true],
  [`1lb > 1kg`, {}, false],
  [`1lb < 1kg`, {}, true],
  [`1lb >= 1kg`, {}, false],
  [`1lb <= 1kg`, {}, true],
  [`1lb == 1kg`, {}, false],
  [`1lb != 1kg`, {}, true],
  // Ternary
  [`4 < 5 ? 1 : 0`, {}, 1],
  [`5 < 4 ? 1 : 0`, {}, 0],
  [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 8 }, 5],
  [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 4 }, 4],
  [`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, { foo: 2 }, 6],
])("$0 resolves to $2 when state is $1", (logic, state, expected) => {
  test.each<[string, (logic: string, state: IProgramState) => LogicResult]>([
    ["old system", evalLogic],
    ["new system", (logic, _) => run(logic, state)],
  ])("$0", (_, evaluator) => {
    expect(evaluator(logic, state)).toEqual(expected);
  });
});
