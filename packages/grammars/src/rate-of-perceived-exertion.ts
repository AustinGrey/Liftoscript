export enum STANDARD_RPE {
	MAX_10 = 10,
	EXTREME_9 = MAX_10 - 1,
	HEAVY_8 = MAX_10 - 2,
	MODERATE = MAX_10 - 3,
	COMFORTABLE = MAX_10 - 4,
	LIGHT = MAX_10 - 5,
	WARMUP = MAX_10 - 6,
}

/**
Rate of Perceived Exertion (RPE) is a scale that helps regulate the intensity of exercise. It ranges from 1 to 10, with each number representing a different level of effort. Here's a breakdown of what each RPE level means:

- 10: Maximum effort. No additional repetitions could be completed, and you could not add more weight.
- 9: Extremely challenging. You could have completed exactly one more repetition.
- 8: Heavy but controlled. You could have completed exactly two more repetitions.
- 7: Moderately difficult. You could have completed exactly three more repetitions.
- 6: A comfortable working weight. You could have completed four more repetitions.
- 5 and below: Warm-up weights or technique-focused sets.

This module provides functions for working with RPE values
 @todo make a branded type so people can't pass anything <0 or >10 ?
 */
export type RPE = STANDARD_RPE | number;

/**
 * Calculates the Rate of Perceived Exertion (RPE) multiplier.
 * @param reps The number of repetitions
 * @param rpe The RPE to target
 */
export function rpeMultiplier(reps: number, rpe: RPE = 10): number {
	if (reps === 1 && rpe === 10) {
		return 1;
	}
	reps = Math.max(Math.min(reps, 24), 1);
	rpe = Math.max(Math.min(rpe, 10), 1);

	const x = 10.0 - rpe + (reps - 1);
	if (x >= 16) {
		return 0.5;
	}
	// The formula is taken from
	// https://gitlab.com/openpowerlifting/plsource/-/blob/ba5194be6daa08d082bb1b7959d6f47b82e7802c/static/rpe-calc/index.html#L224
	const intersection = 2.92;
	if (x <= intersection) {
		const a = 0.347619;
		const b = -4.60714;
		const c = 99.9667;
		return (a * x * x + b * x + c) / 100;
	} else {
		const m = -2.64249;
		const b = 97.0955;
		return (m * x + b) / 100;
	}
}
