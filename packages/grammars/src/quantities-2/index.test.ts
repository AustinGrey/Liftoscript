import { describe, it, expect } from "vite-plus/test";
import { getUnitMath } from "./index.ts";

describe(getUnitMath, () => {
	it("Can do math with the percent unit involved", () => {
		const $ = getUnitMath({ oneRepMax: [14, "lb"] });
		expect($("100%").add($("14 lb")).toString()).toEqual("200 %");
	});
});
