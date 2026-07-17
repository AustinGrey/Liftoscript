import { describe, expect, it, type TestFunction } from "vite-plus/test";
import {
	PlannerTestUtils_finish as newSystemFinish,
	PlannerTestUtils_changeExercise as newSystemChangeExercise,
	PlannerTestUtils_changeWeight as newSystemChangeWeight,
	PlannerProgram_switchToUnit,
} from "./newPlannerSystemTestUtils.ts";
import { asProgramScript } from "@/planner/display.ts";
import {
	PlannerProgram_evaluate as newPlannerProgram_evaluate,
	PlannerProgram_evaluateText as newPlannerProgram_evaluateText,
} from "@/planner/evaluators";
import { build, type IWeight } from "@/quantities/weight.ts";
import type { IStats } from "@/fitness-stats";
import { type ISettings, Settings_build } from "@/user-settings";
import type { IExerciseTypeKey } from "@/exercises";

type PlannerTestCase = {
	plan: string;
	/**
	 * Information about what has been completed, to evaluate the next plan
	 */
	completed: {
		reps: number[][];
		weights?: IWeight[][];
	};
	/**
	 * The evaluation settings
	 */
	settings?: ISettings;
	/**
	 * The user's stats at the time of plan evaluation
	 * New System
	 */
	stats?: IStats;
	/**
	 * The plan that results from evaluating the plan
	 */
	result: string;
	/**
	 * Which program day to finish (1-based)
	 */
	dayIndex?: number;
};
function makeTest(c: PlannerTestCase): TestFunction {
	return () => {
		const { program: newSystemProgram } = newSystemFinish(
			c.plan,
			{
				completedReps: c.completed.reps,
				completedWeights: c.completed.weights,
			},
			c.settings,
			c.stats,
			c.dayIndex,
		);
		if (!newSystemProgram.planner) {
			expect.fail("New system failed to produce a program planner.");
		}
		const newSystemNewText = asProgramScript(newSystemProgram.planner, {
			addExtraSpace: true,
		});
		expect
			.soft(newSystemNewText, "New system failed to produce the expected result")
			.to.equal(c.result);
	};
}

describe("Plan Evaluator", () => {
	it(
		"updates weight after completing",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb)`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 105lb / progress: lp(5lb)


`,
		}),
	);
	it(
		"updates empty weight after completing",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5 / progress: lp(5lb)`,
			completed: {
				reps: [[5]],
				weights: [[build(100, "lb")]],
			},
			result: `# Week 1
## Day 1
Squat / 1x5 / 105lb / progress: lp(5lb)


`,
		}),
	);
	it(
		"keeps reusing the progress if reused in previous instance",
		makeTest({
			plan: `# Week 1
## Day 1
main / used: none / 1x5 / 100lb /  progress: custom(increment: 5lb) {~
  weights += 5lb
~}

Squat / ...main

## Day 2
Squat / 1x5 / 100lb`,
			completed: {
				reps: [[5]],
				weights: [[build(100, "lb")]],
			},
			result: `# Week 1
## Day 1
main / used: none / 1x5 / 100lb / progress: custom(increment: 5lb) {~
  weights += 5lb
~}

Squat / ...main / 105lb

## Day 2
Squat / 1x5 / 105lb


`,
		}),
	);

	it(
		"increases num of sets",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5 / 2x8 / 100lb / progress: custom() {~
  numberOfSets += 1
~}

## Day 2
Squat / 3x5 / 4x8 / 100lb
`,
			completed: {
				reps: [[5]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 3x8 / 100lb / progress: custom() {~
  numberOfSets += 1
~}

## Day 2
Squat / 4x5 / 5x8 / 100lb


`,
		}),
	);

	it(
		"decreases num of sets on specific set variation",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5 / 2x8 / 100lb / progress: custom() {~
  numberOfSets[2:*:2] -= 2
~}

# Week 2
## Day 1
Squat / 3x5 / 4x8 / 100lb
`,
			completed: {
				reps: [[5]],
			},
			result: `# Week 1
## Day 1
Squat / 1x5 / 2x8 / 100lb / progress: custom() {~
  numberOfSets[2:*:2] -= 2
~}


# Week 2
## Day 1
Squat / 3x5 / 2x8 / 100lb


`,
		}),
	);

	it(
		"deletes all the sets",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x5 / 100lb / progress: custom() {~
  numberOfSets -= 6
~}`,
			completed: {
				reps: [[5]],
			},
			result: `# Week 1
## Day 1
Squat / 0x5 / 100lb / progress: custom() {~
  numberOfSets -= 6
~}


`,
		}),
	);

	it(
		"properly fills program, completed and current number of sets",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 / progress: custom(pns: 0, ns: 0, cns: 0) {~
  state.pns = programNumberOfSets
  state.ns = numberOfSets
  state.cns = completedNumberOfSets
~} / update: custom() {~
  if (setIndex == 0) {
    numberOfSets = 5
  }
~}`,
			completed: {
				reps: [[8, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8 / update: custom() {~
  if (setIndex == 0) {
    numberOfSets = 5
  }
~} / progress: custom(pns: 3, ns: 5, cns: 2) {~
  state.pns = programNumberOfSets
  state.ns = numberOfSets
  state.cns = completedNumberOfSets
~}


`,
		}),
	);

	it(
		"configures all the new sets",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x5 / 100lb / progress: custom() {~
  numberOfSets = 5
  weights[4] = 110lb
  weights[5] = 110lb
  reps[4] = 8
  reps[5] = 8
~}`,
			completed: {
				reps: [[5]],
			},
			result: `# Week 1
## Day 1
Squat / 3x5 100lb, 2x8 110lb / progress: custom() {~
  numberOfSets = 5
  weights[4] = 110lb
  weights[5] = 110lb
  reps[4] = 8
  reps[5] = 8
~}


`,
		}),
	);

	it(
		"updates lp after completing",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb, 2, 0)`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb, 2, 1)


`,
		}),
	);

	it(
		"updates lp and weight after failing",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: lp(5lb, 1, 0, 10lb, 2, 1)`,
			completed: {
				reps: [[5, 3]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 90lb / progress: lp(5lb, 1, 0, 10lb, 2, 0)


`,
		}),
	);

	it(
		"properly compacts multiple empty lines in-between descriptions",
		makeTest({
			plan: `# Week 1
## Day 1
// Hey

/// Sup


// Hey hey
Squat / 2x5 100lb`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
/// Sup
// Hey

// Hey hey
Squat / 2x5 / 100lb


`,
		}),
	);

	it(
		"compacts repeated exercises",
		makeTest({
			plan: `# Week 1
## Day 1
Squat[1-2] / 2x5

# Week 2
## Day 1

# Week 3
## Day 1
Squat / 2x5
`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
Squat[1-2] / 2x5


# Week 2
## Day 1



# Week 3
## Day 1
Squat / 2x5


`,
		}),
	);

	it(
		"does not compact repeated exercises if originally didn't use ranges",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5

# Week 2
## Day 1
Squat / 2x5

# Week 3
## Day 1
Squat / 2x5
`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5


# Week 2
## Day 1
Squat / 2x5


# Week 3
## Day 1
Squat / 2x5


`,
		}),
	);

	it(
		"splits and compacts after mid-program progression",
		makeTest({
			plan: `# Week 1
## Day 1
Squat[1-5] / 2x5 / progress: custom() {~
  weights[3:*:*:*] += 10lb
~}
Bench Press[1-5] / 2x5

# Week 2
## Day 1

# Week 3
## Day 1

# Week 4
## Day 1

# Week 5
## Day 1
`,
			completed: {
				reps: [
					[5, 5],
					[5, 5],
				],
			},
			result: `# Week 1
## Day 1
Squat[1-2] / 2x5 / progress: custom() {~
  weights[3:*:*:*] += 10lb
~}
Bench Press[1-5] / 2x5


# Week 2
## Day 1



# Week 3
## Day 1
Squat / 2x5 / 10lb


# Week 4
## Day 1
Squat[4-5] / 2x5


# Week 5
## Day 1



`,
		}),
	);

	it(
		"override weights",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 200lb / 60s / progress: dp(5lb, 3, 8)
Bench Press[1-5] / ...Squat / 120lb / progress: lp(5lb)
`,
			completed: {
				reps: [
					[5, 3],
					[5, 3],
				],
			},
			result: `# Week 1
## Day 1
Squat / 1x6 100lb, 1x4 200lb / 60s / progress: dp(5lb, 3, 8)
Bench Press / ...Squat / 1x5, 1x3 / 125lb / progress: lp(5lb)


`,
		}),
	);

	it(
		"should work with negative weights",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 / -40lb / progress: lp(5lb)
Bench Press / 2x3-5 -20lb / progress: lp(-5lb)
`,
			completed: {
				reps: [
					[5, 5],
					[5, 5],
				],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / -35lb / progress: lp(5lb)
Bench Press / 2x3-5 / -25lb / progress: lp(-5lb)


`,
		}),
	);

	it(
		"updates group states",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 100lb / progress: custom() {~
  state[4].foo = 5
~}
Bench Press / id: tags(4) / 2x5 100lb / progress: custom(foo: 2) {~
  reps += state.foo
~}
`,
			completed: {
				reps: [
					[5, 5],
					[5, 5],
				],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 100lb / progress: custom() {~
  state[4].foo = 5
~}
Bench Press / 2x10 / 100lb / id: tags(4) / progress: custom(foo: 5) {~
  reps += state.foo
~}


`,
		}),
	);

	it(
		"properly handles askweights",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5 100lb+, 1x3 100lb / 60s / progress: lp(5lb)
Bench Press / ...Squat / progress: lp(5lb)
`,
			completed: {
				reps: [
					[5, 3],
					[5, 3],
				],
			},
			result: `# Week 1
## Day 1
Squat / 1x5 105lb+, 1x3 105lb / 60s / progress: lp(5lb)
Bench Press / ...Squat


`,
		}),
	);

	it(
		"parses ?+ as askWeight without explicit weight",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 @8 ?+`,
			completed: {
				reps: [[8, 8, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8 / ?+ @8


`,
		}),
	);

	it(
		"handles ?+ with lp() progress",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 @8 ?+ / progress: lp(5lb)`,
			completed: {
				reps: [[8, 8, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8 / 102.5lb+ @8 / progress: lp(5lb)


`,
		}),
	);

	it(
		"handles per-set ?+ mixed with non-askWeight sets",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x8 @8 ?+, 1x5 100lb`,
			completed: {
				reps: [[8, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 1x8 ?+ @8, 1x5 100lb


`,
		}),
	);

	it(
		"use loops",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 100lb / progress: custom() {~
  for (var.i in completedReps) {
    if (completedReps[var.i] >= reps[var.i]) {
      weights[var.i] = weights[var.i] + 5lb
    }
  }
~}
`,
			completed: {
				reps: [[8, 6, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 1x8 105lb, 1x8 100lb, 1x8 105lb / progress: custom() {~
  for (var.i in completedReps) {
    if (completedReps[var.i] >= reps[var.i]) {
      weights[var.i] = weights[var.i] + 5lb
    }
  }
~}


`,
		}),
	);

	it(
		"keeps overridden dp progress",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100% 100s / warmup: none
Bench Press / ...Squat / 3x10 / 30lb / progress: dp(3lb, 8, 12)`,
			completed: {
				reps: [[10, 10, 10]],
			},
			result: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100% 100s / warmup: none
Bench Press / ...Squat / 3x11 / 30lb / progress: dp(3lb, 8, 12)


`,
		}),
	);

	it(
		"dp with range - narrows minReps on failure",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8-12 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[9, 10, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 1x10-12, 1x11-12, 1x9-12 / 100lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"dp with range - increases weight on success",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8-12 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[12, 12, 12]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8-12 / 105lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"dp without range - increases reps then weight",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[8, 8, 8]],
			},
			result: `# Week 1
## Day 1
Squat / 3x9 / 100lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"dp without range - resets reps and increases weight at maxReps",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x12 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[12, 12, 12]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8 / 105lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"dp without range - skips reps when over-performing",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[11, 10, 9]],
			},
			result: `# Week 1
## Day 1
Squat / 1x12, 1x11, 1x10 / 100lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"dp without range - increases weight when over-performing past maxReps",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x8 / 100lb / progress: dp(5lb, 8, 12)`,
			completed: {
				reps: [[15, 13, 12]],
			},
			result: `# Week 1
## Day 1
Squat / 3x8 / 105lb / progress: dp(5lb, 8, 12)


`,
		}),
	);

	it(
		"keeps customized warmups",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x4-6 / 80% @8+ 180s / warmup: 2x10 50%, 1x4 70%`,
			completed: {
				reps: [[6, 6, 6]],
			},
			result: `# Week 1
## Day 1
Squat / 3x4-6 / 80% @8+ 180s / warmup: 2x10 50%, 1x4 70%


`,
		}),
	);

	it(
		"keeps overridden update",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100% 100s / warmup: none
Bench Press / ...Squat / 3x10 / 30lb / update: custom() {~ weights += 5lb ~}`,
			completed: {
				reps: [[10, 10, 10]],
			},
			result: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100% 100s / warmup: none
Bench Press / ...Squat / 3x10 / 30lb / update: custom() {~ weights += 5lb ~}


`,
		}),
	);

	it(
		"keeps @0 RPE",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x5, 1x5+ @0+ / 100lb`,
			completed: {
				reps: [[2]],
			},
			result: `# Week 1
## Day 1
Squat / 1x5, 1x5+ @0+ / 100lb


`,
		}),
	);

	it(
		"keeps reused progress from another exercise with set reuse",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x1 100lb / used: none / progress: custom() {~
  weights += 5lb
~}
Bench Press / used: none / 1x2 100lb
Chest Fly / ...Bench Press / 120lb / progress: custom(foo: 1) { ...Squat }`,
			completed: {
				reps: [[2]],
			},
			result: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100lb / progress: custom() {~
  weights += 5lb
~}
Bench Press / used: none / 1x2 / 100lb
Chest Fly / ...Bench Press / 125lb / progress: custom(foo: 1) { ...Squat }


`,
		}),
	);

	it(
		"keeps reused update from another exercise with set reuse",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x1 100lb / used: none / update: custom() {~
  weights += 5lb
~}
Bench Press / used: none / 1x2 100lb
Chest Fly / ...Bench Press / 120lb / update: custom() { ...Squat }`,
			completed: {
				reps: [[2]],
			},
			result: `# Week 1
## Day 1
Squat / used: none / 1x1 / 100lb / update: custom() {~
  weights += 5lb
~}
Bench Press / used: none / 1x2 / 100lb
Chest Fly / ...Bench Press / 120lb / update: custom() { ...Squat }


`,
		}),
	);

	it(
		"use templates",
		makeTest({
			plan: `# Week 1
## Day 1
tmp: Squat[1-5] / 2x5 / used: none / progress: custom() {~
  weights[3:*:*:*] += 10lb
~}
Squat[1-5] / ...tmp: Squat / progress: custom() { ...tmp: Squat }
Bench Press[1-5] / ...tmp: Squat / progress: custom() { ...tmp: Squat }

# Week 2
## Day 1

# Week 3
## Day 1

# Week 4
## Day 1

# Week 5
## Day 1
`,
			completed: {
				reps: [
					[5, 5],
					[5, 5],
				],
			},
			result: `# Week 1
## Day 1
tmp: Squat[1-5] / used: none / 2x5 / progress: custom() {~
  weights[3:*:*:*] += 10lb
~}
Squat[1-2] / ...tmp: Squat
Bench Press[1-2] / ...tmp: Squat


# Week 2
## Day 1



# Week 3
## Day 1
Squat / ...tmp: Squat / 10lb
Bench Press / ...tmp: Squat / 10lb


# Week 4
## Day 1
Squat[4-5] / ...tmp: Squat
Bench Press[4-5] / ...tmp: Squat


# Week 5
## Day 1



`,
		}),
	);

	it(
		"preserves order of exercises",
		makeTest({
			plan: `# Week 1
## Day 1
tmp: Squat[1-5] / 2x5 / used: none
Squat[1-5, 3] / ...tmp: Squat 
Bench Press[1-5,2] / ...tmp: Squat

# Week 2
## Day 1
Bicep Curl[2-5] / 5x5

# Week 3
## Day 1

# Week 4
## Day 1

# Week 5
## Day 1
`,
			completed: {
				reps: [
					[5, 5],
					[5, 5],
				],
			},
			result: `# Week 1
## Day 1
tmp: Squat[1-5] / used: none / 2x5
Squat[3,1-5] / ...tmp: Squat
Bench Press[2] / ...tmp: Squat


# Week 2
## Day 1
Bicep Curl[2-5] / 5x5
Bench Press[2,2-5] / ...tmp: Squat


# Week 3
## Day 1



# Week 4
## Day 1



# Week 5
## Day 1



`,
		}),
	);

	it(
		"dereuses the custom progress when diverges",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x2 100lb / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat
`,
			completed: {
				reps: [[2], [1]],
			},
			result: `# Week 1
## Day 1
Squat / 1x2 / 105lb / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat / 100lb / progress: custom(increase: 2.5lb) { ...Squat }


`,
		}),
	);

	it(
		"uses the inherited state for update blocks",
		makeTest({
			plan: `# Week 1
## Day 1
Leg Press / 2x2 100lb / progress: custom(foo: 1) {~
  state.foo += 1
~}
Squat / 2x2 200lb / update: custom() {~
  state.foo += 1
~} / progress: custom() { ...Leg Press }
`,
			completed: {
				reps: [
					[2, 2],
					[2, 2],
				],
			},
			result: `# Week 1
## Day 1
Leg Press / 2x2 / 100lb / progress: custom(foo: 2) {~
  state.foo += 1
~}
Squat / 2x2 / 200lb / update: custom() {~
  state.foo += 1
~} / progress: custom(foo: 3) { ...Leg Press }


`,
		}),
	);

	it(
		"doesn't combine different user prompted vars",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x1 / 100% / progress: custom(foo: 0) {~

~}
Bench Press / ...Squat / progress: custom(foo+: 0) { ...Squat }
`,
			completed: {
				reps: [[1], [1]],
			},
			result: `# Week 1
## Day 1
Squat / 1x1 / 100% / progress: custom(foo: 0) {~

~}
Bench Press / ...Squat / progress: custom(foo+: 0) { ...Squat }


`,
		}),
	);

	it(
		"doesn't dereuse if the custom progress still matches",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x2 100lb / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat
`,
			completed: {
				reps: [[2], [2]],
			},
			result: `# Week 1
## Day 1
Squat / 1x2 / 105lb / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat


`,
		}),
	);

	it(
		"combine reuse if the custom progress starts to match",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x2 100lb / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat / progress: custom(increase: 2.5lb) { ...Squat }
`,
			completed: {
				reps: [[1], [2]],
			},
			result: `# Week 1
## Day 1
Squat / 1x2 / 100lb / progress: custom(increase: 2.5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
  } else {
    state.increase = 2.5lb
  }
~}
Bench Press / ...Squat / 105lb


`,
		}),
	);

	it(
		"dereuse lp in case of mismatch",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x2 100lb / progress: lp(5lb, 2, 0, 10lb, 2, 0)
Bench Press / ...Squat
`,
			completed: {
				reps: [[1], [2]],
			},
			result: `# Week 1
## Day 1
Squat / 1x2 / 100lb / progress: lp(5lb, 2, 0, 10lb, 2, 1)
Bench Press / ...Squat / progress: lp(5lb, 2, 1, 10lb, 2, 0)


`,
		}),
	);

	it(
		"combine lp in case it matches again",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x2 100lb / progress: lp(5lb)
Bench Press[1-3] / ...Squat

# Week 2
## Day 1
Squat / 1x3 100lb

# Week 3
## Day 1
Squat / 1x4 100lb


`,
			completed: {
				reps: [[3], [2]],
			},
			dayIndex: 2,
			result: `# Week 1
## Day 1
Squat / 1x2 / 105lb / progress: lp(5lb)
Bench Press[1-3] / ...Squat / 100lb


# Week 2
## Day 1
Squat / 1x3 / 105lb


# Week 3
## Day 1
Squat / 1x4 / 105lb


`,
		}),
	);

	it(
		"updates the state from update scripts",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x1 100lb / update: custom() {~
  state.foo = 3
  state.zzz = 5
~} / progress: custom(foo: 0, bar: 0, zzz: 0) {~
  state.bar = 4
  state.zzz = 6
~}
`,
			completed: {
				reps: [[1], [1]],
			},
			result: `# Week 1
## Day 1
Squat / 1x1 / 100lb / update: custom() {~
  state.foo = 3
  state.zzz = 5
~} / progress: custom(foo: 3, bar: 4, zzz: 6) {~
  state.bar = 4
  state.zzz = 6
~}


`,
		}),
	);

	it(
		"allows reusing progress of exercise that reuses original exercise sets, but has custom progress",
		makeTest({
			plan: `# Week 1
## Day 1

Squat / 1x8 100lb / progress: custom(foo: 10lb) { ...Bench Press }
Bench Press / ...Squat / warmup: none / progress: custom(foo: 5lb, blah: 10lb) {~
  weights += state.foo + state.blah
~}
`,
			completed: {
				reps: [[8]],
			},
			result: `# Week 1
## Day 1
Squat / 1x8 / 120lb / progress: custom(foo: 10lb) { ...Bench Press }
Bench Press / ...Squat / 100lb / warmup: none / progress: custom(foo: 5lb, blah: 10lb) {~
  weights += state.foo + state.blah
~}


`,
		}),
	);

	it(
		"uses the right exercise for reuse",
		makeTest({
			plan: `# Week 1
## Day 1
Pec Deck / 1x1 100lb / progress: custom() { ...Squat }
Squat, Smith Machine / 1x1 100lb / progress: custom() { ...Squat }

## Day 2
Squat / 1x1 100lb / progress: custom() {~ weights += 5lb ~}
`,
			completed: {
				reps: [[1], [1]],
			},
			result: `# Week 1
## Day 1
Pec Deck / 1x1 / 105lb / progress: custom() { ...Squat }
Squat, Smith Machine / 1x1 / 105lb / progress: custom() { ...Squat }

## Day 2
Squat / 1x1 / 100lb / progress: custom() {~ weights += 5lb ~}


`,
		}),
	);

	it(
		"preserves the day descriptions after finishing the workout",
		makeTest({
			plan: `# Week 1
// A: Day 1
## Day 1
Squat / 2x5 / 100lb

## Day 2
Bench Press / 2x5 / 100lb

// Week 2
# Week 2

## Day 1
Squat / 2x5 / 100lb

// B: Day 2
## Day 2
Bench Press / 2x5 / 100lb

# Week 3
//
## Day 1
Squat / 2x5 / 100lb

## Day 2
Bench Press / 2x5 / 100lb

# Week 4
## Day 1
Squat / 2x5 / 100lb

//
## Day 2
Bench Press / 2x5 / 100lb

`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
// A: Day 1
## Day 1
Squat / 2x5 / 100lb

## Day 2
Bench Press / 2x5 / 100lb


// Week 2
# Week 2
## Day 1
Squat / 2x5 / 100lb

// B: Day 2
## Day 2
Bench Press / 2x5 / 100lb


# Week 3
// 
## Day 1
Squat / 2x5 / 100lb

## Day 2
Bench Press / 2x5 / 100lb


# Week 4
## Day 1
Squat / 2x5 / 100lb

// 
## Day 2
Bench Press / 2x5 / 100lb


`,
		}),
	);

	it(
		"preserves triple comments at the end of the day",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 2x5 / 100lb
/// Some stuff

// More stuff
## Day 2
Bench Press / 2x5 / 100lb

`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 2x5 / 100lb
/// Some stuff

// More stuff
## Day 2
Bench Press / 2x5 / 100lb


`,
		}),
	);

	it(
		"properly sets up day data on repeated exercises",
		makeTest({
			plan: `# Week 1
## Day 1
## Day 2
Squat[1-3] / 1x5 / 200lb / warmup: none / progress: custom(week: 1, dayInWeek: 1, day: 1) {~
  state.day = day
  state.dayInWeek = dayInWeek
  state.week = week
~}
# Week 2
## Day 1
## Day 2
# Week 3
## Day 1
## Day 2

`,
			completed: {
				reps: [[5]],
			},
			dayIndex: 4,
			result: `# Week 1
## Day 1


## Day 2
Squat[1-3] / 1x5 / 200lb / warmup: none / progress: custom(week: 2, dayInWeek: 2, day: 4) {~
  state.day = day
  state.dayInWeek = dayInWeek
  state.week = week
~}


# Week 2
## Day 1


## Day 2



# Week 3
## Day 1


## Day 2



`,
		}),
	);

	it(
		"preserves end of exercise properly",
		makeTest({
			plan: `/// Some stuff

// Week description

# Week 1
## Day 1
Squat / 2x5 / 100lb
/// Some stuff

/// More

// More stuff

/// Triple comment

## Day 2
/// Triple Comment

// Description


/// More stuff
Bench Press / 2x5 / 100lb

`,
			completed: {
				reps: [[5, 5]],
			},
			result: `// Week description
# Week 1
## Day 1
Squat / 2x5 / 100lb
/// Some stuff

/// More

// More stuff
## Day 2
/// Triple Comment

/// More stuff
// Description
Bench Press / 2x5 / 100lb


`,
		}),
	);

	it(
		"increment() weight",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x10 / 100lb / progress: custom() {~
  weights[1] = increment(weights[1])
~}`,
			completed: {
				reps: [[10]],
			},
			settings: (() => {
				const settings = Settings_build();
				const equipment = settings.gyms[0].equipment;
				equipment.barbell!.plates = [
					{ weight: build(10, "lb"), num: 2 },
					{ weight: build(25, "lb"), num: 2 },
					{ weight: build(45, "lb"), num: 2 },
				];
				settings.exerciseData["squat_barbell" as IExerciseTypeKey] = {
					equipment: { default: "barbell" },
				};
				return settings;
			})(),
			result: `# Week 1
## Day 1
Squat / 1x10 / 115lb / progress: custom() {~
  weights[1] = increment(weights[1])
~}


`,
		}),
	);

	it(
		"increment() number",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x10 / 100lb / progress: custom() {~
  weights[1] = increment(105)
~}`,
			completed: {
				reps: [[10]],
			},
			settings: (() => {
				const settings = Settings_build();
				const equipment = settings.gyms[0].equipment;
				equipment.barbell!.isFixed = true;
				equipment.barbell!.fixed = [build(45, "lb"), build(100, "lb"), build(120, "lb")];
				settings.exerciseData["squat_barbell" as IExerciseTypeKey] = {
					equipment: { default: "barbell" },
				};
				return settings;
			})(),
			result: `# Week 1
## Day 1
Squat / 1x10 / 120lb / progress: custom() {~
  weights[1] = increment(105)
~}


`,
		}),
	);

	it(
		"decrement() percentage",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x10 / 100lb / progress: custom() {~
  weights[1] = decrement(50%)
~}`,
			completed: {
				reps: [[10]],
			},
			result: `# Week 1
## Day 1
Squat / 1x10 / 49% / progress: custom() {~
  weights[1] = decrement(50%)
~}


`,
		}),
	);

	it(
		"properly uses bodyweight",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 1x10 / 100lb / progress: custom() {~
  weights = bodyweight
~}`,
			completed: {
				reps: [[10]],
			},
			settings: {
				...Settings_build(),
				graphOptions: {
					weight: {
						movingAverageWindowSize: 3,
					},
				},
			},
			stats: {
				weight: [
					{ value: build(200, "lb"), timestamp: 10 },
					{ value: build(220, "lb"), timestamp: 30 },
					{ value: build(210, "lb"), timestamp: 20 },
					{ value: build(240, "lb"), timestamp: 50 },
					{ value: build(230, "lb"), timestamp: 40 },
				],
				neck: [],
				shoulders: [],
				bicepLeft: [],
				bicepRight: [],
				forearmLeft: [],
				forearmRight: [],
				chest: [],
				waist: [],
				hips: [],
				thighLeft: [],
				thighRight: [],
				calfLeft: [],
				calfRight: [],
				bodyfat: [],
			},
			result: `# Week 1
## Day 1
Squat / 1x10 / 230lb / progress: custom() {~
  weights = bodyweight
~}


`,
		}),
	);

	it(
		"template reuses progress of another template",
		makeTest({
			plan: `# Week 1
## Day 1
t1 / used: none / 3x5 100lb / progress: custom() {~
  weights += 5lb
~}
t2 / used: none / 2x5 120lb / progress: custom() { ...t1 }
Squat / ...t2

`,
			completed: {
				reps: [[5, 5]],
			},
			result: `# Week 1
## Day 1
t1 / used: none / 3x5 / 100lb / progress: custom() {~
  weights += 5lb
~}
t2 / used: none / 2x5 / 120lb / progress: custom() { ...t1 }
Squat / ...t2 / 125lb


`,
		}),
	);

	it(
		"updates isAMRAP, logRPE and askWeight",
		makeTest({
			plan: `# Week 1
## Day 1
Squat / 3x5 / @8 100lb / progress: custom() {~
  amraps[1] = 1
  amraps[2] = 0
  logrpes[2] = 1
  askweights[3] = 1
~}`,
			completed: {
				reps: [[5, 5, 5]],
			},
			result: `# Week 1
## Day 1
Squat / 1x5+ 100lb @8, 1x5 100lb @8+, 1x5 100lb+ @8 / progress: custom() {~
  amraps[1] = 1
  amraps[2] = 0
  logrpes[2] = 1
  askweights[3] = 1
~}


`,
		}),
	);

	it(
		"keeps description [1:1] reuse syntax if different day or week",
		makeTest({
			plan: `# Week 1
## Day 1
// Description
Squat / 1x1

# Week 2
## Day 1
// ...Squat[1:1]
Bench Press / 1x1`,
			completed: {
				reps: [[1]],
			},
			result: `# Week 1
## Day 1
// Description
Squat / 1x1


# Week 2
## Day 1
// ...Squat[1:1]
Bench Press / 1x1


`,
		}),
	);

	it(
		"omits [1:1] description reuse syntax if on the same week",
		makeTest({
			plan: `# Week 1
## Day 1
// Description
Squat / 1x1

## Day 2
// ...Squat
Bench Press / 1x1`,
			completed: {
				reps: [[1]],
			},
			result: `# Week 1
## Day 1
// Description
Squat / 1x1

## Day 2
// ...Squat
Bench Press / 1x1


`,
		}),
	);

	it(
		"adds [1:1] description reuse syntax if there's 2 same exercises",
		makeTest({
			plan: `# Week 1
## Day 1
// Description
Squat / 1x1

## Day 2
// Description 2
Squat / 1x1

## Day 3
// ...Squat[1:2]
Bench Press / 1x1`,
			completed: {
				reps: [[1]],
			},
			result: `# Week 1
## Day 1
// Description
Squat / 1x1

## Day 2
// Description 2
Squat / 1x1

## Day 3
// ...Squat[1:2]
Bench Press / 1x1


`,
		}),
	);

	it(
		"omits [1:1] description reuse syntax if exercise description is repeated on the same week",
		makeTest({
			plan: `# Week 1
## Day 1

// Description
Squat / 1x1

# Week 2
## Day 1

Squat / 1x1
// ...Squat
Bench Press / 1x1`,
			completed: {
				reps: [[1]],
			},
			result: `# Week 1
## Day 1
// Description
Squat / 1x1


# Week 2
## Day 1
// Description
Squat / 1x1
// ...Squat
Bench Press / 1x1


`,
		}),
	);
});

describe("Planner", () => {
	it("switches toe program from lb to kg", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 100lb / 2x8 150kg / progress: custom(increase: 5lb) {~
  if (completedReps >= reps) {
    weights += 5lb
    state.increase += 10lb
  }
~}

## Day 2
Squat / 3x5 / 4x8 / 100lb
`;
		const settings = { ...Settings_build(), units: "kg" as const };
		const expected = `# Week 1
## Day 1
Squat / 1x5 47.5kg / 2x8 152.5kg / progress: custom(increase: 7.5kg) {~
  if (completedReps >= reps) {
    weights += 2.5kg
    state.increase += 5kg
  }
~}

## Day 2
Squat / 3x5 / 4x8 / 47.5kg


`;

		const { program: newSystemProgram } = newSystemFinish(
			programText,
			{ completedReps: [[5]] },
			settings,
		);
		if (!newSystemProgram.planner) {
			expect.fail("New system failed to produce a program planner.");
		}
		const newKgProgram = PlannerProgram_switchToUnit(newSystemProgram.planner, settings);
		expect
			.soft(
				asProgramScript(newKgProgram, { addExtraSpace: true }),
				"New system failed to produce the expected result",
			)
			.to.equal(expected);
	});

	it("replace exercise", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 200lb / 60s / progress: lp(5lb)

## Day 2
Bench Press / 3x8 150lb / progress: dp(5lb, 8, 12)
`;
		const expected = `# Week 1
## Day 1
Overhead Press / 1x5 100lb, 1x3 200lb / 60s / progress: lp(5lb)

## Day 2
Bench Press / 3x8 / 150lb / progress: dp(5lb, 8, 12)`;

		const newText = newSystemChangeExercise(programText, "Squat", {
			id: "overheadPress",
			equipment: "barbell",
		}).trim();
		expect.soft(newText, "New system failed to produce the expected result").to.equal(expected);
	});

	it("replace exercise to the one that already exists in the program", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 200lb / 60s / progress: lp(5lb)

## Day 2
Bench Press / 3x8 / progress: dp(5lb, 8, 12)
`;
		const expectedContain = `Bench Press / 1x5 100lb, 1x3 200lb / 60s / progress: lp(5lb)

## Day 2
Bench Press / 3x8 / progress: dp(5lb, 8, 12)`;

		const newText = newSystemChangeExercise(programText, "Squat", {
			id: "benchPress",
			equipment: "barbell",
		}).trim();
		expect
			.soft(newText, "New system failed to contain the expected result")
			.to.contain(expectedContain);
		expect
			.soft(newText.split("\n")[2], "New system template line")
			.to.match(/^[a-z]{3}: Bench Press/);
	});

	it("properly update weights", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 200lb / 60s / progress: lp(5lb)
`;
		const expected = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 250lb / 60s / progress: lp(5lb)`;

		const newText = newSystemChangeWeight(programText, weightChanges => {
			weightChanges[1].weight = build(250, "lb");
			return weightChanges;
		});
		expect
			.soft(newText.trim(), "New system failed to produce the expected result")
			.to.equal(expected);
	});

	it("properly update global weights", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 200lb / 80lb / 60s / progress: lp(80lb)
`;
		const expected = `# Week 1
## Day 1
Squat / 1x5, 1x3 / 100lb 60s / progress: lp(80lb)`;

		const newText = newSystemChangeWeight(programText, weightChanges => {
			weightChanges[0].weight = build(100, "lb");
			return weightChanges;
		});
		expect
			.soft(newText.trim(), "New system failed to produce the expected result")
			.to.equal(expected);
	});

	it("properly update default weights", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x5 50lb, 1x3 80lb / 60s / progress: lp(5lb)
`;
		const expected = `# Week 1
## Day 1
Squat / 1x5 100lb, 1x3 150lb / 60s / progress: lp(5lb)`;

		const newText = newSystemChangeWeight(programText, weightChanges => {
			weightChanges[0].weight = build(100, "lb");
			weightChanges[1].weight = build(150, "lb");
			return weightChanges;
		});
		expect
			.soft(newText.trim(), "New system failed to produce the expected result")
			.to.equal(expected);
	});

	it("doesn't show an error if original exercise progress reuses another exercise but overrides progress", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x1 100lb / progress: custom(increment: 10lb) { ...Bench Press }
Bench Press / ...Squat / progress: custom() {~ ~}
`;

		const newPlanner = {
			name: "MyProgram",
			weeks: newPlannerProgram_evaluateText(programText),
		};
		const newEvaluatedWeeks = newPlannerProgram_evaluate(
			newPlanner,
			Settings_build(),
		).evaluatedWeeks;
		expect.soft(newEvaluatedWeeks[0][0].success, "New system should succeed").toBe(true);
	});

	it("doesn't show an error if original exercise update reuses another exercise but overrides update", () => {
		const programText = `# Week 1
## Day 1
Squat / 1x1 100lb / update: custom() { ...Bench Press }
Bench Press / ...Squat / update: custom() {~ ~}
`;

		const newPlanner = {
			name: "MyProgram",
			weeks: newPlannerProgram_evaluateText(programText),
		};
		const newEvaluatedWeeks = newPlannerProgram_evaluate(
			newPlanner,
			Settings_build(),
		).evaluatedWeeks;
		expect.soft(newEvaluatedWeeks[0][0].success, "New system should succeed").toBe(true);
	});

	it("show an error for reuse/repeat mismatch", () => {
		const programText = `# Week 1
## Day 1
tmp: Squat[1-2] / 2x5 / used: none / progress: custom() {~
  weights[3:*:*:*] += 10lb
~}
Squat[1-5] / ...tmp: Squat / progress: custom() { ...tmp: Squat }
Bench Press[1-5] / ...tmp: Squat / progress: custom() { ...tmp: Squat }

# Week 2
## Day 1

# Week 3
## Day 1

# Week 4
## Day 1

# Week 5
## Day 1
`;
		const newPlanner = {
			name: "MyProgram",
			weeks: newPlannerProgram_evaluateText(programText),
		};
		const newResult = newPlannerProgram_evaluate(newPlanner, Settings_build()).evaluatedWeeks[2][0];
		expect.soft(newResult.success, "New system should fail").toBe(false);
		if (!newResult.success) {
			expect
				.soft(newResult.error.message, "New system error message")
				.toEqual("Squat: No such exercise tmp: Squat at week: 3 (4:13)");
		}
	});
});
