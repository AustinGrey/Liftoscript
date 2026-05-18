import { describe, it, expect } from "vite-plus/test";
import { getUnitMath } from "@/quantities/index.ts";

describe(getUnitMath, () => {
  it("Can do math with the percent unit involved", () => {
    const $ = getUnitMath({ oneRepMax: [14, "lb"] });
    expect($("100%").toBaseUnits().toString()).toEqual("14 lb");
  });
});
