import {
	findErrorNode,
	nodeError,
	SourcedSyntaxError,
	type SourcedSyntaxNode,
} from "@/utils/lezer.ts";
import { isEqualAfterTransform, ObjectUtils_keys, ObjectUtils_values } from "@/utils/object.ts";
import { IProgramMode } from "@/logic/evaluators/types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import type { IDayData, IPlannerProgram, IPlannerProgramDay, IPlannerProgramWeek } from "@/program";
//#region Dead Layer Imports
//@todo These imports are coming from higher or dead layers, which should not be imported from
import type { ISettings } from "@/user-settings";
import {
	getPlannerKey,
	type IEvaluatedProgram,
	type IPlannerEvalResult,
	IPlannerExerciseEvaluatorMode,
	type IPlannerProgramExercise,
	type IPlannerProgramReuse,
	type IProgramExerciseDescriptions,
	type IProgramExerciseUpdate,
	IProgramExerciseUpdateType,
	type IWeightChange,
	PlannerProgramExercise_evaluateSetVariations,
	PlannerProgramExercise_getState,
	PlannerProgramExercise_setVariations,
	Progress_createEmptyScriptBindings,
} from "@/evaluators/plan-evaluator-minimal.ts";
//#endregion
import { memoize } from "micro-memoize";
import { eq, typeOf } from "@/quantities/weight.ts";
import { definedOnly } from "@/utils/collection.ts";
import {
	isPlanNodeOfType,
	parseBound,
	plannerError,
	PlannerNodeName,
} from "@/planner/parsing/guards.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { asProgramScript } from "@/planner/display.ts";
import { isEqual, pick } from "es-toolkit";
import { nodeFailure, nodeSuccess } from "@/common-types.ts";
import {
	as0,
	as1,
	type IndexFrom0,
	type IndexFrom1,
	next,
	withIndex,
	ZERO,
} from "@/utils/indexes.ts";
import { evaluate } from "@/planner/evaluators/exercise.ts";
import type { IPlannerProgramExerciseWarmupSet } from "@/sets";
import { nestedFor } from "@/utils/iterables.ts";

import { validateScript } from "@/logic/evaluators";
import {
	type IProgramExerciseProgress,
	IProgramExerciseProgressType,
} from "@/planner/progression-formulas/types.ts";

//#region Planner Evaluator
type IByExercise<T> = Record<string, T>;
type IByExerciseWeekDay<T> = Record<string, Record<number, Record<number, T>>>;
type ICanonicalEntry<T> = { property: T; dayData: IDayData };

interface IPlannerEvalMetadata {
	byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>;
	notused: Set<string>;
	properties: {
		id: IByExercise<ICanonicalEntry<number[]>>;
		progress: IByExercise<ICanonicalEntry<IProgramExerciseProgress>>;
		update: IByExercise<ICanonicalEntry<IProgramExerciseUpdate>>;
		warmup: IByExercise<ICanonicalEntry<IPlannerProgramExerciseWarmupSet[]>>;
	};
}

function checkConsistentProperty<T>({
	key,
	value,
	canonical,
	dayData,
	isEqual,
	makeError,
}: {
	key: string;
	value: T | null | undefined;
	canonical: IByExercise<ICanonicalEntry<T>>;
	dayData: IDayData;
	isEqual: (a: T, b: T) => boolean;
	makeError: (prevDayData: IDayData) => SourcedSyntaxError;
}): IPlannerEvalResult | null {
	if (value == null) {
		return null;
	}
	const existing = canonical[key];
	if (existing != null && !isEqual(value, existing.property)) {
		return { success: false, error: makeError(existing.dayData) };
	}
	canonical[key] = { property: value, dayData };
	return null;
}

function fillRepeats(
	exercise: IPlannerProgramExercise,
	evaluatedWeeks: IPlannerEvalResult[][],
	dayInWeekIndex: IndexFrom0,
	byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
	dayIndexByWeekDay: IndexFrom0[][],
): void {
	for (const repeatWeek of exercise.repeat ?? []) {
		const repeatWeekIndex = repeatWeek - 1;
		if (byExerciseWeekDay[exercise.key]?.[repeatWeekIndex]?.[dayInWeekIndex] == null) {
			const dayData: IDayData = {
				week: repeatWeek,
				dayInWeek: as1(dayInWeekIndex),
				day: as1(dayIndexByWeekDay[repeatWeekIndex]?.[dayInWeekIndex] ?? ZERO),
			};
			const repeatedExercise: IPlannerProgramExercise = {
				...exercise,
				reuse: exercise.reuse ? { ...exercise.reuse } : undefined,
				progress: exercise.progress
					? {
							...exercise.progress,
							reuse: exercise.progress.reuse ? { ...exercise.progress.reuse } : undefined,
						}
					: undefined,
				update: exercise.update
					? {
							...exercise.update,
							reuse: exercise.update.reuse ? { ...exercise.update.reuse } : undefined,
						}
					: undefined,
				repeat: [],
				dayData,
				isRepeat: true,
			};
			byExerciseWeekDay[exercise.key] ??= {};
			byExerciseWeekDay[exercise.key][repeatWeekIndex] ??= {};
			byExerciseWeekDay[exercise.key][repeatWeekIndex][dayInWeekIndex] = repeatedExercise;
			const day = evaluatedWeeks[repeatWeekIndex]?.[dayInWeekIndex];
			if (day?.success) {
				day.data.push(repeatedExercise);
			}
		}
	}
}

function fillSetReuses(
	exercise: IPlannerProgramExercise,
	evaluatedWeeks: IPlannerEvalResult[][],
	weekIndex: IndexFrom0,
	settings: ISettings,
	metadata: IPlannerEvalMetadata,
): void {
	if (exercise.reuse && exercise.points.reuseSetPoint) {
		const reuse = exercise.reuse;
		const originalExercises = findOriginalExercisesAtWeekDay(
			settings,
			reuse.fullName,
			evaluatedWeeks,
			reuse.week ?? as1(weekIndex),
			reuse.day,
		);
		if (originalExercises.length > 1) {
			throw plannerError(
				exercise.fullName,
				`There're several exercises matching, please be more specific with [week:day] syntax`,
				exercise.points.reuseSetPoint,
			);
		}
		const originalExercise = originalExercises[0];
		if (!originalExercise) {
			throw plannerError(
				exercise.fullName,
				`No such exercise ${reuse.fullName} at week: ${reuse.week ?? as1(weekIndex)}${
					reuse.day != null ? `, day: ${reuse.day}` : ""
				}`,
				exercise.points.reuseSetPoint,
			);
		}
		if (originalExercise.exercise.reuse?.fullName != null) {
			throw plannerError(
				exercise.fullName,
				`Original exercise cannot reuse another exercise's sets x reps`,
				exercise.points.reuseSetPoint,
			);
		}
		if (
			originalExercise.exercise.progress?.reuse != null &&
			exercise.progress == null &&
			!originalExercise.exercise.notused
		) {
			throw plannerError(
				exercise.fullName,
				`This exercise doesn't specify progress - so the original USED exercise's progress cannot reuse another exercise's progress`,
				exercise.points.reuseSetPoint,
			);
		}
		if (
			originalExercise.exercise.update?.reuse != null &&
			exercise.update == null &&
			!originalExercise.exercise.notused
		) {
			throw plannerError(
				exercise.fullName,
				`This exercise doesn't specify 'update' - so the original exercise's 'update' cannot reuse another exercise's 'update'`,
				exercise.points.reuseSetPoint,
			);
		}
		if (originalExercise.exercise.progress != null && exercise.progress == null) {
			const sharedProgressReuse: IPlannerProgramReuse = {
				fullName: originalExercise.exercise.fullName,
				source: "overall",
			};
			const originalProgress = originalExercise.exercise.progress;
			forEachSiblingInstance(exercise, metadata, other => {
				if (other.progress == null) {
					other.progress = {
						type: originalProgress.type,
						state: structuredClone(originalProgress.state),
						stateMetadata: structuredClone(originalProgress.stateMetadata),
						reuse: sharedProgressReuse,
					};
				}
			});
		}
		if (originalExercise.exercise.update != null && exercise.update == null) {
			const sharedUpdateReuse: IPlannerProgramReuse = {
				fullName: originalExercise.exercise.fullName,
				source: "overall",
			};
			const originalUpdate = originalExercise.exercise.update;
			forEachSiblingInstance(exercise, metadata, other => {
				if (other.update == null) {
					other.update = {
						type: originalUpdate.type,
						reuse: sharedUpdateReuse,
					};
				}
			});
		}

		exercise.reuse.exercise = originalExercise.exercise;
	}
}

function forEachSiblingInstance(
	exercise: IPlannerProgramExercise,
	metadata: IPlannerEvalMetadata,
	cb: (other: IPlannerProgramExercise) => void,
): void {
	for (const weekEntry of ObjectUtils_values(metadata.byExerciseWeekDay[exercise.key])) {
		for (const dayEntry of ObjectUtils_values(weekEntry)) {
			cb(dayEntry);
		}
	}
}

function fillEvaluatedSetVariations(exercise: IPlannerProgramExercise): void {
	const setVariations = PlannerProgramExercise_setVariations(exercise);

	exercise.evaluatedSetVariations = PlannerProgramExercise_evaluateSetVariations(
		exercise,
		setVariations,
	);
}

function fillDescriptions(
	exercise: IPlannerProgramExercise,
	evaluatedWeeks: IPlannerEvalResult[][],
	weekIndex: number,
	dayIndex: number,
): void {
	if (exercise.descriptions == null || exercise.descriptions.values.length === 0) {
		for (
			let i = weekIndex - 1, lastWeekDay = evaluatedWeeks[i]?.[dayIndex];
			i >= 0 && lastWeekDay != null;
			i -= 1, lastWeekDay = evaluatedWeeks[i]?.[dayIndex]
		) {
			if (!lastWeekDay.success) {
				continue;
			}
			const lastWeekExercise = lastWeekDay.data.find(ex => ex.key === exercise.key);
			if (lastWeekExercise) {
				exercise.descriptions = structuredClone(lastWeekExercise.descriptions);
				return;
			}
		}
		return undefined;
	}
}

function fillDescriptionReuses(
	exercise: IPlannerProgramExercise,
	weekIndex: number,
	byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
	settings: ISettings,
): void {
	if (
		exercise.descriptions != null &&
		exercise.descriptions.values.length === 1 &&
		exercise.descriptions.values[0].value?.startsWith("...")
	) {
		const reusingName = exercise.descriptions.values[0].value.slice(3).trim();
		const result = findReusedDescriptions(reusingName, weekIndex, byExerciseWeekDay, settings);
		if (result != null) {
			const { descriptions, exercise: originalExercise } = result;
			exercise.descriptions = {
				values: [...structuredClone(descriptions.values)],
				reuse: {
					fullName: originalExercise.fullName,
					exercise: originalExercise,
					source: "specific",
				},
			};
		}
	}
}

function fillSingleProperties(
	exercise: IPlannerProgramExercise,
	metadata: IPlannerEvalMetadata,
): void {
	if (metadata.notused.has(exercise.key)) {
		exercise.notused = true;
	}

	if (metadata.properties.progress[exercise.key] != null) {
		exercise.progress ??= metadata.properties.progress[exercise.key].property;
	}

	if (metadata.properties.update[exercise.key] != null) {
		exercise.update ??= metadata.properties.update[exercise.key].property;
	}

	if (metadata.properties.warmup[exercise.key] != null) {
		exercise.warmupSets = metadata.properties.warmup[exercise.key].property;
	}
}

function fillProgressReuses(
	evaluatedWeeks: IPlannerEvalResult[][],
	exercise: IPlannerProgramExercise,
	settings: ISettings,
	metadata: IPlannerEvalMetadata,
): void {
	const progress = exercise.progress;
	if (progress?.type === "custom") {
		const fullName = progress.reuse?.fullName;
		if (progress.reuse && fullName) {
			const key = getPlannerKey(fullName, settings.exercises);
			const point = exercise.points.progressPoint || exercise.points.fullName;
			if (metadata.byExerciseWeekDay[key] == null) {
				throw plannerError(exercise.fullName, `No such exercise ${fullName}`, point);
			}
			const originalProperty = metadata.properties.progress[key];
			const dayData = originalProperty?.dayData;
			const originalProgress = originalProperty?.property;
			if (!originalProgress || !dayData) {
				throw plannerError(exercise.fullName, "Original exercise should specify progress", point);
			}
			if (originalProgress.reuse?.fullName != null && !originalProgress.reuse?.exercise?.notused) {
				throw plannerError(
					exercise.fullName,
					`Original exercise cannot reuse another progress`,
					point,
				);
			}
			if (originalProgress.type !== "custom") {
				throw plannerError(
					exercise.fullName,
					"Original exercise should specify custom progress",
					point,
				);
			}
			const originalState = originalProgress.state;
			const state = progress.state;
			for (const stateKey of ObjectUtils_keys(originalState)) {
				const value = originalState[stateKey];
				if (state[key] != null && typeOf(value) !== typeOf(state[stateKey])) {
					throw plannerError(exercise.fullName, `Wrong type of state variable ${stateKey}`, point);
				}
			}
			const originalExercises = findOriginalExercisesAtWeekDay(
				settings,
				fullName,
				evaluatedWeeks,
				dayData.week,
				dayData.dayInWeek,
			);
			const originalExercise = originalExercises[0]?.exercise;
			if (
				originalExercise?.reuse != null &&
				(originalExercise.progress == null || originalExercise.progress.reuse != null)
			) {
				throw plannerError(
					exercise.fullName,
					`Original exercise '${originalExercise.fullName}' should not reuse other exercise`,
					point,
				);
			}
			progress.reuse.exercise = originalExercise;
		}
	}
}

function checkUpdateScript(
	exercise: IPlannerProgramExercise,
	settings: ISettings,
	dayData: IDayData,
): void {
	if (exercise.update?.type !== IProgramExerciseUpdateType.CUSTOM) {
		return;
	}
	const liftoscriptNode = exercise.update?.liftoscriptNode;
	if (!liftoscriptNode) {
		return;
	}
	const [firstError] = validateScript(
		liftoscriptNode.source,
		PlannerProgramExercise_getState(exercise),
		Progress_createEmptyScriptBindings(dayData, settings),
		Progress_createScriptFunctions(settings),
		IProgramMode.UPDATE,
	).take(1);
	if (!firstError) {
		return;
	}
	const { line, from } = liftoscriptNode.getPointer();
	throw new SourcedSyntaxError(
		firstError.message,
		line + firstError.line,
		firstError.offset,
		from + firstError.from,
		from + firstError.to,
	);
}

/**
 * Sets the value of exercise.update.reuse.exercise = originalExercise
 * @param evaluatedWeeks
 * @param exercise
 * @param settings
 * @param metadata
 */
function fillUpdateReuses(
	evaluatedWeeks: IPlannerEvalResult[][],
	exercise: IPlannerProgramExercise,
	settings: ISettings,
	metadata: IPlannerEvalMetadata,
): void {
	if (exercise.update?.type !== "custom") {
		return;
	}
	const fullName = exercise.update.reuse?.fullName;
	if (!(exercise.update.reuse && fullName)) {
		return;
	}
	const key = getPlannerKey(fullName, settings.exercises);
	const point = exercise.points.updatePoint || exercise.points.fullName;
	if (metadata.byExerciseWeekDay[key] == null) {
		throw plannerError(exercise.fullName, `No such exercise ${fullName}`, point);
	}
	const originalProperty = metadata.properties.update[key];
	const originalUpdate = originalProperty?.property;
	const dayData = originalProperty?.dayData;
	if (!originalUpdate || !dayData) {
		throw plannerError(exercise.fullName, "Original exercise should specify update", point);
	}
	if (originalUpdate.reuse?.fullName != null && !originalUpdate.reuse?.exercise?.notused) {
		throw plannerError(exercise.fullName, `Original exercise cannot reuse another update`, point);
	}
	if (originalUpdate.type !== "custom") {
		throw plannerError(exercise.fullName, "Original exercise should specify custom update", point);
	}
	const stateKeys = originalUpdate.meta?.stateKeys || new Set();
	if (stateKeys.size !== 0) {
		if (exercise.progress == null) {
			throw plannerError(
				exercise.fullName,
				"If 'update' block uses state variables, exercise should define them in 'progress' block",
				point,
			);
		}
		const state = PlannerProgramExercise_getState(exercise);
		for (const stateKey of stateKeys) {
			if (state[stateKey] == null) {
				throw plannerError(
					exercise.fullName,
					`Missing state variable ${stateKey} that's used in the original update block`,
					point,
				);
			}
		}
	}
	const originalExercise = findOriginalExercisesAtWeekDay(
		settings,
		fullName,
		evaluatedWeeks,
		dayData.week,
		dayData.dayInWeek,
	).at(0)?.exercise;
	if (
		originalExercise?.reuse != null &&
		(originalExercise.update == null || originalExercise.update.reuse != null)
	) {
		throw plannerError(
			exercise.fullName,
			`Original exercise '${originalExercise.fullName}' should not reuse other exercise`,
			point,
		);
	}
	exercise.update.reuse.exercise = originalExercise;
}

function checkUnknownExercises(
	exercise: IPlannerProgramExercise,
	metadata: IPlannerEvalMetadata,
): void {
	if (exercise.exerciseType == null && !metadata.notused.has(exercise.key)) {
		throw plannerError(
			exercise.fullName,
			`Unknown exercise ${exercise.name}`,
			exercise.points.fullName,
		);
	}
}

function findReusedDescriptions(
	reusingName: string,
	currentWeekIndex: number,
	byExerciseWeekDay: IByExerciseWeekDay<IPlannerProgramExercise>,
	settings: ISettings,
):
	| {
			descriptions: IProgramExerciseDescriptions;
			exercise: IPlannerProgramExercise;
	  }
	| undefined {
	const weekDayMatch = reusingName.match(/\[([^]+)\]/);
	let weekIndex: number | undefined;
	let dayIndex: number | undefined;
	if (weekDayMatch != null) {
		const [dayOrWeekStr, dayStr] = weekDayMatch[1].split(":");
		if (dayStr != null) {
			weekIndex = parseInt(dayOrWeekStr, 10);
			weekIndex = isNaN(weekIndex) ? undefined : weekIndex - 1;
			dayIndex = parseInt(dayStr, 10);
			dayIndex = isNaN(dayIndex) ? undefined : dayIndex - 1;
		} else {
			dayIndex = parseInt(dayOrWeekStr, 10);
			dayIndex = isNaN(dayIndex) ? undefined : dayIndex - 1;
		}
	}
	reusingName = reusingName.replace(/\[([^]+)\]/, "").trim();
	const key = getPlannerKey(reusingName, settings.exercises);
	const weekExercises = Object.values(
		byExerciseWeekDay[key]?.[weekIndex ?? currentWeekIndex] || [],
	);
	const weekDescriptions = weekExercises.map(d => d.descriptions);
	const index = dayIndex ?? 0;
	if (weekDescriptions[index]) {
		return {
			descriptions: weekDescriptions[index],
			exercise: weekExercises[index],
		};
	} else {
		return undefined;
	}
}

function findOriginalExercisesAtWeekDay(
	settings: ISettings,
	fullName: string,
	program: IPlannerEvalResult[][],
	atWeek: IndexFrom1,
	atDay?: IndexFrom1,
): { exercise: IPlannerProgramExercise; dayData: IDayData }[] {
	const originalExercises: {
		exercise: IPlannerProgramExercise;
		dayData: IDayData;
	}[] = [];
	const week = program[as0(atWeek)];
	const candidateDays = atDay != null ? [week[as0(atDay)]] : week;
	candidateDays.forEach(
		withIndex((day, dayInWeekIndex) => {
			if (day == null || !day.success) {
				return;
			}
			for (const exercise of day.data) {
				const reusingKey = getPlannerKey(
					exercise.exerciseType
						? { label: exercise.label, exerciseType: exercise.exerciseType }
						: exercise.fullName,
					settings.exercises,
				);
				const originalKey = getPlannerKey(fullName, settings.exercises);
				if (reusingKey !== originalKey) {
					continue;
				}
				originalExercises.push({
					exercise,
					dayData: {
						week: atWeek,
						dayInWeek: as1(dayInWeekIndex),
						day: as1(0),
					},
				});
			}
		}),
	);
	return originalExercises;
}

function iterateOverExercises(
	program: IPlannerEvalResult[][],
	cb: (
		weekIndex: IndexFrom0,
		dayInWeekIndex: IndexFrom0,
		dayIndex: IndexFrom0,
		exerciseIndex: IndexFrom0,
		exercise: IPlannerProgramExercise,
	) => void,
): void {
	let dayIndex = ZERO;
	program.forEach(
		withIndex((week, weekIndex) => {
			week.forEach(
				withIndex((day, dayInWeekIndex) => {
					try {
						if (day?.success) {
							const exercises = day.data;
							exercises.forEach(
								withIndex((exercise, exerciseIndex) => {
									cb(weekIndex, dayInWeekIndex, dayIndex, exerciseIndex, exercise);
								}),
							);
						}
					} catch (e) {
						if (e instanceof SourcedSyntaxError) {
							week[dayInWeekIndex] = { success: false, error: e };
						} else {
							throw e;
						}
					}
					dayIndex = next(dayIndex);
				}),
			);
		}),
	);
}

export const PlannerEvaluator_forceEvaluate = (
	plannerProgram: IPlannerProgram,
	settings: ISettings,
): {
	evaluatedWeeks: IPlannerEvalResult[][];
	exerciseFullNames: string[];
} => {
	let dayIndex = ZERO;
	const dayIndexByWeekDay: IndexFrom0[][] = [];
	const metadata: IPlannerEvalMetadata = {
		byExerciseWeekDay: {},
		notused: new Set(),
		properties: { progress: {}, update: {}, warmup: {}, id: {} },
	};
	const evaluatedWeeks: IPlannerEvalResult[][] = plannerProgram.weeks.map(
		withIndex((week, weekIndex) => {
			dayIndexByWeekDay[weekIndex] ??= [];
			return week.days.map(
				withIndex((day: IPlannerProgramDay, dayInWeekIndex): IPlannerEvalResult => {
					const dayData: IDayData = {
						week: as1(weekIndex),
						dayInWeek: as1(dayInWeekIndex),
						day: as1(dayIndex),
					};
					dayIndexByWeekDay[weekIndex][dayInWeekIndex] = dayIndex;
					const parsed = parseBound(day.exerciseText);

					if (!isPlanNodeOfType("Program", parsed)) {
						return nodeFailure(nodeError(parsed, `Unexpected node type ${parsed.node.type.name}`));
					}

					const dayParseResult = evaluate(
						parsed,
						settings,
						IPlannerExerciseEvaluatorMode.PERDAY,
						dayData,
					);
					const result: IPlannerEvalResult = !dayParseResult.success
						? dayParseResult
						: nodeSuccess(dayParseResult.data.at(0)?.days.at(0)?.exercises || []);
					dayIndex = next(dayIndex);
					if (!result.success) {
						return result;
					}
					const exercises = result.data;
					const keysInDay = new Set<string>();
					for (const exercise of exercises) {
						if (exercise.progress?.type === IProgramExerciseProgressType.DP) {
							const hasRange = exercise.setVariations.some(sv =>
								sv.sets.some(s => s.repRange?.minrep != null),
							);
							if (hasRange) {
								exercise.progress.script = `for (var.i in completedReps) {
  if (weights[var.i] == 0 && completedWeights[var.i] != 0) {
    weights[var.i] = completedWeights[var.i]
  }
}
if (completedReps >= reps && completedRPE <= RPE) {
  minReps = state.minReps
  for (var.i in completedReps) {
    var.isInitial = weights[var.i] == 0 && completedWeights[var.i] != 0
    if (var.isInitial) {
      weights[var.i] = completedWeights[var.i] + state.increment
    } else {
      weights[var.i] += (completedWeights[var.i] - weights[var.i]) + state.increment
    }
  }
} else {
  for (var.i in completedReps) {
    minReps[var.i] = completedReps[var.i] + 1 > reps[var.i] ?
      reps[var.i] :
      completedReps[var.i] + 1
  }
}`;
							}
						}
						if (keysInDay.has(exercise.key)) {
							return {
								success: false,
								error: plannerError(
									exercise.fullName,
									`Exercise ${exercise.key} is already used in this day. Combine them together, or add a label to separate out.`,
									exercise.points.fullName,
								),
							};
						}
						keysInDay.add(exercise.key);

						const tagsProp = exercise.tags;
						if (tagsProp != null && tagsProp.length > 0) {
							const idError = checkConsistentProperty({
								key: exercise.key,
								value: tagsProp,
								canonical: metadata.properties.id,
								dayData,
								isEqual,
								makeError: prevDayData =>
									plannerError(
										exercise.fullName,
										`Same property 'id' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
											`week ${prevDayData.week + 1}, day ${prevDayData.dayInWeek + 1} ` +
											`and week ${dayData.week}, day ${dayData.dayInWeek}`,
										exercise.points.idPoint || exercise.points.fullName,
									),
							});
							if (idError != null) {
								return idError;
							}
						}

						if (
							exercise.progress != null &&
							exercise.progress.type !== IProgramExerciseProgressType.NONE
						) {
							const progressError = checkConsistentProperty({
								key: exercise.key,
								value: exercise.progress,
								canonical: metadata.properties.progress,
								dayData,
								isEqual: (a, b) =>
									isEqualAfterTransform(a, b, p => ({
										...pick(p, ["type", "state", "stateMetadata", "script"]),
										reuse: p.reuse?.fullName,
									})),
								makeError: prevDayData =>
									plannerError(
										exercise.fullName,
										`Same property 'progress' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
											`week ${prevDayData.week + 1}, day ${prevDayData.dayInWeek + 1} ` +
											`and week ${dayData.week}, day ${dayData.dayInWeek}`,
										exercise.points.progressPoint || exercise.points.fullName,
									),
							});
							if (progressError != null) {
								return progressError;
							}
						}

						if (exercise.update != null) {
							const updateError = checkConsistentProperty({
								key: exercise.key,
								value: exercise.update,
								canonical: metadata.properties.update,
								dayData,
								isEqual: (a, b) =>
									isEqualAfterTransform(a, b, u => ({
										type: u.type,
										script: u.liftoscriptNode?.source,
										reuse: u.reuse?.fullName,
									})),
								makeError: prevDayData =>
									plannerError(
										exercise.fullName,
										`Same property 'update' is specified with different arguments in multiple weeks/days for exercise '${exercise.name}': both in ` +
											`week ${prevDayData.week + 1}, day ${prevDayData.dayInWeek + 1} ` +
											`and week ${dayData.week}, day ${dayData.dayInWeek}`,
										exercise.points.updatePoint || exercise.points.fullName,
									),
							});
							if (updateError != null) {
								return updateError;
							}
						}
						if (exercise.notused) {
							metadata.notused.add(exercise.key);
						}
						if (exercise.warmupSets != null) {
							const warmupError = checkConsistentProperty({
								key: exercise.key,
								value: exercise.warmupSets,
								canonical: metadata.properties.warmup,
								dayData,
								isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
								makeError: prevDayData =>
									plannerError(
										exercise.fullName,
										`Different warmup sets are specified in multiple weeks/days for exercise '${exercise.name}': both in ` +
											`week ${prevDayData.week + 1}, day ${prevDayData.dayInWeek + 1} ` +
											`and week ${dayData.week}, day ${dayData.dayInWeek}`,
										exercise.points.warmupPoint || exercise.points.fullName,
									),
							});
							if (warmupError != null) {
								return warmupError;
							}
						}

						((metadata.byExerciseWeekDay[exercise.key] ??= {})[dayData.week - 1] ??= {})[
							dayData.dayInWeek - 1
						] = exercise;
					}
					return { success: true, data: exercises };
				}),
			);
		}),
	);
	iterateOverExercises(evaluatedWeeks, (weekIndex, dayInWeekIndex, globalDayIndex, _, exercise) => {
		fillDescriptions(exercise, evaluatedWeeks, weekIndex, dayInWeekIndex);
		fillRepeats(
			exercise,
			evaluatedWeeks,
			dayInWeekIndex,
			metadata.byExerciseWeekDay,
			dayIndexByWeekDay,
		);
		fillSingleProperties(exercise, metadata);
		checkUnknownExercises(exercise, metadata);
		fillSetReuses(exercise, evaluatedWeeks, weekIndex, settings, metadata);
		fillDescriptionReuses(exercise, weekIndex, metadata.byExerciseWeekDay, settings);
		fillProgressReuses(evaluatedWeeks, exercise, settings, metadata);
		fillUpdateReuses(evaluatedWeeks, exercise, settings, metadata);
		checkUpdateScript(exercise, settings, {
			week: as1(weekIndex),
			dayInWeek: as1(dayInWeekIndex),
			day: as1(globalDayIndex),
		});
	});
	for (const week of evaluatedWeeks) {
		for (const day of week) {
			if (!day.success) {
				continue;
			}
			day.data.sort((ex1, ex2) =>
				ex1.exerciseIndex === ex2.exerciseIndex
					? (ex1.repeating[0] ?? 0) - (ex2.repeating[0] ?? 0)
					: ex1.exerciseIndex - ex2.exerciseIndex,
			);
		}
	}

	const exerciseFullNames = new Set<string>();
	iterateOverExercises(evaluatedWeeks, (_, __, ___, ____, exercise) => {
		exerciseFullNames.add(exercise.fullName);
		fillEvaluatedSetVariations(exercise);
	});
	return { evaluatedWeeks, exerciseFullNames: Array.from(exerciseFullNames) };
};

export const PlannerEvaluator_evaluate = memoize(PlannerEvaluator_forceEvaluate, {
	maxSize: 10,
	isEqual: (a: IPlannerProgram | ISettings, b: IPlannerProgram | ISettings) =>
		a && "weeks" in a && b && "weeks" in b ? asProgramScript(a) === asProgramScript(b) : a === b,
});

//#endregion

//#region Planner Program

export function PlannerProgram_replaceWeight(
	program: IEvaluatedProgram,
	programExerciseId: string,
	weightChanges: IWeightChange[],
): IEvaluatedProgram {
	const newEvalutedProgram = structuredClone(program);
	for (const { item: set } of nestedFor(newEvalutedProgram.weeks, [
		week => week.days,
		day => day.exercises.filter(ex => ex.key === programExerciseId),
		ex => ex.evaluatedSetVariations,
		setVariation => setVariation.sets,
	])) {
		set.weight = weightChanges.find(wc => eq(wc.originalWeight, set.weight))?.weight ?? set.weight;
	}
	return newEvalutedProgram;
}

export function PlannerProgram_evaluate(
	plannerProgram: IPlannerProgram,
	settings: ISettings,
): { evaluatedWeeks: IPlannerEvalResult[][]; exerciseFullNames: string[] } {
	return PlannerEvaluator_evaluate(plannerProgram, settings);
}

export function PlannerProgram_evaluateText(fullProgramText: string): IPlannerProgramWeek[] {
	const data = evaluatePreservingSource(
		parseBound(fullProgramText),
		IPlannerExerciseEvaluatorMode.FULLTEXT,
	);
	const weeks: IPlannerProgramWeek[] = data.map(week => {
		return {
			name: week.name,
			description: week.description,
			days: week.days.map(day => {
				return {
					name: day.name,
					description: day.description,
					exerciseText: day.exercises.join("").trim(),
				};
			}),
		};
	});
	if (weeks.length === 0) {
		weeks.push({ name: "Week 1", days: [{ name: "Day 1", exerciseText: "" }] });
	}
	return weeks;
}

//#endregion

/**
 * Walks the program preserving raw lines (including comments) for each day’s exercise text.
 * Requires {@link IPlannerExerciseEvaluatorMode} `"fulltext"`.
 */
function evaluatePreservingSource(
	programNode: SourcedSyntaxNode,
	mode: IPlannerExerciseEvaluatorMode,
): ITextWeek[] {
	if (mode !== IPlannerExerciseEvaluatorMode.FULLTEXT) {
		throw new Error(
			`PlannerExerciseEvaluator.evaluatePreservingSource requires mode "${IPlannerExerciseEvaluatorMode.FULLTEXT}"`,
		);
	}
	if (programNode.type.name !== PlannerNodeName.Program) {
		throw new Error(`Unexpected node type ${programNode.type.name}`);
	}
	const firstError = findErrorNode(programNode);
	if (firstError) {
		throw nodeError(firstError);
	}

	let weeksFullText: ITextWeek[] = [];
	let ongoingLinesFullText: INonExerciseFullTextLine[] = [];
	for (const child of queryChildren(programNode).filter(definedOnly)) {
		if (child.type.name === PlannerNodeName.Week) {
			const weekName = child.source.replace(/^#+/, "").trim();
			const description = getWeekDayDescriptionAndFillLastDayFullText(
				ongoingLinesFullText,
				weeksFullText,
			);
			weeksFullText.push({ name: weekName, description, days: [] });
			ongoingLinesFullText = [];
		} else if (child.type.name === PlannerNodeName.Day) {
			const dayName = child.source.replace(/^#+/, "").trim();
			const description = getWeekDayDescriptionAndFillLastDayFullText(
				ongoingLinesFullText,
				weeksFullText,
			);
			weeksFullText[weeksFullText.length - 1].days.push({
				name: dayName,
				exercises: [],
				description,
			});
			ongoingLinesFullText = [];
		} else if (child.type.name === PlannerNodeName.EmptyExpression) {
			ongoingLinesFullText.push({
				type: "empty",
				line: child.source,
			});
		} else if (child.type.name === PlannerNodeName.LineComment) {
			ongoingLinesFullText.push({
				type: "comment",
				line: child.source,
			});
		} else if (child.type.name === PlannerNodeName.TripleLineComment) {
			ongoingLinesFullText.push({
				type: "triplelinecomment",
				line: child.source,
			});
		} else if (child.type.name === PlannerNodeName.ExerciseExpression) {
			const lastWeek = weeksFullText[weeksFullText.length - 1];
			const lastDay = lastWeek ? lastWeek.days[lastWeek.days.length - 1] : undefined;
			const exercises = lastDay?.exercises;
			if (exercises) {
				for (const line of ongoingLinesFullText) {
					exercises.push(line.line);
				}
				exercises.push(child.source);
				ongoingLinesFullText = [];
			}
		}
	}
	return weeksFullText;
}

function getWeekDayOngoingLinesFullText(
	ongoingLinesFullText: Readonly<INonExerciseFullTextLine[]>,
): {
	linesToPreviousExercise: INonExerciseFullTextLine[];
	nextLines: INonExerciseFullTextLine[];
} {
	const ongoingLines = [...ongoingLinesFullText];
	let anyCommentStarted = false;
	let commentStarted = false;
	const linesToPreviousExercise: INonExerciseFullTextLine[] = [];
	const nextLines: INonExerciseFullTextLine[] = [];
	for (const line of ongoingLines) {
		if (!anyCommentStarted && line?.type === "empty") {
			continue;
		}
		if (line?.type === "comment" || line?.type === "triplelinecomment") {
			anyCommentStarted = true;
		}
		if (line?.type === "comment") {
			commentStarted = true;
		}
		if (anyCommentStarted && !commentStarted) {
			linesToPreviousExercise.push(line);
		}
		if (commentStarted && line?.type === "comment") {
			nextLines.push(line);
		}
	}
	for (let i = nextLines.length - 1; i >= 0; i--) {
		if (nextLines[i].type === "empty") {
			nextLines.pop();
		} else {
			break;
		}
	}
	for (let i = linesToPreviousExercise.length - 1; i >= 0; i--) {
		if (linesToPreviousExercise[i].type === "empty") {
			linesToPreviousExercise.pop();
		} else {
			break;
		}
	}
	return { linesToPreviousExercise, nextLines };
}

function getWeekDayDescriptionAndFillLastDayFullText(
	ongoingLinesFullText: Readonly<INonExerciseFullTextLine[]>,
	weeksFullText: ITextWeek[],
): string | undefined {
	const { linesToPreviousExercise, nextLines } =
		getWeekDayOngoingLinesFullText(ongoingLinesFullText);
	if (linesToPreviousExercise.length > 0) {
		const lastWeek = weeksFullText.at(-1);
		const lastDay = lastWeek?.days.at(-1);
		if (lastDay) {
			lastDay.exercises.push(...linesToPreviousExercise.map(line => line.line));
		}
	}
	return nextLines.length > 0
		? nextLines
				.map(line => line.line.replace(/^\s*\/\/\/?\s*/, "").trim())
				.join("\n")
				.trim()
		: undefined;
}

/**
 * A program parsed into days and weeks, but with the exercises left as raw source code
 */
interface ITextWeek {
	name: string;
	description?: string;
	days: {
		name: string;
		description?: string;
		exercises: string[];
	}[];
}

type INonExerciseFullTextLine = {
	type: "comment" | "triplelinecomment" | "empty";
	line: string;
};
