import { describe, it, expect } from "vite-plus/test";
import { isVisibleString } from "./strings.ts";

describe(isVisibleString, () => {
	it("returns true for visible string", () => {
		expect(isVisibleString("_")).toBe(true);
	});
});
