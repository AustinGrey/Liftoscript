export type BoundedKnapsackItem = {
	/**
	 * Contribution of one unit of this item
	 * - Can be negative
	 * - Items with high precision might lose precision, see maxPrecision
	 */
	value: number;
	/**
	 * Maximum number of times this item may be selected
	 * - Must be non-negative
	 */
	maxCount: number;
};

/**
 * Chooses the fewest items to get as close to the target as possible without going over.
 *
 * @returns The count per item that should be selected
 */
export function closestBoundedSum(items: readonly BoundedKnapsackItem[], target: number): number[] {
	const maxIterations = 10_000;
	const maxPrecision = 6;

	if (target <= 0 || items.length === 0) {
		return items.map(() => 0);
	}

	// Determine how much we need to multiply all the numbers to make them integers, then do so. Limited by maxPrecision
	const allValues = [target, ...items.map((item) => item.value)];
	let maxDecimals = 0;
	for (const v of allValues) {
		const s = v.toString();
		const dot = s.indexOf(".");
		if (dot >= 0) {
			maxDecimals = Math.max(maxDecimals, s.length - dot - 1);
		}
	}
	const precision = Math.pow(10, Math.min(maxDecimals, maxPrecision));
	const intTarget = Math.round(target * precision);
	const intWeights = items.map((item) => Math.round(item.value * precision));
	const maxCounts = items.map((item) => Math.max(0, Math.floor(item.maxCount)));

	const maxFrom = Array.from<number>({ length: items.length + 1 }).fill(0);
	for (let i = items.length - 1; i >= 0; i--) {
		maxFrom[i] = maxFrom[i + 1] + intWeights[i] * maxCounts[i];
	}

	const best = Array.from<number>({ length: items.length }).fill(0);
	const current = Array.from<number>({ length: items.length }).fill(0);
	let bestRemaining = intTarget + 1;
	let iterations = 0;

	function search(index: number, remaining: number): void {
		if (bestRemaining === 0 || iterations >= maxIterations) {
			return;
		}
		if (remaining === 0 || index >= items.length) {
			if (remaining < bestRemaining) {
				bestRemaining = remaining;
				for (let i = 0; i < items.length; i++) {
					best[i] = i < index ? current[i] : 0;
				}
			}
			return;
		}

		iterations += 1;
		const w = intWeights[index];
		const maxCount = Math.min(maxCounts[index], w > 0 ? Math.floor(remaining / w) : 0);

		for (let count = maxCount; count >= 0; count--) {
			const newRemaining = remaining - count * w;
			if (newRemaining - maxFrom[index + 1] >= bestRemaining) {
				continue;
			}
			current[index] = count;
			search(index + 1, newRemaining);
			if (bestRemaining === 0) {
				return;
			}
		}
	}

	search(0, intTarget);
	return best;
}

/**
 * Sum of `item.value * count` for each selected count (float arithmetic).
 */
export function boundedSumTotal(
	items: readonly BoundedKnapsackItem[],
	counts: readonly number[],
): number {
	return items.reduce((sum, item, i) => sum + item.value * (counts[i] ?? 0), 0);
}
