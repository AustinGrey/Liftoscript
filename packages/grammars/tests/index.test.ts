import { expect, it } from "vite-plus/test";
import type { IProgramState, IWeight } from "@/types.ts";
import type { IScriptBindings } from "@/models/progress.ts";

export function ParserTestUtils_run(
  program: string,
  state: IProgramState,
  bindings: IScriptBindings = ParserTestUtils_defaultBindings,
): number | IWeight | boolean {
  const scriptRunner = new ScriptRunner(
    program,
    state,
    {},
    bindings,
    fns,
    "lb",
    { unit: "lb", prints: [] },
    "planner",
  );
  return scriptRunner.execute();
}

it("ternary", () => {
  expect(
    ParserTestUtils_run(`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`, {
      foo: 2,
    }),
  ).to.eql(6);
});
