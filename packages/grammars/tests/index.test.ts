import { expect, it } from "vite-plus/test";
import { parser } from "@/parsers/logic.ts";

it("ternary", () => {
  const parsed = parser.parse(`state.foo > 3 ? state.foo < 7 ? 4 : 5 : 6`);

  console.log(parsed);
});
