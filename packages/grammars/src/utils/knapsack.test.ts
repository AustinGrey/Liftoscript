import { describe, expect, it } from "vite-plus/test";
import { boundedSumTotal, closestBoundedSum, type BoundedKnapsackItem } from "./knapsack.ts";

/** Greedy largest-first — the naive plate algorithm this module intentionally beats. */
function greedyClosestUnder(items: readonly BoundedKnapsackItem[], target: number): number[] {
	const counts = items.map(() => 0);
	let remaining = target;
	for (let i = 0; i < items.length; i++) {
		const { value, maxCount } = items[i];
		if (value <= 0) {
			continue;
		}
		const take = Math.min(maxCount, Math.floor(remaining / value));
		counts[i] = take;
		remaining -= take * value;
	}
	return counts;
}

describe(closestBoundedSum, () => {
	it("returns zeros for empty inventory or non-positive target", () => {
		expect(closestBoundedSum([], 100)).toEqual([]);
		expect(closestBoundedSum([{ value: 45, maxCount: 2 }], 0)).toEqual([0]);
		expect(closestBoundedSum([{ value: 45, maxCount: 2 }], -10)).toEqual([0]);
	});

	it("hits an exact target with standard plate denominations", () => {
		// Per-side unit weights after a ×2 barbell multiplier: 90, 50, 20, 10, 5
		const items: BoundedKnapsackItem[] = [
			{ value: 90, maxCount: 4 },
			{ value: 50, maxCount: 2 },
			{ value: 20, maxCount: 2 },
			{ value: 10, maxCount: 2 },
			{ value: 5, maxCount: 2 },
		];
		// 225 total − 45 bar = 180 on the bar → 2×90
		const counts = closestBoundedSum(items, 180);
		expect(counts).toEqual([2, 0, 0, 0, 0]);
		expect(boundedSumTotal(items, counts)).toBe(180);
	});

	/**
	 * Uniqueness vs greedy: limited stock of a large denomination can make
	 * "take as many large as fit" leave a worse remainder than skipping some.
	 */
	it("beats greedy when limited large plates leave a worse remainder", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 45, maxCount: 1 },
			{ value: 25, maxCount: 10 },
		];
		const target = 90;

		const greedy = greedyClosestUnder(items, target);
		expect(boundedSumTotal(items, greedy)).toBe(70); // 1×45 + 1×25

		const optimal = closestBoundedSum(items, target);
		expect(boundedSumTotal(items, optimal)).toBe(75); // 0×45 + 3×25
		expect(optimal).toEqual([0, 3]);
		expect(boundedSumTotal(items, optimal)).toBeGreaterThan(boundedSumTotal(items, greedy));
	});

	/**
	 * Uniqueness vs greedy: non-canonical denominations where taking the
	 * largest first blocks an exact combination of smaller items.
	 */
	it("beats greedy on non-canonical denominations (classic 9/6/5 trap)", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 9, maxCount: 1 },
			{ value: 6, maxCount: 1 },
			{ value: 5, maxCount: 1 },
		];
		const target = 11;

		const greedy = greedyClosestUnder(items, target);
		expect(boundedSumTotal(items, greedy)).toBe(9); // takes 9, stuck

		const optimal = closestBoundedSum(items, target);
		expect(optimal).toEqual([0, 1, 1]); // 6 + 5
		expect(boundedSumTotal(items, optimal)).toBe(11);
	});

	/**
	 * Uniqueness vs exact-only solvers: when the target is unreachable, pick
	 * the greatest achievable sum still ≤ target (never overshoot).
	 */
	it("rounds down to the closest achievable sum without exceeding the target", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 10, maxCount: 2 },
			{ value: 3, maxCount: 2 },
		];
		const counts = closestBoundedSum(items, 17);
		expect(boundedSumTotal(items, counts)).toBe(16); // 10+3+3, not 20
		expect(boundedSumTotal(items, counts)).toBeLessThanOrEqual(17);
	});

	it("respects inventory caps even when more of a denomination would fit mathematically", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 45, maxCount: 1 },
			{ value: 10, maxCount: 1 },
		];
		const counts = closestBoundedSum(items, 200);
		expect(counts).toEqual([1, 1]);
		expect(boundedSumTotal(items, counts)).toBe(55);
	});

	it("handles fractional plate values via integer scaling", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 2.5, maxCount: 4 },
			{ value: 1.25, maxCount: 2 },
		];
		const counts = closestBoundedSum(items, 7.5);
		expect(counts).toEqual([3, 0]);
		expect(boundedSumTotal(items, counts)).toBe(7.5);

		const awkward = closestBoundedSum(
			[
				{ value: 2.5, maxCount: 1 },
				{ value: 1.25, maxCount: 4 },
			],
			7.5,
		);
		expect(
			boundedSumTotal(
				[
					{ value: 2.5, maxCount: 1 },
					{ value: 1.25, maxCount: 4 },
				],
				awkward,
			),
		).toBe(7.5);
	});

	it("ignores zero-value items without hanging", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 0, maxCount: 99 },
			{ value: 10, maxCount: 2 },
		];
		const counts = closestBoundedSum(items, 20);
		expect(counts[0]).toBe(0);
		expect(counts[1]).toBe(2);
	});

	it("returns all zeros when nothing fits under the target", () => {
		const items: BoundedKnapsackItem[] = [
			{ value: 45, maxCount: 4 },
			{ value: 25, maxCount: 4 },
		];
		expect(closestBoundedSum(items, 10)).toEqual([0, 0]);
	});
});
