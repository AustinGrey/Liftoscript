import { memoize } from "micro-memoize";
import { z } from "zod";
import type { SyntaxNode } from "@lezer/common";
import { definedOnly, tryFindIndex } from "../utils/collection";
import { generateUid } from "@/utils/uid.ts";
import { MathUtils_applyOp, MathUtils_roundFloat, MathUtils_roundTo0005, n } from "@/utils/math";
import { type IEither, is, isNumber, type OpenRecord } from "@/utils/types";
import {
	ObjectUtils_entries,
	ObjectUtils_filter,
	ObjectUtils_isEqual,
	ObjectUtils_keys,
} from "@/utils/object";
import type { IAssignmentOp, ILiftoscriptEvaluatorUpdate, Quantity } from "@/logic/types";
import { parser as LiftoscriptParser } from "@/logic/parsing/logic.ts";
import {
	applyOp,
	build,
	convertTo,
	eq,
	type IDynamicWeight,
	type IWeight,
	parse as parseWeight,
	percentORM,
	print,
	round,
	roundTo005,
	TDynamicWeight,
	TWeight,
	w,
} from "@/quantities/weight.ts";
import {
	type IExerciseDataValue,
	type IProgramState,
	type IRepRange,
	type IScriptFnContext,
	type IScriptFunctions,
	type ISet,
	nodeFailure,
	type NodeResult,
	TProgramState,
	TSet,
} from "@/common-types.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import {
	Exercise_findByNameAndEquipment,
	Exercise_findByNameEquipment,
	Exercise_fullName,
	getExerciseOrDefault,
	getOrmOrStartingWeight,
	type IAllCustomExercises,
	type IExerciseType,
	isUnilateral,
	TExerciseType,
	toKey,
} from "@/exercises";
import { getCurrentEquipment, getPreferredUnit, type ISettings } from "@/user-settings";
import {
	asPlanNodeOfTypeOrThrow,
	PlannerNodeName,
	type PlanNodes,
	tryQueryPlanNodeChildren,
	type TypedPlanNode,
} from "@/planner/parsing/guards.ts";
import { evaluateWeight } from "@/quantities-dynamic";
import { getAverageBodyweight, type IStats } from "@/fitness-stats";
import {
	getDayData,
	getTotalDaysInProgram,
	getWarmupSets as getProgramWarmupSets,
	type IDayData,
	type IEvaluatedProgramDay,
	type IPlannerProgram,
	type IPlannerProgramDay,
	type IPlannerProgramWeek,
	type IProgram,
	type IProgramExerciseWarmupSet,
	type IProgramStateMetadata,
	Program_getProgramDayUsedExercises,
	Program_getProgramExercise,
	Program_getProgramExerciseForKeyAndDay,
	Program_nextDay,
} from "@/program";
import {
	findErrorNode,
	type ISyntaxPointer,
	nodeError,
	parseBound,
	SourcedSyntaxError,
	type SourcedSyntaxNode,
} from "@/utils/lezer.ts";
import { isEqual, omitBy } from "es-toolkit";
import type { SetRequired, Tagged } from "type-fest";
import { run, validate } from "@/logic/evaluators";
import { queryChildren } from "@/utils/grammars.ts";
import { IProgramMode } from "@/logic/evaluators/types.ts";
import { PlannerEvaluator_forceEvaluate, PlannerProgram_evaluate } from "@/planner/evaluators";
import { parser as plannerExerciseParser } from "@/planner/parsing/workout-plan.ts";
import { asProgramScript } from "@/planner/display.ts";
import { evaluate as evaluateExerciseExpression } from "@/planner/evaluators/node-exercise-expression.ts";
import { hasNonWhitespace, isNonEmpty, StringUtils_unindent } from "@/utils/string.ts";
import {
	as1,
	castAs0,
	castAs1,
	type IndexFrom0,
	type IndexFrom1,
	next,
	safeFindLastIndex,
	withIndex,
	ZERO,
	zIndexFrom1,
} from "@/utils/indexes.ts";
import { pipe } from "effect";
import { $, orUndefined } from "@/utils/effects.ts";
import { type IPlannerProgramExerciseEvaluatedSet, tryGetWeight } from "@/sets";
import { rpeMultiplier } from "@/rate-of-perceived-exertion.ts";
import { asNumericAscending, asNumericDescending, by } from "@/utils/sorting.ts";

//#region Program

type IByTag<T> = Record<number, T>;

export interface IEvaluatedProgram {
	id: string;
	planner: IPlannerProgram;
	name: string;
	nextDay: IndexFrom1;
	errors: {
		error: SourcedSyntaxError;
		dayData: IDayData;
	}[];
	weeks: {
		name: string;
		description?: string;
		days: IEvaluatedProgramDay[];
	}[];
	states: IByTag<IProgramState>;
}

function Program_nextHistoryEntry(
	program: IEvaluatedProgram,
	dayData: IDayData,
	index: number,
	programExercise: IPlannerProgramExerciseWithType,
	stats: IStats,
	settings: ISettings,
): IHistoryEntry {
	const sets = programExercise.evaluatedSetVariations
		.at(findIndexOfCurrentOrFirst(programExercise.evaluatedSetVariations))
		?.sets.map(
			withIndex(
				(programSet, i): ISet => ({
					id: generateUid(6),
					reps: programSet.maxrep,
					index: i,
					minReps: programSet?.minrep !== programSet.maxrep ? programSet.minrep : undefined,
					weight: ProgramSet_getEvaluatedWeight(
						programSet,
						programExercise.exerciseType,
						settings,
					).pipe(orUndefined),
					isUnilateral: isUnilateral(programExercise.exerciseType, settings.exerciseData),
					rpe: programSet.rpe,
					timer: programSet.timer,
					logRpe: programSet.logRpe,
					askWeight: programSet.askWeight,
					originalWeight: programSet.weight,
					isAmrap: programSet.isAmrap,
					label: programSet.label,
					isCompleted: false,
					programSetIndex: i,
				}),
			),
		);

	return Progress_runUpdateScriptForEntry(
		{
			id: [programExercise.label, toKey(programExercise.exerciseType)]
				.filter(definedOnly)
				.join("_"),
			index,
			exercise: programExercise.exerciseType,
			programExerciseId: programExercise.key,
			sets: sets ?? [],
			superset: programExercise.superset?.name,
			warmupSets: getProgramWarmupSets(
				programExercise.exerciseType,
				sets?.at(0)?.weight,
				settings,
				PlannerProgramExercise_programWarmups(programExercise, settings),
			),
		},
		dayData,
		programExercise,
		program.states,
		-1,
		settings,
		stats,
	);
}

export function Program_nextHistoryRecordFromEvaluated(
	program: IEvaluatedProgram,
	settings: ISettings,
	stats: IStats,
	dayIndex?: number,
): IHistoryRecord {
	const day = castAs1(
		Math.max(
			1,
			Math.min(getTotalDaysInProgram(program), Math.max(1, (dayIndex || program.nextDay) ?? 0)),
		),
	);

	const dayData = getDayData(program, day);
	const dayExercises = dayData.dayObj ? Program_getProgramDayUsedExercises(dayData.dayObj) : [];
	const week = program.weeks[dayData.week - 1];
	const isMultiweek = program.weeks.length > 1 && week != null;
	const now = Date.now();

	return {
		id: 0,
		date: new Date().toISOString(),
		programId: program.id,
		programName: program.name,
		intervals: [],
		day,
		week: dayData.week,
		dayInWeek: dayData.dayInWeek,
		dayName: `${isMultiweek ? `${week.name} - ` : ""}${dayData.dayObj?.name}`,
		startTime: now,
		updatedAt: now,
		entries: dayExercises
			.toSorted(by(exercise => exercise.order, asNumericAscending))
			.map((exercise, i) =>
				Program_nextHistoryEntry(program, dayData, i, exercise, stats, settings),
			),
	};
}

function Program_runFinishDayScript(
	programExercise: IPlannerProgramExercise,
	program: IEvaluatedProgram,
	dayData: IDayData,
	entry: IHistoryEntry,
	settings: ISettings,
	stats: IStats,
	userPromptedStateVars?: IProgramState,
): IEither<
	{
		state: IProgramState;
		otherStates: Record<number, IProgramState>;
		updates: ILiftoscriptEvaluatorUpdate[];
		bindings: IScriptBindings;
	},
	string
> {
	const state = PlannerProgramExercise_getState(programExercise);
	const setVariationIndex = findIndexOfCurrentOrFirst(programExercise.evaluatedSetVariations);

	const bindings = Progress_createScriptBindings(
		dayData,
		entry,
		settings,
		programExercise.evaluatedSetVariations[setVariationIndex]?.sets.length ?? 0,
		getAverageBodyweight(
			stats,
			settings.units,
			settings.graphOptions.weight?.movingAverageWindowSize,
		),
		undefined,
		as1(setVariationIndex),
		as1(findIndexOfCurrentOrFirst(programExercise.descriptions.values)),
	);

	const otherStates = structuredClone(program.states);
	// @todo replace all syntaxerror throws with returns, and unwrap this try/catch. Confirmed that only run itself throws, not the functions called to make the args.
	const result = run(
		PlannerProgramExercise_getProgressScript(programExercise) || "",
		{
			...state,
			...userPromptedStateVars,
		},
		bindings,
		Progress_createScriptFunctions(settings),
		{
			exerciseType: programExercise.exerciseType,
			unit: settings.units,
			prints: [],
		},
		otherStates,
		IProgramMode.PLANNER,
	);

	const stateDiff = omitBy(result.finalState, (value, key) => state[key] === value);
	const diffOtherStates = ObjectUtils_keys(otherStates).reduce<IByTag<IProgramState>>(
		(memo, key) => {
			if (!isEqual(otherStates[key], program.states[key])) {
				memo[key] = ObjectUtils_keys(otherStates[key]).reduce<IProgramState>((memo2, key2) => {
					if (!eq(otherStates[key][key2], program.states[key][key2])) {
						memo2[key2] = otherStates[key][key2];
					}
					return memo2;
				}, {});
			}
			return memo;
		},
		{},
	);

	return {
		success: true,
		data: {
			state: stateDiff,
			otherStates: diffOtherStates,
			updates: result.updates,
			bindings,
		},
	};
}

type IExerciseData = OpenRecord<IExerciseDataValue>;
export function Program_runAllFinishDayScripts(
	program: IProgram,
	progress: IHistoryRecord,
	stats: IStats,
	settings: ISettings,
): { program: IProgram; exerciseData: IExerciseData } {
	const newEvaluatedProgram = Program_forceEvaluate(program, settings);
	if (!getDayData(newEvaluatedProgram, progress.day).dayObj) {
		return { program, exerciseData: {} };
	}

	const exerciseData: IExerciseData = {};
	const dayData = getDayData(newEvaluatedProgram, progress.day);

	for (const entry of progress.entries) {
		if (entry == null || entry.isSuppressed || entry.sets.every(s => !s.isCompleted)) {
			continue;
		}
		const programExercise = Program_getProgramExerciseForKeyAndDay(
			newEvaluatedProgram,
			dayData.day,
			entry.programExerciseId,
		);
		if (!programExercise) {
			continue;
		}
		const newStateResult = Program_runFinishDayScript(
			programExercise,
			newEvaluatedProgram,
			dayData,
			entry,
			settings,
			stats,
			progress.userPromptedStateVars?.[programExercise.key],
		);
		if (!newStateResult.success) {
			continue;
		}
		const { state, updates, bindings, otherStates } = newStateResult.data;
		const exerciseKey = toKey(entry.exercise);
		if (!eq(bindings.rm1, getOrmOrStartingWeight(entry.exercise, settings))) {
			exerciseData[exerciseKey] = {
				rm1: roundTo005(bindings.rm1),
			};
		}
		forExerciseInEvaluatedWeeks(newEvaluatedProgram.weeks, exercise => {
			if (exercise.key === programExercise.key && exercise.progress) {
				exercise.progress.state = {
					...exercise.progress.state,
					...entry.state,
					...state,
				};
			}
		});
		updates.forEach(update =>
			ProgramExercise_applyVariables(programExercise.key, newEvaluatedProgram, update, settings),
		);
		for (const key of ObjectUtils_keys(otherStates || {})) {
			forExerciseInEvaluatedWeeks(newEvaluatedProgram.weeks, exercise => {
				if (exercise.tags?.includes(Number(key)) && exercise.progress) {
					exercise.progress.state = {
						...exercise.progress.state,
						...otherStates[key],
					};
				}
			});
		}
	}

	return {
		program: {
			...structuredClone(program),
			nextDay: Program_nextDay(newEvaluatedProgram, progress.day),
			planner: convertToPlanner(newEvaluatedProgram, settings),
		},
		exerciseData,
	};
}

function Program_forceEvaluate(program: IProgram, settings: ISettings): IEvaluatedProgram {
	const planner = program.planner;
	if (!planner) {
		return {
			id: program.id,
			planner: {
				name: program.name,
				weeks: [{ name: "Week 1", days: [{ name: "Day 1", exerciseText: "" }] }],
			},
			name: program.name,
			errors: [],
			nextDay: program.nextDay,
			weeks: [
				{
					name: "Week 1",
					days: [
						{
							name: "Day 1",
							dayData: { day: as1(0), week: as1(0), dayInWeek: as1(0) },
							exercises: [],
						},
					],
				},
			],
			states: {},
		};
	}
	const { evaluatedWeeks } = PlannerEvaluator_forceEvaluate(planner, settings);
	let dayNum = as1(0);
	const errors: IEvaluatedProgram["errors"] = [];
	const weeks = planner.weeks.map(
		withIndex((week, weekIndex) => {
			const evaluatedWeek = evaluatedWeeks[weekIndex];
			const days = week.days.map(
				withIndex((day, dayInWeekIndex) => {
					const evaluatedDay = evaluatedWeek[dayInWeekIndex];
					const dayData: IDayData = {
						day: dayNum,
						week: as1(weekIndex),
						dayInWeek: as1(dayInWeekIndex),
					};
					dayNum = next(dayNum);
					const evaluatedExercises = (evaluatedDay.success ? evaluatedDay.data : []).toSorted(
						by(exercise => exercise.order, asNumericAscending),
					);
					if (!evaluatedDay.success) {
						errors.push({ error: evaluatedDay.error, dayData });
					}
					return {
						name: day.name,
						description: day.description,
						dayData,
						exercises: evaluatedExercises,
					};
				}),
			);
			return { name: week.name, description: week.description, days };
		}),
	);
	const states: IByTag<IProgramState> = {};
	forExerciseInEvaluatedResults(evaluatedWeeks, exercise => {
		for (const tag of exercise.tags) {
			states[tag] = {
				...states[tag],
				...PlannerProgramExercise_getState(exercise),
			};
		}
	});

	return {
		id: program.id,
		errors,
		planner,
		name: program.name,
		nextDay: program.nextDay,
		weeks,
		states,
	};
}

export function Program_create(name: string, id?: string): IProgram {
	return {
		id: id || generateUid(8),
		name,
		url: "",
		author: "",
		shortDescription: "",
		description: "",
		nextDay: as1(0),
		weeks: [],
		days: [{ id: generateUid(8), name: "Day 1", exercises: [] }],
		exercises: [],
		deletedDays: [],
		deletedWeeks: [],
		deletedExercises: [],
		clonedAt: Date.now(),
	};
}

export const Program_evaluate = memoize(Program_forceEvaluate, { maxSize: 10 });

//#endregion

//#region Types

const THistoryEntry = z.strictObject({
	exercise: TExerciseType,
	sets: z.array(TSet),
	warmupSets: z.array(TSet),
	index: z.number(),
	id: z.string(),
	programExerciseId: z.string().optional(),
	state: TProgramState.optional(),
	vars: TProgramState.optional(),
	notes: z.string().optional(),
	changed: z.boolean().optional(),
	isSuppressed: z.boolean().optional(),
	superset: z.string().optional(),
	updatePrints: z.array(z.array(z.union([z.number(), TWeight, TDynamicWeight]))).optional(),
});
export type IHistoryEntry = z.infer<typeof THistoryEntry>;

const THistoryRecord = z.strictObject({
	date: z.string(),
	programId: z.string(),
	programName: z.string(),
	day: zIndexFrom1,
	dayName: z.string(),
	entries: z.array(THistoryEntry),
	startTime: z.number(),
	id: z.number(),
	endTime: z.number().optional(),
	week: z.number().optional(),
	dayInWeek: z.number().optional(),
	intervals: z
		.array(z.tuple([z.number(), z.union([z.number(), z.undefined(), z.null()])]))
		.optional(),
	deletedProgramExercises: z.record(z.string(), z.union([z.boolean(), z.undefined()])).optional(),
	userPromptedStateVars: z.record(z.string(), z.union([TProgramState, z.undefined()])).optional(),
	changes: z.array(z.enum(["order"] as const)).optional(),
	timerSince: z.number().optional(),
	timerMode: z.enum(["warmup", "workout"]).optional(),
	timer: z.number().optional(),
	timerEntryIndex: z.number().optional(),
	timerSetIndex: z.number().optional(),
	notes: z.string().optional(),
	updatedAt: z.number().optional(),
});
export type IHistoryRecord = z.infer<typeof THistoryRecord>;

//#endregion

//#region Program Exercise

export interface IWeightChange {
	originalWeight: IWeight | IDynamicWeight;
	weight: IWeight | IDynamicWeight;
	current: boolean;
}

export function ProgramExercise_weightChanges(
	program: IEvaluatedProgram,
	programExerciseKey: string,
): IWeightChange[] {
	const results: Record<string, IWeightChange> = {};
	forExerciseInEvaluatedWeeks(program.weeks, exercise => {
		if (exercise.key !== programExerciseKey) {
			return;
		}
		const currentVariationIndex = findIndexOfCurrentOrFirst(exercise.evaluatedSetVariations);
		for (const [variationIndex, variation] of exercise.evaluatedSetVariations.entries()) {
			for (const set of variation.sets) {
				if (!set.weight) {
					continue;
				}
				const key = print(set.weight);
				results[key] = {
					originalWeight: set.weight,
					weight: set.weight,
					current: results[key]?.current || variationIndex + 1 === currentVariationIndex,
				};
			}
		}
	});
	return Object.values(results).sort(by(val => Number(val.current), asNumericDescending));
}

function ProgramExercise_applyVariables(
	programExerciseKey: string,
	program: IEvaluatedProgram,
	update: ILiftoscriptEvaluatorUpdate,
	settings: ISettings,
): void {
	const { type: key, value } = update;
	const [week, day, variation, set] = value.target;
	for (const [weekIndex, programWeek] of program.weeks.entries()) {
		for (const [dayInWeekIndex, dayInWeek] of programWeek.days.entries()) {
			for (const exercise of dayInWeek.exercises.filter(hasExerciseType)) {
				if (
					exercise.key !== programExerciseKey ||
					(week !== "*" && week !== weekIndex + 1) ||
					(day !== "*" && day !== dayInWeekIndex + 1)
				) {
					continue;
				}
				switch (key) {
					case "numberOfSets": {
						const val = value.value;
						if (!isNumber(val)) break;
						exercise.evaluatedSetVariations
							.entries()
							.filter(([variationIndex]) => variation === "*" || variation === variationIndex + 1)
							.forEach(([, evaluatedVariation]) => {
								const sets = evaluatedVariation.sets;
								const newValue = MathUtils_applyOp(sets.length, val, value.op);
								const lastSet = sets[sets.length - 1] || {
									maxrep: 1,
									weight: w`100lb`,
									logRpe: false,
									isAmrap: false,
									isQuickAddSet: false,
									askWeight: false,
								};
								sets.splice(newValue);
								for (let i = sets.length; i < newValue; i += 1) {
									sets.push(structuredClone(lastSet));
								}
							});
						break;
					}
					case "RPE":
					case "reps":
					case "minReps":
					case "timers":
					case "weights":
					case "amraps":
					case "logrpes":
					case "askweights": {
						exercise.evaluatedSetVariations
							.entries()
							.filter(([variationIndex]) => variation === "*" || variation === variationIndex + 1)
							.forEach(([, evaluatedVariation]) => {
								for (let setIndex = 0; setIndex < evaluatedVariation.sets.length; setIndex += 1) {
									if (set === "*" || set === setIndex + 1) {
										operation(
											exercise,
											evaluatedVariation.sets[setIndex],
											settings,
											(
												{
													RPE: "rpe",
													reps: "maxrep",
													minReps: "minrep",
													timers: "timer",
													weights: "weight",
													amraps: "isAmrap",
													logrpes: "logRpe",
													askweights: "askWeight",
												} as const
											)[key],
											value.value,
											value.op,
										);
									}
								}
							});
						break;
					}
					case "setVariationIndex":
					case "descriptionIndex": {
						const structureToIndex =
							key === "descriptionIndex"
								? exercise.descriptions.values
								: exercise.evaluatedSetVariations;
						let indexValue =
							value.op === "="
								? value.value - 1
								: applyOp(
										undefined,
										findIndexOfCurrentOrFirst(structureToIndex),
										value.value,
										value.op,
									);
						indexValue = indexValue % structureToIndex.length;
						// Ensures 1 and only 1 of the items is marked "current".
						structureToIndex.forEach((s, index) => {
							s.isCurrent = index === indexValue;
						});
						break;
					}
					default:
						key satisfies never;
				}
			}
		}
	}
}

function operation(
	programExercise: IPlannerProgramExerciseWithType,
	set: IPlannerProgramExerciseEvaluatedSet,
	settings: ISettings,
	key: "maxrep" | "minrep" | "weight" | "rpe" | "timer" | "logRpe" | "isAmrap" | "askWeight",
	value: Quantity,
	op: IAssignmentOp,
): void {
	const valueToAssign = applyOp(
		getOrmOrStartingWeight(programExercise.exerciseType, settings),
		set[key] ??
			ProgramSet_getEvaluatedWeight(set, programExercise.exerciseType, settings).pipe(orUndefined),
		value,
		op,
	);

	switch (key) {
		case "weight": {
			if (is(TWeight, valueToAssign) || is(TDynamicWeight, valueToAssign)) {
				set[key] = valueToAssign;
			}
			break;
		}
		case "maxrep":
		case "minrep":
		case "timer":
		case "rpe": {
			if (isNumber(valueToAssign)) {
				set[key] = valueToAssign;
			}
			break;
		}
		case "askWeight":
		case "isAmrap":
		case "logRpe": {
			if (isNumber(valueToAssign)) {
				set[key] = valueToAssign !== 0;
			}
			break;
		}
		default:
			key satisfies never;
	}
}

//#endregion

//#region Planner Key

type PlannerKey = Tagged<string, "plannerKey">;
export function makePlannerKey(label: string | undefined, key: string): PlannerKey {
	return `${label ? `${label}-` : ""}${key}`.toLowerCase() as PlannerKey;
}

export const PlannerKey_fromFullName = (
	fullName: string,
	exercises: IAllCustomExercises,
): PlannerKey => {
	const { label, name, equipment } = extractNameParts(fullName, exercises);
	return PlannerKey_fromLabelNameAndEquipment(label, name, equipment, exercises);
};

export const PlannerKey_fromLabelNameAndEquipment = memoize(
	(
		label: string | undefined,
		name: string,
		equipment: string | undefined,
		exercises: IAllCustomExercises,
	): PlannerKey => {
		const exercise = Exercise_findByNameEquipment(exercises, name, equipment);
		return makePlannerKey(label, exercise ? toKey(exercise) : name);
	},
	{
		maxSize: 1000,
	},
);
//#endregion

//#region Pages Planner Model Types
export type IPlannerProgramExercise = {
	id: string;
	key: PlannerKey;
	fullName: string;
	shortName: string;
	dayData: IDayData;
	exerciseType?: IExerciseType;
	label?: string;
	exerciseIndex: number;
	repeat: IndexFrom1[];
	repeating: number[];
	order: number;
	isRepeat?: boolean;
	text: string;
	tags: number[];
	equipment?: string;
	name: string;
	line: number;
	reuse?: IPlannerProgramReuse;
	superset?: IPlannerProgramExerciseSuperset;
	notused?: boolean;
	evaluatedSetVariations: IPlannerProgramExerciseEvaluatedSetVariation[];
	setVariations: IPlannerProgramExerciseSetVariation[];
	warmupSets?: IPlannerProgramExerciseWarmupSet[];
	descriptions: IProgramExerciseDescriptions;
	globals: {
		logRpe?: boolean;
		rpe?: number;
		timer?: number;
		percentage?: number;
		weight?: IWeight;
		askWeight?: boolean;
	};
	progress?: IProgramExerciseProgress;
	update?: IProgramExerciseUpdate;
	points: {
		fullName: ISyntaxPointer;
		supersetPoint?: ISyntaxPointer;
		reuseSetPoint?: ISyntaxPointer;
		progressPoint?: ISyntaxPointer;
		updatePoint?: ISyntaxPointer;
		idPoint?: ISyntaxPointer;
		warmupPoint?: ISyntaxPointer;
	};
};

export type IPlannerProgramExerciseWithType = SetRequired<IPlannerProgramExercise, "exerciseType">;
function hasExerciseType(
	exercise: IPlannerProgramExercise,
): exercise is IPlannerProgramExerciseWithType {
	return exercise.exerciseType !== undefined;
}

export interface IPlannerProgramExerciseSetVariation {
	sets: IPlannerProgramExerciseSet[];
	isCurrent: boolean;
}

interface IPlannerProgramExerciseEvaluatedSetVariation {
	sets: IPlannerProgramExerciseEvaluatedSet[];
	isCurrent: boolean;
}

export interface IPlannerProgramExerciseSet {
	repRange?: IRepRange;
	timer?: number;
	rpe?: number;
	logRpe?: boolean;
	percentage?: number;
	weight?: IWeight;
	label?: string;
	askWeight?: boolean;
}

export interface IPlannerProgramExerciseWarmupSet {
	type: "warmup";
	numberOfSets: number;
	reps: number;
	percentage?: number;
	weight?: IWeight;
}

export interface IPlannerProgramExerciseSuperset {
	name: string;
}

export interface IPlannerProgramReuse {
	fullName: string;
	source: "specific" | "overall";
	week?: IndexFrom1;
	day?: IndexFrom1;
	exercise?: IPlannerProgramExercise;
}

export interface IProgramExerciseDescriptions {
	values: {
		value: string;
		isCurrent: boolean;
	}[];
	reuse?: IPlannerProgramReuse;
}

/**
 * @todo what relationship does this have to {@link IProgramExerciseUpdateType}, if any? Can they be combined?
 */
export enum IProgramExerciseProgressType {
	CUSTOM = "custom",
	LP = "lp",
	DP = "dp",
	SUM = "sum",
	NONE = "none",
}
export interface IProgramExerciseProgress {
	type: IProgramExerciseProgressType;
	state: IProgramState;
	stateMetadata: IProgramStateMetadata;
	script?: string;
	reuse?: IPlannerProgramReuse;
	liftoscriptNode?: SyntaxNode;
}

export enum IProgramExerciseUpdateType {
	CUSTOM = "custom",
	LP = "lp",
	DP = "dp",
	SUM = "sum",
}
export interface IProgramExerciseUpdate {
	type: IProgramExerciseUpdateType;
	script?: string;
	reuse?: IPlannerProgramReuse;
	liftoscriptNode?: SourcedSyntaxNode;
	meta?: {
		stateKeys?: Set<string>;
	};
}

//#endregion

//#region Planner Exercise Evaluator
export type IPlannerTopLineItem =
	| {
			type: "exercise";
			value: string;
			exerciseIndex: number;
			order: number;
			fullName: string;
			repeatRanges: string[];
			descriptions: string[];
			sections: string;
			sectionsToReuse: string;
			notused: boolean;
			// @todo does having this be nullish mean something? Or was that just lazy typing?
			repeat?: number[];
	  }
	| {
			type: "comment" | "description" | "empty";
			value: string;
	  };

export type IPlannerEvalResult = IEither<IPlannerProgramExercise[], SourcedSyntaxError>;

interface IPlannerExerciseEvaluatorWeek {
	name: string;
	line: number;
	days: { name: string; line: number; exercises: IPlannerProgramExercise[] }[];
}

/**
 * perday -> single-day exercise list
 * full -> full program with structured exercises
 * fulltext -> preserve raw source lines for round-trip text
 */
export enum IPlannerExerciseEvaluatorMode {
	PERDAY = "perday",
	FULL = "full",
	FULLTEXT = "fulltext",
}

export function fnArgsToStateVars(
	fnArgs: string[],
	onError?: (message: string) => void,
): {
	state: IProgramState;
	stateMetadata: IProgramStateMetadata;
} {
	const state: IProgramState = {};
	const stateMetadata: IProgramStateMetadata = {};
	for (const value of fnArgs) {
		let [fnArgKey, fnArgValStr] = value.split(":").map(v => v.trim());
		if (onError && (!fnArgKey || !fnArgValStr)) {
			onError(`Invalid argument ${value}`);
		}
		if (fnArgKey.endsWith("+")) {
			fnArgKey = fnArgKey.replace("+", "");
			stateMetadata[fnArgKey] = { userPrompted: true };
		} else {
			stateMetadata[fnArgKey] = { userPrompted: false };
		}
		try {
			const fnArgVal = fnArgValStr.match(/(lb|kg)/)
				? parseWeight(fnArgValStr)
				: fnArgValStr.match(/%/)
					? percentORM(parseFloat(fnArgValStr))
					: MathUtils_roundFloat(parseFloat(fnArgValStr), 2);
			state[fnArgKey] = fnArgVal ?? 0;
		} catch (e) {
			if (onError) {
				onError(`Invalid argument ${value}`);
			} else {
				throw e;
			}
		}
	}
	return { state, stateMetadata };
}

export const extractNameParts = memoize(
	(
		str: string,
		exercises: IAllCustomExercises,
	): { name: string; label?: string; equipment?: string } => {
		let [label, ...nameEquipmentItems] = str.split(":");
		if (nameEquipmentItems.length === 0) {
			nameEquipmentItems = [label];
			label = "";
		} else {
			label = label.trim();
		}
		const nameEquipment = nameEquipmentItems.join(":").trim();
		const matchingExercise = Exercise_findByNameAndEquipment(nameEquipment, exercises);
		if (matchingExercise) {
			return {
				name: matchingExercise.name,
				label: label ? label : undefined,
				equipment: matchingExercise.equipment,
			};
		}
		return { name: nameEquipment, label: label ? label : undefined };
	},
	{ maxSize: 1000 },
);

export const getNodeSourceEscapedWhiteSpace = (node: SourcedSyntaxNode): string =>
	node.source.replace(/\n/g, "\\n").replace(/\t/g, "\\t");

export function getWeight(expr?: SourcedSyntaxNode | null): IWeight | undefined {
	if (
		expr?.type.name === PlannerNodeName.WeightWithPlus ||
		expr?.type.name === PlannerNodeName.Weight
	) {
		const value = getNodeSourceEscapedWhiteSpace(expr).replace("+", "");
		const unit = value.indexOf("kg") !== -1 ? "kg" : "lb";
		return build(parseFloat(value), unit);
	} else {
		return undefined;
	}
}

export function getOrder(expr: PlanNodes.ExerciseExpression): number {
	const repeatNode = expr.getChild(PlannerNodeName.Repeat);
	if (repeatNode == null) {
		return 0;
	}
	for (const childNode of queryChildren(repeatNode)) {
		if (childNode.type.name === PlannerNodeName.Rep) {
			return parseInt(getNodeSourceEscapedWhiteSpace(childNode), 10);
		}
	}
	return 0;
}

export function getRepeat(expr: PlanNodes.ExerciseExpression): IndexFrom1[] {
	const repeatNode = expr.getChild(PlannerNodeName.Repeat);
	if (repeatNode == null) {
		return [];
	}
	const result: Set<IndexFrom1> = new Set();
	for (const childNode of queryChildren(repeatNode)) {
		if (childNode.type.name === PlannerNodeName.RepRange) {
			const [from, to] = queryChildren(childNode, { atLeast: 2 }).map(n =>
				castAs1(parseInt(getNodeSourceEscapedWhiteSpace(n), 10)),
			);
			for (let i = from; i <= to; i = next(i)) {
				result.add(i);
			}
			break;
		}
	}
	return Array.from(result).sort((a, b) => a - b);
}

export function getIsNotUsed(expr: PlanNodes.ExerciseExpression): boolean {
	const sections = expr.getChildren(PlannerNodeName.ExerciseSection);
	for (const section of sections) {
		const properties = section.getChildren(PlannerNodeName.ExerciseProperty);
		for (const property of properties) {
			const nameNode = property.getChild(PlannerNodeName.ExercisePropertyName);
			const name = nameNode ? nameNode.source : undefined;
			const valueNode = property.getChild(PlannerNodeName.None);
			if (name === "used" && valueNode != null) {
				return true;
			}
		}
	}
	return false;
}

export function evaluate(
	programNode: SourcedSyntaxNode,
	settings: ISettings,
	mode: IPlannerExerciseEvaluatorMode,
	dayDataRaw: IDayData | undefined,
): NodeResult<IPlannerExerciseEvaluatorWeek[]> {
	let dayData: IDayData = dayDataRaw ?? {
		day: as1(0),
		week: as1(0),
		dayInWeek: as1(0),
	};
	try {
		const firstError = findErrorNode(programNode);
		if (firstError) {
			return nodeFailure(nodeError(firstError));
		}
		if (programNode.type.name !== PlannerNodeName.Program) {
			return nodeFailure(
				nodeError(programNode, `Unexpected node type ${programNode.node.type.name}`),
			);
		}

		let weeks: IPlannerExerciseEvaluatorWeek[] = [];
		let exerciseIndex = 0;
		let latestDescriptions: string[][] = [];
		for (const child of queryChildren(programNode).filter(definedOnly)) {
			switch (child.type.name) {
				case PlannerNodeName.EmptyExpression:
				case PlannerNodeName.TripleLineComment:
					if (latestDescriptions.length > 0) {
						latestDescriptions.push([]);
					}
					break;
				case PlannerNodeName.Week:
					if (mode === "perday") {
						return {
							success: false,
							error: nodeError(
								child,
								`You cannot specify weeks in the per-day exercise lists. Switch to the full program mode for that.`,
							),
						};
					}
					const weekName = child.source.replace(/^#+/, "").trim();
					weeks.push({
						name: weekName,
						line: child.getPointer().line,
						days: [],
					});
					dayData = {
						day: dayData.day,
						week: as1(castAs0(weeks.length)),
						dayInWeek: castAs1(0),
					};
					break;
				case PlannerNodeName.Day:
					if (mode === "perday") {
						return {
							success: false,
							error: nodeError(
								child,
								`You cannot specify days in the per-day exercise lists. Switch to the full program mode for that.`,
							),
						};
					}
					if (weeks.length === 0) {
						return {
							success: false,
							error: nodeError(child, `You need to specify a week before a day`),
						};
					}
					const dayName = child.source.replace(/^#+/, "").trim();
					weeks[weeks.length - 1].days.push({
						name: dayName,
						line: child.getPointer().line,
						exercises: [],
					});
					dayData = {
						day: next(dayData.day),
						week: dayData.week,
						dayInWeek: dayData.dayInWeek,
					};
					exerciseIndex = 0;
					break;
				case PlannerNodeName.LineComment:
					const value = child.source.trim();
					if (latestDescriptions.length === 0) {
						latestDescriptions.push([]);
					}
					latestDescriptions[latestDescriptions.length - 1].push(value.replace(/^\/\//, ""));
					break;
				case PlannerNodeName.ExerciseExpression: {
					// Freezes the type narrowing to definitely defined.
					const frozenDayData = dayData;
					if (
						mode === IPlannerExerciseEvaluatorMode.FULL &&
						(weeks.at(-1)?.days ?? []).length === 0
					) {
						return {
							success: false,
							error: nodeError(
								child,
								`You should first define a week and a day before listing exercises.`,
							),
						};
					}
					if (weeks.length === 0) {
						weeks.push({
							name: "Week 1",
							line: 1,
							days: [{ name: "Day 1", line: 1, exercises: [] }],
						});
					}
					const result = evaluateExerciseExpression(
						child as PlanNodes.ExerciseExpression,
						frozenDayData,
						() => Progress_createEmptyScriptBindings(frozenDayData, settings),
						() => Progress_createScriptFunctions(settings),
						settings.exercises,
						exerciseIndex,
						() => {
							const rawDescriptions: string[] = latestDescriptions.map(d => d.join("\n"));
							const currentDescriptionIndex = rawDescriptions.findIndex(d => /^\s*!/.test(d));
							let descriptions = rawDescriptions.map((d, i) => ({
								value: d.replace(/^\s*!/, ""),
								isCurrent: i === currentDescriptionIndex,
							}));
							if (descriptions.length > 1) {
								descriptions = descriptions.filter(d => d.value);
							}
							descriptions = descriptions.map(d => ({
								...d,
								value: StringUtils_unindent(d.value),
							}));
							latestDescriptions = [];
							return descriptions;
						},
					);
					if (!result.success) {
						return result;
					}
					const plannerExercise = result.data;
					weeks.at(-1)?.days.at(-1)?.exercises.push(plannerExercise);
					if (!plannerExercise.notused) {
						exerciseIndex += 1;
					}
					break;
				}
				default:
					return {
						success: false,
						error: nodeError(child, `Unexpected node type ${child.node.type.name}`),
					};
			}
		}
		return { data: weeks, success: true };
	} catch (e) {
		if (e instanceof SourcedSyntaxError) {
			return { error: e, success: false };
		} else {
			throw e;
		}
	}
}

//#endregion

//#region Planner Program Exercise

export function PlannerProgramExercise_setVariations(
	exercise: IPlannerProgramExercise,
): IPlannerProgramExerciseSetVariation[] {
	const originalSetVariations = exercise.setVariations;
	const reuseSetVariations = exercise.reuse?.exercise?.setVariations;
	const setVariations =
		(originalSetVariations?.length > 0 ? originalSetVariations : reuseSetVariations) || [];
	return setVariations.length === 0
		? [{ sets: PlannerProgramExercise_sets(exercise), isCurrent: true }]
		: setVariations;
}

function PlannerProgramExercise_programWarmups(
	exercise: IPlannerProgramExercise,
	settings: ISettings,
): IProgramExerciseWarmupSet[] | undefined {
	const exerciseWarmups = exercise.warmupSets || exercise.reuse?.exercise?.warmupSets;
	if (exerciseWarmups == null) {
		return undefined;
	}
	const sets: IProgramExerciseWarmupSet[] = [];
	for (const ws of exerciseWarmups) {
		for (let i = 0; i < ws.numberOfSets; i += 1) {
			let value: IWeight | number | undefined = ws.percentage ? ws.percentage / 100 : undefined;
			value ??= ws.weight ?? MathUtils_roundTo0005(rpeMultiplier(ws.reps, 4));
			sets.push({
				reps: ws.reps,
				value,
				threshold: build(0, settings.units),
			});
		}
	}
	return sets;
}

export function PlannerProgramExercise_evaluateSetVariations(
	exercise: IPlannerProgramExercise,
	setVariations: IPlannerProgramExerciseSetVariation[],
): IPlannerProgramExerciseEvaluatedSetVariation[] {
	const evaluatedSetVariations: IPlannerProgramExerciseEvaluatedSetVariation[] = [];
	for (let i = 0; i < setVariations.length; i++) {
		const sets = PlannerProgramExercise_sets(exercise, i);
		const evaluatedSets: IPlannerProgramExerciseEvaluatedSet[] = [];
		for (const aSet of sets) {
			if (aSet.repRange == null) {
				continue;
			}
			for (let j = 0; j < aSet.repRange.numberOfSets; j++) {
				evaluatedSets.push({
					maxrep: aSet.repRange.maxrep,
					minrep: aSet.repRange.minrep,
					weight: aSet.weight
						? aSet.weight
						: aSet.percentage
							? percentORM(aSet.percentage)
							: undefined,
					timer: aSet.timer,
					rpe: aSet.rpe,
					logRpe: !!aSet.logRpe,
					label: aSet.label,
					isAmrap: aSet.repRange.isAmrap,
					isQuickAddSet: aSet.repRange.isQuickAddSet,
					askWeight: !!aSet.askWeight,
				});
			}
		}
		evaluatedSetVariations.push({
			sets: evaluatedSets,
			isCurrent: setVariations[i].isCurrent,
		});
	}
	return evaluatedSetVariations;
}

function PlannerProgramExercise_sets(
	exercise: IPlannerProgramExercise,
	variationIndex?: number,
): IPlannerProgramExerciseSet[] {
	const reusedSets = exercise.reuse?.exercise
		? exercise.reuse?.exercise?.setVariations[
				variationIndex ?? findIndexOfCurrentOrFirst(exercise.reuse?.exercise.setVariations)
			]?.sets
		: undefined;
	const reusedGlobals = exercise.reuse?.exercise?.globals || {};
	variationIndex = variationIndex ?? findIndexOfCurrentOrFirst(exercise.setVariations);
	const currentSets = exercise.setVariations[variationIndex]?.sets;
	const currentGlobals = exercise.globals;
	return (currentSets || reusedSets || []).map(aSet => {
		const set: IPlannerProgramExerciseSet = structuredClone(aSet);
		set.rpe = currentGlobals.rpe != null ? currentGlobals.rpe : (set.rpe ?? reusedGlobals.rpe);
		set.timer =
			currentGlobals.timer != null ? currentGlobals.timer : (set.timer ?? reusedGlobals.timer);
		if (currentGlobals.weight != null || currentGlobals.percentage != null) {
			if (currentGlobals.weight != null) {
				set.weight = currentGlobals.weight;
				set.percentage = undefined;
			} else {
				set.percentage = currentGlobals.percentage;
				set.weight = undefined;
			}
		} else {
			set.weight = set.weight ?? reusedGlobals.weight;
			set.percentage = set.percentage ?? reusedGlobals.percentage;
		}

		set.logRpe = !!(currentGlobals.rpe != null && currentGlobals.logRpe != null
			? currentGlobals.logRpe
			: (set.logRpe ?? reusedGlobals.logRpe));
		set.askWeight = !!((currentGlobals.weight != null || currentGlobals.percentage != null) &&
		currentGlobals.askWeight != null
			? currentGlobals.askWeight
			: (set.askWeight ?? reusedGlobals.askWeight));
		return set;
	});
}

/**
 * Finds the index of the first item in the collection that is marked as current, or the first item if none are marked as current.
 * @param collection The collection to search.
 */
function findIndexOfCurrentOrFirst(collection: { isCurrent: boolean }[]): IndexFrom0 {
	return tryFindIndex(collection, item => item.isCurrent) ?? castAs0(0);
}

/**
 * Finds and returns which script to use to calculate the progress of a program exercise.
 * @param exercise The program exercise to find the script for.
 * @todo why is this so complicated? Having FIVE duplicate locations for the script is insane. These data structures need simplification
 */
function PlannerProgramExercise_getProgressScript(
	exercise: IPlannerProgramExercise,
): string | undefined {
	return (
		exercise.progress?.script ??
		exercise.progress?.reuse?.exercise?.progress?.script ??
		exercise.progress?.reuse?.exercise?.progress?.reuse?.exercise?.progress?.script ??
		exercise.reuse?.exercise?.progress?.script ??
		exercise.reuse?.exercise?.progress?.reuse?.exercise?.progress?.script
	);
}

export function PlannerProgramExercise_getState(exercise: IPlannerProgramExercise): IProgramState {
	if (exercise.progress?.state && !exercise.progress.reuse) {
		return exercise.progress.state;
	} else {
		const originalState = exercise.progress?.reuse?.exercise
			? PlannerProgramExercise_getState(exercise.progress.reuse.exercise)
			: exercise.reuse?.exercise
				? PlannerProgramExercise_getState(exercise.reuse.exercise)
				: {};

		return { ...originalState, ...exercise.progress?.state };
	}
}

function PlannerProgramExercise_getOnlyChangedState(
	exercise: IPlannerProgramExercise,
): IProgramState {
	const originalState = exercise.progress?.reuse?.exercise
		? exercise.progress.reuse.exercise.progress?.state || {}
		: exercise.reuse?.exercise
			? exercise.reuse.exercise.progress?.state || {}
			: {};
	const originalStateMetadata = exercise.progress?.reuse?.exercise
		? exercise.progress.reuse.exercise.progress?.stateMetadata || {}
		: exercise.reuse?.exercise
			? exercise.reuse.exercise.progress?.stateMetadata || {}
			: {};
	const state = exercise.progress?.state || {};
	const stateMetadata = exercise.progress?.stateMetadata || {};
	return ObjectUtils_filter(
		state,
		(key, value) =>
			originalState[key] == null ||
			!eq(originalState[key], value) ||
			originalStateMetadata[key]?.userPrompted !== stateMetadata[key]?.userPrompted,
	) as IProgramState;
}

function PlannerProgramExercise_getStateMetadata(
	exercise: IPlannerProgramExercise,
): IProgramStateMetadata {
	if (exercise.progress?.stateMetadata && !exercise.progress.reuse) {
		return exercise.progress.stateMetadata;
	} else {
		const originalState = exercise.progress?.reuse?.exercise
			? PlannerProgramExercise_getStateMetadata(exercise.progress.reuse.exercise)
			: exercise.reuse?.exercise
				? PlannerProgramExercise_getStateMetadata(exercise.reuse.exercise)
				: {};

		return { ...originalState, ...exercise.progress?.stateMetadata };
	}
}

function PlannerProgramExercise_getUpdateScript(
	exercise: IPlannerProgramExercise,
): string | undefined {
	return (
		exercise.update?.script ??
		exercise.update?.reuse?.exercise?.update?.script ??
		exercise.update?.reuse?.exercise?.update?.reuse?.exercise?.update?.script ??
		exercise.reuse?.exercise?.update?.script ??
		exercise.reuse?.exercise?.update?.reuse?.exercise?.update?.script
	);
}

//#endregion

//#region Program Set
/**
 * Gets the weight of a set as a static weight
 * @param set The set (weight x reps) this is for
 * @param exerciseType The exercise the set is for
 * @param settings The settings to use for evaluation
 */
function ProgramSet_getEvaluatedWeight(
	set: IPlannerProgramExerciseEvaluatedSet,
	exerciseType: IExerciseType,
	settings: ISettings,
): $.Option<IWeight> {
	const orm = getOrmOrStartingWeight(
		getExerciseOrDefault(exerciseType, settings.exercises),
		settings,
	);

	return pipe(
		tryGetWeight(set),
		weight => evaluateWeight(weight, orm),
		$.map(evaluatedWeight =>
			round(
				convertTo(evaluatedWeight, getPreferredUnit(settings, exerciseType)),
				settings,
				getPreferredUnit(settings, exerciseType),
				exerciseType,
			),
		),
	);
}
//#endregion

//#region Progress

interface IScriptBindings {
	day: number;
	week: number;
	dayInWeek: number;
	originalWeights: (IWeight | IDynamicWeight)[];
	weights: (IWeight | undefined)[];
	completedWeights: (IWeight | undefined)[];
	rm1: IWeight;
	reps: (number | undefined)[];
	minReps: (number | undefined)[];
	amraps: (number | undefined)[];
	askweights: (number | undefined)[];
	logrpes: (number | undefined)[];
	timers: (number | undefined)[];
	RPE: (number | undefined)[];
	completedRPE: (number | undefined)[];
	completedReps: (number | undefined)[];
	completedRepsLeft: (number | undefined)[];
	isCompleted: (0 | 1)[];
	w: (IWeight | undefined)[];
	r: (number | undefined)[];
	mr: (number | undefined)[];
	cr: (number | undefined)[];
	cw: (IWeight | undefined)[];
	ns: number;
	programNumberOfSets: number;
	numberOfSets: number;
	completedNumberOfSets: number;
	setVariationIndex: number;
	bodyweight: IWeight;
	descriptionIndex: number;
	setIndex: number;
}

export function Progress_createEmptyScriptBindings(
	dayData: IDayData,
	settings: ISettings,
	exercise?: IExerciseType,
): IScriptBindings {
	return {
		day: dayData.day,
		week: dayData.week,
		dayInWeek: dayData.dayInWeek,
		completedWeights: [],
		originalWeights: [],
		weights: [],
		reps: [],
		minReps: [],
		RPE: [],
		amraps: [],
		logrpes: [],
		askweights: [],
		completedReps: [],
		completedRepsLeft: [],
		completedRPE: [],
		isCompleted: [],
		timers: [],
		w: [],
		r: [],
		cr: [],
		cw: [],
		mr: [],
		programNumberOfSets: 0,
		numberOfSets: 0,
		completedNumberOfSets: 0,
		ns: 0,
		setVariationIndex: 1,
		descriptionIndex: 1,
		bodyweight: build(0, settings.units),
		setIndex: 1,
		rm1: exercise ? getOrmOrStartingWeight(exercise, settings) : w`0lb`,
	};
}

function Progress_createScriptBindings(
	dayData: IDayData,
	entry: IHistoryEntry,
	settings: ISettings,
	programNumberOfSets: number,
	bodyweight: IWeight | undefined,
	setIndex?: number,
	setVariationIndex?: IndexFrom1,
	descriptionIndex?: IndexFrom1,
): IScriptBindings {
	const bindings = Progress_createEmptyScriptBindings(dayData, settings, entry.exercise);
	for (const set of entry.sets) {
		bindings.weights.push(set.weight);
		bindings.originalWeights.push(set.originalWeight ?? build(0, settings.units));
		bindings.reps.push(set.reps);
		bindings.minReps.push(set.minReps);
		bindings.completedReps.push(set.completedReps);
		bindings.completedRepsLeft.push(set.completedRepsLeft);
		bindings.completedRPE.push(set.completedRpe);
		bindings.completedWeights.push(set.completedWeight);
		bindings.RPE.push(set.rpe);
		bindings.amraps.push(set.isAmrap ? 1 : undefined);
		bindings.logrpes.push(set.logRpe ? 1 : undefined);
		bindings.askweights.push(set.askWeight ? 1 : undefined);
		bindings.timers.push(set.timer);
		bindings.isCompleted.push(set.isCompleted ? 1 : 0);
	}
	Object.assign(bindings, {
		w: bindings.weights,
		r: bindings.reps,
		cr: bindings.completedReps,
		cw: bindings.completedWeights,
		mr: bindings.minReps,
		ns: entry.sets.length,
		programNumberOfSets: programNumberOfSets,
		numberOfSets: entry.sets.length,
		completedNumberOfSets: entry.sets.filter(s => s.isCompleted).length,
		setIndex: setIndex ?? 1,
		setVariationIndex: setVariationIndex ?? 1,
		descriptionIndex: descriptionIndex ?? 1,
		bodyweight: bodyweight ?? build(0, settings.units),
	});
	return bindings;
}

function Progress_runUpdateScriptForEntry(
	entry: IHistoryEntry,
	dayData: IDayData,
	programExercise: IPlannerProgramExercise,
	otherStates: IByTag<IProgramState>,
	setIndex: number,
	settings: ISettings,
	stats: IStats,
): IHistoryEntry {
	if (setIndex !== -1 && !entry?.sets[setIndex]?.isCompleted) {
		return entry;
	}
	const script = PlannerProgramExercise_getUpdateScript(programExercise);
	if (!script) {
		return entry;
	}
	const exercise = programExercise.exerciseType;
	const state = structuredClone(PlannerProgramExercise_getState(programExercise));
	const setVariationIndex = findIndexOfCurrentOrFirst(programExercise.evaluatedSetVariations);

	const bindings = Progress_createScriptBindings(
		dayData,
		entry,
		settings,
		programExercise.evaluatedSetVariations[setVariationIndex]?.sets.length ?? 0,
		getAverageBodyweight(
			stats,
			settings.units,
			settings.graphOptions.weight?.movingAverageWindowSize,
		),
		setIndex + 1,
		as1(setVariationIndex),
		as1(findIndexOfCurrentOrFirst(programExercise.descriptions.values)),
	);
	const fnContext: IScriptFnContext = {
		exerciseType: exercise,
		unit: settings.units,
		prints: [],
	};
	const { finalState } = run(
		script,
		state,
		bindings,
		Progress_createScriptFunctions(settings),
		fnContext,
		structuredClone(otherStates),
		IProgramMode.UPDATE,
	);
	const newEntry = Progress_applyBindings(entry, bindings, settings);
	newEntry.state = { ...newEntry.state, ...finalState };
	if (fnContext.prints.length > 0) {
		newEntry.updatePrints = fnContext.prints;
	}
	return newEntry;
}

function Progress_applyBindings(
	oldEntry: IHistoryEntry,
	bindings: IScriptBindings,
	settings: ISettings,
): IHistoryEntry {
	const entry = structuredClone(oldEntry);
	const lastCompletedIndex = safeFindLastIndex(bindings.completedReps, r => r != null, ZERO);
	entry.sets = entry.sets.slice(0, Math.max(lastCompletedIndex, bindings.numberOfSets, 0));
	for (const key of [
		"RPE",
		"minReps",
		"reps",
		"weights",
		"amraps",
		"logrpes",
		"timers",
		"originalWeights",
		"askweights",
	] as const) {
		for (let i = 0; i < bindings[key].length; i += 1) {
			entry.sets[i] ??= {
				id: generateUid(6),
				index: castAs0(i),
				isUnilateral: isUnilateral(entry.exercise, settings.exerciseData),
				reps: 0,
				weight: w`0lb`,
				originalWeight: w`0lb`,
				askWeight: false,
				isCompleted: false,
			};
			if (entry.sets[i].isCompleted) {
				continue;
			}
			//@todo why are the keys in the sets structure not the same as the keys in the bindings object?
			//   This is requiring a long switch when instead it could have been a single assignment on a dynamic key
			switch (key) {
				case "RPE": {
					entry.sets[i].rpe = bindings.RPE[i] !== 0 ? bindings.RPE[i] : undefined;
					break;
				}
				case "reps":
					entry.sets[i].reps = bindings.reps[i];
					break;
				case "minReps": {
					entry.sets[i].minReps = bindings.minReps[i] !== 0 ? bindings.minReps[i] : undefined;
					break;
				}
				case "weights":
					entry.sets[i].weight = bindings.weights[i];
					break;
				case "originalWeights":
					entry.sets[i].originalWeight = bindings.originalWeights[i];
					break;
				case "amraps":
					entry.sets[i].isAmrap = !!bindings.amraps[i];
					break;
				case "logrpes":
					entry.sets[i].logRpe = !!bindings.logrpes[i];
					break;
				case "askweights":
					entry.sets[i].askWeight = !!bindings.askweights[i];
					break;
				case "timers": {
					entry.sets[i].timer = (bindings.timers[i] ?? -1) >= 0 ? bindings.timers[i] : undefined;
					break;
				}
				default:
					key satisfies never;
			}
		}
	}
	return entry;
}

//#endregion

//#region PP
/**
 * Callback invoked for each exercise while walking a program's week/day grid.
 *
 * @returns `true` to stop iteration immediately, otherwise iteration continues.
 *
 * @param exercise The evaluated planner exercise at the current position.
 * @param weekIndex 0-based index of the week within the program.
 * @param dayInWeekIndex 0-based index of the day within its week.
 * @param dayIndex 0-based absolute day index across the whole program. This
 *   increments once per day slot in program order, including days where exercises are skipped.
 * @param exerciseIndex 0-based index of the exercise within its day.
 */
type IExerciseIterationCallback = (
	exercise: IPlannerProgramExercise,
	weekIndex: number,
	dayIndexInWeek: number,
	dayIndexInProgram: number,
	exerciseIndex: number,
) => true | void;

/**
 * Generic walker for different kinds of week/day/exercise structures.
 *
 * @param weeks The top-level weeks collection to iterate.
 * @param getDays Defines how to access days from an element of the weeks collection. You should always return ALL days,
 *   even if you don't want to visit the exercises in them.
 * @param getExercises Defines how to access exercises from an element of the days collection.
 *   You may return undefined, indicating you do not want to run the callback for the exercises of that day,
 *   but the day is still counted as visited.
 * @param cb Called for each exercise in week → day → exercise order.
 */
function forExerciseInGrid<TWeek, TDay>(
	weeks: readonly TWeek[],
	getDays: (week: TWeek) => readonly TDay[],
	getExercises: (day: TDay) => readonly IPlannerProgramExercise[] | undefined,
	cb: IExerciseIterationCallback,
): void {
	let dayIndexInProgram = 0;
	for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
		const days = getDays(weeks[weekIndex]);
		for (let dayIndexInWeek = 0; dayIndexInWeek < days.length; dayIndexInWeek++) {
			const exercises = getExercises(days[dayIndexInWeek]);
			if (exercises) {
				for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
					if (
						cb(
							exercises[exerciseIndex],
							weekIndex,
							dayIndexInWeek,
							dayIndexInProgram,
							exerciseIndex,
						)
					) {
						return;
					}
				}
			}
			dayIndexInProgram += 1;
		}
	}
}

/**
 * Visits every exercise in an {@link IEvaluatedProgram}
 *
 * @param evaluatedWeeks The evaluated program weeks to walk.
 * @param cb Called for each exercise in week → day → exercise order.
 * @see forExerciseInEvaluatedResults
 * @see forExerciseInGrid
 */
export function forExerciseInEvaluatedWeeks(
	evaluatedWeeks: IEvaluatedProgram["weeks"],
	cb: IExerciseIterationCallback,
): void {
	forExerciseInGrid(
		evaluatedWeeks,
		week => week.days,
		day => day.exercises,
		cb,
	);
}

/**
 * Visits every exercise in successful days only of the {@link IPlannerEvalResult}
 *
 * @param evaluatedWeeks Raw per-week evaluation results to walk.
 * @param cb Called for each exercise in successful days only.
 * @see forExerciseInEvaluatedWeeks
 * @see forExerciseInGrid
 */
export function forExerciseInEvaluatedResults(
	evaluatedWeeks: IPlannerEvalResult[][],
	cb: IExerciseIterationCallback,
): void {
	forExerciseInGrid(
		evaluatedWeeks,
		week => week,
		day => (day.success ? day.data : undefined),
		cb,
	);
}

//#endregion

//#region Program to Planner
interface IPlannerToProgram2Globals {
	weight?: IWeight | IDynamicWeight;
	rpe?: number;
	timer?: number;
	logRpe?: boolean;
	askWeight?: boolean;
}

type IDereuseDecision = "sets" | "weight" | "rpe" | "timer" | "progress" | "update";

interface IPlannerToProgramConvertOpts {
	renameMapping?: Record<string, { to: string; dayData?: IDayData }>;
	reorder?: {
		dayData: IDayData;
		fromIndex: number;
		toIndex: number;
	}[];
}

function getUpdate(update: IProgramExerciseUpdate, settings: ISettings): string {
	if (!update.reuse) {
		return `update: custom() ${update.script}`;
	}
	if (!update.reuse.exercise?.exerciseType) {
		// @todo this branch seems to double pre-fix the "/". Is that a mistake?
		return ` / update: custom() { ...${update.reuse.exercise?.fullName || update.reuse.fullName} }`;
	}
	const fullName = Exercise_fullName(
		getExerciseOrDefault(update.reuse.exercise.exerciseType, settings.exercises),
		getCurrentEquipment(settings),
		update.reuse.exercise.label,
	);
	return `update: custom() { ...${fullName} }`;
}

function getProgress(
	programExercise: IPlannerProgramExercise,
	settings: ISettings,
	hideScript?: boolean,
): string {
	const progress = programExercise.progress;
	if (!progress) {
		return "";
	}
	let progressStr = `progress: ${progress.type}`;
	const state = PlannerProgramExercise_getState(programExercise);
	const stateMetadata = PlannerProgramExercise_getStateMetadata(programExercise);
	if (progress.type === "custom") {
		const onlyChangedState = PlannerProgramExercise_getOnlyChangedState(programExercise);
		progressStr += `(${ObjectUtils_entries(onlyChangedState)
			.map(([k, v]) => {
				return `${k}${stateMetadata[k]?.userPrompted ? "+" : ""}: ${print(v)}`;
			})
			.join(", ")})`;
	} else if (progress.type === "lp") {
		const increment = state.increment as IWeight | IDynamicWeight;
		const successes = state.successes as number;
		const successCounter = state.successCounter as number;
		const decrement = state.decrement as IWeight | IDynamicWeight;
		const failures = state.failures as number;
		const failureCounter = state.failureCounter as number;
		const args: string[] = [];
		args.push(print(increment));
		if (successes > 1 || decrement.value > 0) {
			args.push(`${successes}`);
		}
		if (successes > 1 || decrement.value > 0) {
			args.push(`${successCounter}`);
		}
		if (decrement.value > 0) {
			args.push(print(decrement));
		}
		if (failures > 1) {
			args.push(`${failures}`);
		}
		if (failures > 1) {
			args.push(`${failureCounter}`);
		}
		progressStr += `(${args.join(", ")})`;
	} else if (progress.type === "dp") {
		const increment = state.increment as IWeight | IDynamicWeight;
		const minReps = state.minReps as number;
		const maxReps = state.maxReps as number;
		const args = [print(increment), `${minReps}`, `${maxReps}`];
		progressStr += `(${args.join(", ")})`;
	} else if (progress.type === "sum") {
		const reps = state.reps as number;
		const increment = state.increment as IWeight | IDynamicWeight;
		const args = [`${reps}`, print(increment)];
		progressStr += `(${args.join(", ")})`;
	}
	if (progress.type === "custom") {
		if (progress.reuse) {
			if (progress.reuse.exercise?.exerciseType) {
				const exercise = getExerciseOrDefault(
					progress.reuse.exercise.exerciseType,
					settings.exercises,
				);
				const fullName = Exercise_fullName(
					exercise,
					getCurrentEquipment(settings),
					progress.reuse.exercise.label,
				);
				progressStr += ` { ...${fullName} }`;
			} else {
				progressStr += ` { ...${progress.reuse.exercise?.fullName || progress.reuse.fullName} }`;
			}
		} else {
			progressStr += hideScript ? ` {~ ... ~}` : ` ${progress.script}`;
		}
	}
	return progressStr;
}

function getDereuseDecisions(programExercise: IPlannerProgramExercise): IDereuseDecision[] {
	const dereuseDecisions: Set<IDereuseDecision> = new Set();
	const reuseExercise = programExercise.reuse?.exercise;
	if (!reuseExercise) {
		return Array.from(dereuseDecisions);
	}
	const globals = getGlobals(programExercise);
	const reusedGlobals = getGlobals(reuseExercise);
	if (
		programExercise.evaluatedSetVariations.length !== reuseExercise.evaluatedSetVariations.length
	) {
		dereuseDecisions.add("sets");
	}
	if (
		findIndexOfCurrentOrFirst(programExercise.evaluatedSetVariations) !==
		findIndexOfCurrentOrFirst(reuseExercise.evaluatedSetVariations)
	) {
		dereuseDecisions.add("sets");
	}
	if (reuseExercise.progress != null || programExercise.progress != null) {
		if (
			programExercise.progress == null ||
			programExercise.progress.type !== reuseExercise.progress?.type ||
			(programExercise.progress.reuse
				? programExercise.progress.reuse?.fullName !== reuseExercise.fullName
				: programExercise.progress.script !== reuseExercise.progress.script) ||
			Object.keys(PlannerProgramExercise_getOnlyChangedState(programExercise)).length > 0
		) {
			dereuseDecisions.add("progress");
		}
	}
	if (reuseExercise.update != null || programExercise.update != null) {
		if (
			programExercise.update == null ||
			(programExercise.update.reuse
				? programExercise.update.reuse?.fullName !== reuseExercise.fullName
				: programExercise.update.script !== reuseExercise.update?.script)
		) {
			dereuseDecisions.add("update");
		}
	}
	if (
		programExercise.evaluatedSetVariations.length === reuseExercise.evaluatedSetVariations.length
	) {
		for (let i = 0; i < programExercise.evaluatedSetVariations.length; i += 1) {
			const programVariation = programExercise.evaluatedSetVariations[i];
			const reuseVariation = reuseExercise.evaluatedSetVariations[i];
			if (programVariation.sets.length !== reuseVariation.sets.length) {
				dereuseDecisions.add("sets");
			}
			for (let j = 0; j < programVariation.sets.length; j += 1) {
				const programSet = programVariation.sets[j];
				const reuseSet = reuseVariation.sets[j];
				if (programSet.maxrep !== reuseSet?.maxrep || programSet.minrep !== reuseSet?.minrep) {
					dereuseDecisions.add("sets");
				}
				if (
					reuseSet
						? !eq(programSet.weight, reuseSet.weight) || programSet.askWeight !== reuseSet.askWeight
						: !eq(globals.weight || w`0lb`, reusedGlobals.weight || w`0lb`) ||
							globals.askWeight !== reusedGlobals.askWeight
				) {
					if (globals.weight != null) {
						dereuseDecisions.add("weight");
					} else {
						dereuseDecisions.add("sets");
					}
				}
				if (
					reuseSet
						? programSet.rpe !== reuseSet.rpe || programSet.logRpe !== reuseSet.logRpe
						: globals.rpe !== reusedGlobals.rpe || globals.logRpe !== reusedGlobals.logRpe
				) {
					if (globals.rpe != null) {
						dereuseDecisions.add("rpe");
					} else {
						dereuseDecisions.add("sets");
					}
				}
				if (
					reuseSet ? programSet.timer !== reuseSet.timer : globals.timer !== reusedGlobals.timer
				) {
					if (globals.timer != null) {
						dereuseDecisions.add("timer");
					} else {
						dereuseDecisions.add("sets");
					}
				}
			}
		}
	}
	return Array.from(dereuseDecisions);
}

function reorderGroupedTopLine(
	groupedTopLine: IPlannerTopLineItem[][][][],
	reorders: Exclude<IPlannerToProgramConvertOpts["reorder"], undefined>,
): IPlannerTopLineItem[][][][] {
	for (const reorder of reorders) {
		const groupedDay = groupedTopLine[reorder.dayData.week - 1]?.[reorder.dayData.dayInWeek - 1];
		if (groupedDay) {
			const indexMap = groupedDay.reduce<{
				result: Record<number, number>;
				i: number;
			}>(
				({ result, i }, group, index) => {
					const exercise = group.find(item => item.type === "exercise");
					if (exercise && !exercise.notused) {
						result[i] = index;
						i += 1;
					}
					return { result, i };
				},
				{ result: {}, i: 0 },
			).result;
			const from = groupedDay[indexMap[reorder.fromIndex]];
			if (from) {
				groupedDay.splice(indexMap[reorder.fromIndex], 1);
				groupedDay.splice(indexMap[reorder.toIndex], 0, from);
			}
		}
	}
	return groupedTopLine;
}

function getRenamedValue(
	opts: IPlannerToProgramConvertOpts,
	line: IPlannerTopLineItem,
	weekIndex: number,
	dayInWeekIndex: number,
): string {
	const renamedValue = opts.renameMapping?.[line.value];
	if (
		renamedValue &&
		(!renamedValue.dayData ||
			(renamedValue.dayData.week === weekIndex + 1 &&
				renamedValue.dayData.dayInWeek === dayInWeekIndex + 1))
	) {
		return renamedValue.to;
	} else {
		return line.value;
	}
}
function groupWarmupsSets(
	sets: IPlannerProgramExerciseWarmupSet[],
): [IPlannerProgramExerciseWarmupSet, number][] {
	let lastKey: string | undefined;
	const groups: [IPlannerProgramExerciseWarmupSet, number][] = [];
	for (const set of sets) {
		const key = `${set.reps}-${print(set.weight || set.percentage || 0)}`;
		if (lastKey == null || lastKey !== key) {
			groups.push([set, 0]);
		}
		groups[groups.length - 1][1] += set.numberOfSets;
		lastKey = key;
	}
	return groups;
}

function getCurrentDescriptionExercise(
	program: IEvaluatedProgram,
	key: string,
	weekIndex: number,
	dayInWeekIndex: number,
): IPlannerProgramExercise | undefined {
	return program.weeks[weekIndex]?.days[dayInWeekIndex]?.exercises?.find(e => e.key === key);
}

function getCurrentDescriptionIndex(
	program: IEvaluatedProgram,
	key: string,
	weekIndex: number,
	dayInWeekIndex: number,
): number {
	const exercise = getCurrentDescriptionExercise(program, key, weekIndex, dayInWeekIndex);
	const descriptions = exercise?.descriptions.values || [];
	const index = descriptions.findIndex(s => s.isCurrent);
	return index === -1 ? 0 : index;
}

function addExerciseDescriptions(
	program: IEvaluatedProgram,
	exercise: IPlannerProgramExercise | undefined,
	weekIndex: number,
	dayInWeekIndex: number,
	addedCurrentDescription: boolean,
): { lines: string[]; addedCurrentDescription: boolean } | undefined {
	if (!exercise) {
		return undefined;
	}
	if (
		!isEqual(
			exercise.descriptions.values || [],
			exercise.descriptions.reuse?.exercise?.descriptions.values || [],
		)
	) {
		const lines: string[] = [];
		const currentIndex = getCurrentDescriptionIndex(
			program,
			exercise.key,
			weekIndex,
			dayInWeekIndex,
		);
		for (const [i, description] of exercise.descriptions.values.entries()) {
			if (i > 0) {
				lines.push("");
			}
			for (const part of description.value.split("\n")) {
				if (currentIndex !== 0 && currentIndex === i && !addedCurrentDescription) {
					lines.push(`// ! ${part}`);
					addedCurrentDescription = true;
				} else {
					lines.push(`// ${part}`);
				}
			}
		}
		return { lines, addedCurrentDescription };
	}
	if (exercise.descriptions.reuse?.exercise) {
		const reusedExercise = exercise.descriptions.reuse.exercise;
		const reusedDayData = reusedExercise.dayData;
		const currentWeekReusedExercisesCount = program.weeks[weekIndex]?.days.filter(day => {
			return day.exercises.some(e => e.key === reusedExercise.key);
		}).length;
		if (currentWeekReusedExercisesCount === 1 && reusedDayData.week === weekIndex + 1) {
			return {
				lines: [`// ...${reusedExercise.fullName}`],
				addedCurrentDescription,
			};
		}
		return {
			lines: [`// ...${reusedExercise.fullName}[${reusedDayData.week}:${reusedDayData.dayInWeek}]`],
			addedCurrentDescription,
		};
	}
	return undefined;
}

/**
 * Strips out repeated informaton from the program which can be implied from previous exercises, days, etc.
 * @param oldPlannerProgram
 * @param plannerProgram
 * @param settings
 * @param additionalRepeatingExercises
 */
export function compactPlannerProgram(
	oldPlannerProgram: IPlannerProgram,
	plannerProgram: IPlannerProgram,
	settings: ISettings,
	additionalRepeatingExercises?: Set<string>,
): IPlannerProgram {
	// Define augmented types that let us put a "used" flag on the lines (really just for the exercises) for this algorithm only.
	type ITrackableLine = IPlannerTopLineItem & {
		used?: boolean;
	};
	const repeatingExercises = new Set(additionalRepeatingExercises);
	const { evaluatedWeeks } = PlannerProgram_evaluate(structuredClone(oldPlannerProgram), settings);
	const { evaluatedWeeks: newEvaluatedWeeks } = PlannerProgram_evaluate(
		structuredClone(plannerProgram),
		settings,
	);
	for (const ev of [evaluatedWeeks, newEvaluatedWeeks]) {
		forExerciseInEvaluatedResults(ev, exercise => {
			if ((exercise.repeat?.length ?? 0) > 0) {
				repeatingExercises.add(exercise.key);
			}
		});
	}

	// This snippet cuts out repeated descriptions for days in the program, keeping only the first instance of a description.
	// If there are multiple DIFFERENT descriptions though, it will keep the first instance of each one every time the description changes.
	const lastDescriptions: (string | undefined)[] = [];
	for (const week of plannerProgram.weeks) {
		for (const [dayInWeekIndex, day] of week.days.entries()) {
			if (day.description === lastDescriptions[dayInWeekIndex]) {
				day.description = undefined;
				continue;
			}
			lastDescriptions[dayInWeekIndex] = day.description;
		}
	}

	const mapping: ITrackableLine[][][] = plannerProgram.weeks.map(week =>
		week.days.map((day): ITrackableLine[] =>
			topLineMap(
				asPlanNodeOfTypeOrThrow("Program", parseBound(plannerExerciseParser, day.exerciseText)),
				settings.exercises,
			),
		),
	);

	for (const [weekIndex, week] of mapping.entries()) {
		for (const [dayIndex, day] of week.entries()) {
			for (const line of day) {
				if (line.type !== "exercise" || line.used || !repeatingExercises.has(line.value)) {
					continue;
				}
				const repeatRanges: [number, number | undefined][] = [];
				for (
					let repeatWeekIndex = weekIndex + 1;
					repeatWeekIndex < mapping.length;
					repeatWeekIndex += 1
				) {
					const repeatDay = mapping[repeatWeekIndex]?.[dayIndex];
					const repeatedExercises = (repeatDay || []).filter(e => {
						if (
							e.type !== "exercise" ||
							e.value !== line.value ||
							e.sectionsToReuse !== line.sectionsToReuse ||
							e.exerciseIndex !== line.exerciseIndex ||
							!ObjectUtils_isEqual(e.descriptions || [], line.descriptions || [])
						) {
							return false;
						}
						const oldDay = evaluatedWeeks[repeatWeekIndex][dayIndex];
						const oldExercise = oldDay.success
							? oldDay.data.find(ex => ex.key === e.value)
							: undefined;
						return !!oldExercise?.repeating?.includes(weekIndex + 1);
					});
					for (const e of repeatedExercises) {
						e.used = true;
					}
					if (repeatedExercises.length > 0) {
						if (repeatRanges.length === 0 || repeatRanges[repeatRanges.length - 1][1] != null) {
							repeatRanges.push([repeatWeekIndex, undefined]);
						}
					} else {
						if (repeatRanges.length > 0) {
							repeatRanges[repeatRanges.length - 1][1] = repeatWeekIndex;
						}
						break;
					}
				}
				if (repeatRanges.length > 0 && repeatRanges[repeatRanges.length - 1][1] == null) {
					repeatRanges[repeatRanges.length - 1][1] = mapping.length;
				}
				line.repeatRanges = repeatRanges.map(r => `${r[0]}-${r[1]}`);
			}
		}
	}

	for (const [weekIndex, week] of mapping.entries()) {
		for (const [dayIndex, day] of week.entries()) {
			const exerciseTextParts: string[] = [];
			let ongoingDescriptions = false;
			for (const line of day) {
				switch (line.type) {
					case "exercise":
						ongoingDescriptions = false;
						if (line.used) break;

						const descriptions = line.descriptions.filter(hasNonWhitespace);
						exerciseTextParts.push(
							...descriptions.map(
								(d, index) => d + (index !== descriptions.length - 1 ? "\n" : ""),
							),
						);

						const repeatParts = [...(line.order !== 0 ? [line.order] : []), ...line.repeatRanges];
						const repeatStr = repeatParts.length ? `[${repeatParts.join(",")}]` : "";
						exerciseTextParts.push(
							[`${line.fullName}${repeatStr}`, line.sections].filter(isNonEmpty).join(" / "),
						);
						break;
					case "description":
						ongoingDescriptions = true;
						break;
					case "empty":
						if (!ongoingDescriptions) exerciseTextParts.push(line.value);
						break;
					case "comment":
						exerciseTextParts.push(line.value);
						break;
					default:
						line satisfies never;
				}
			}
			plannerProgram.weeks[weekIndex].days[dayIndex].exerciseText = exerciseTextParts.join("\n");
		}
	}

	return plannerProgram;
}

function topLineItems(
	plannerProgram: IPlannerProgram,
	exercises: IAllCustomExercises,
): IPlannerTopLineItem[][][] {
	let dayIndex = 0;

	const mapping = plannerProgram.weeks.map(week =>
		week.days.map(day => {
			dayIndex += 1;
			return topLineMap(
				asPlanNodeOfTypeOrThrow("Program", parseBound(plannerExerciseParser, day.exerciseText)),
				exercises,
			);
		}),
	);
	for (const week of mapping) {
		for (dayIndex = 0; dayIndex < week.length; dayIndex += 1) {
			const day = week[dayIndex].filter(item => item.type === "exercise");
			for (const exercise of day) {
				for (const r of exercise.repeat || []) {
					const reuseDay = mapping[r - 1]?.[dayIndex];
					if (
						reuseDay &&
						!reuseDay.some(e => e.type === "exercise" && e.value === exercise.value)
					) {
						if (exercise.descriptions) {
							for (let di = 0; di < exercise.descriptions.length; di += 1) {
								if (di !== 0) {
									reuseDay.push({ type: "empty", value: "" });
								}
								reuseDay.push({
									type: "description",
									value: exercise.descriptions[di],
								});
							}
						}
						reuseDay.push({ ...exercise, repeat: undefined });
					}
				}
			}
		}
	}
	return mapping;
}

function getRepeatRanges(numbers: number[]): string[] {
	if (numbers.length === 0) {
		return [];
	}

	const ranges: string[] = [];
	let rangeStart = numbers[0];
	let rangeEnd = numbers[0];

	for (let i = 1; i < numbers.length; i++) {
		if (numbers[i] === rangeEnd + 1) {
			rangeEnd = numbers[i];
		} else {
			ranges.push(`${rangeStart}-${rangeEnd}`);
			rangeStart = numbers[i];
			rangeEnd = numbers[i];
		}
	}

	ranges.push(`${rangeStart}-${rangeEnd}`);

	return ranges;
}

function topLineMap(
	programNode: TypedPlanNode<"Program">,
	exercises: IAllCustomExercises,
): IPlannerTopLineItem[] {
	const result: IPlannerTopLineItem[] = [];
	let lastDescriptions: string[][] = [];
	let ongoingDescriptions = false;
	function consumeDescriptions(): string[] {
		ongoingDescriptions = false;
		const descriptions = lastDescriptions.map(d => d.join("\n"));
		lastDescriptions = [];
		return descriptions;
	}
	let exerciseIndex = 0;

	for (const child of tryQueryPlanNodeChildren(programNode)) {
		switch (child.type.name) {
			case PlannerNodeName.ExerciseExpression:
				const exerciseExpression = asPlanNodeOfTypeOrThrow("ExerciseExpression", child);
				const fullName = getNodeSourceEscapedWhiteSpace(
					exerciseExpression.getChild(PlannerNodeName.ExerciseName)!,
				);
				const repeat = getRepeat(exerciseExpression);
				const sectionNodes = tryQueryPlanNodeChildren(exerciseExpression, {
					ofType: PlannerNodeName.ExerciseSection,
				}).toArray();
				const item: IPlannerTopLineItem = {
					type: "exercise",
					fullName,
					order: getOrder(exerciseExpression),
					notused: getIsNotUsed(exerciseExpression),
					value: PlannerKey_fromFullName(fullName, exercises),
					exerciseIndex,
					repeat,
					repeatRanges: getRepeatRanges(repeat),
					descriptions: consumeDescriptions(),
					sections: sectionNodes.map(section => section.source.trim()).join(" / "),
					sectionsToReuse: sectionNodes
						.filter(section => {
							const properties = section.getChild(PlannerNodeName.ExerciseProperty);
							if (properties == null) {
								return true;
							}
							const propertyNameNode = properties.getChild(PlannerNodeName.ExercisePropertyName);
							const propertyName = propertyNameNode
								? getNodeSourceEscapedWhiteSpace(propertyNameNode)
								: undefined;
							if (propertyName === "progress") {
								const none = properties.getChild(PlannerNodeName.None);
								return none != null;
							}
							return false;
						})
						.map(section => section.source.trim())
						.join(" / "),
				};
				result.push(item);
				if (!item.notused) {
					exerciseIndex += 1;
				}
				break;
			case PlannerNodeName.LineComment:
				ongoingDescriptions = true;
				const description = child.source.trim();
				if (lastDescriptions.length === 0) {
					lastDescriptions.push([]);
				}
				lastDescriptions[lastDescriptions.length - 1].push(description);
				result.push({ type: "description", value: description });
				break;
			case PlannerNodeName.TripleLineComment:
				result.push({
					type: "comment",
					value: child.source.trim(),
				});
				break;
			case PlannerNodeName.EmptyExpression:
				result.push({ type: "empty", value: "" });
				if (ongoingDescriptions) {
					lastDescriptions.push([]);
				}
				break;
			default:
				throw nodeError(
					child,
					`Unexpected node type ${child.type.name}, should be only exercise, comment, description or empty line`,
				);
		}
	}
	return result;
}

/**
 * Groups lines of a program together by the logic exercise that they belong to
 * @param topLine The week/day/line of day grouping
 * @returns The week/day/exercise/line of exercise grouping, with the exercises sorted by exercise index and repeat
 * @todo this seems rather obtuse. The non-exercise lines are just comments. Why not parse into an exercise structure that allows for comments on it? Sure you might lose white space, but that's not really important?!
 */
function groupTopLines(topLine: IPlannerTopLineItem[][][]): IPlannerTopLineItem[][][][] {
	return topLine.map(topLineWeek =>
		topLineWeek.map(topLineDay => {
			const group: IPlannerTopLineItem[][] = [];
			let reset = true;
			for (const line of topLineDay) {
				if (reset) {
					group.push([]);
					reset = false;
				}
				group[group.length - 1] ??= [];
				group[group.length - 1].push(line);
				if (line.type === "exercise") {
					reset = true;
				}
			}
			return group.sort(
				by(
					lines => lines.find(l => l.type === "exercise"),
					(ex1, ex2) => {
						return ex1 == null || ex2 == null
							? 0
							: ex1.exerciseIndex === ex2.exerciseIndex
								? (ex1.repeat?.[0] ?? 0) - (ex2.repeat?.[0] ?? 0)
								: (ex1.exerciseIndex ?? 0) - (ex2.exerciseIndex ?? 0);
					},
				),
			);
		}),
	);
}

export function convertToPlanner(
	program: IEvaluatedProgram,
	settings: ISettings,
	opts: IPlannerToProgramConvertOpts = {},
): IPlannerProgram {
	const plannerWeeks: IPlannerProgramWeek[] = [];
	if (program.errors.length > 0) {
		const error = program.errors[0];
		console.log(asProgramScript(program.planner));

		throw error.error;
	}
	const topLineMap = topLineItems(program.planner, settings.exercises);
	let groupedTopLineMap = groupTopLines(topLineMap);
	if (opts.reorder) reorderGroupedTopLine(groupedTopLineMap, opts.reorder);
	let dayIndex = ZERO;
	const addedProgressMap: Record<string, boolean> = {};
	const addedUpdateMap: Record<string, boolean> = {};
	const addedWarmupsMap: Record<string, boolean> = {};
	const addedIdMap: Record<string, boolean> = {};

	for (let weekIndex = 0; weekIndex < program.weeks.length; weekIndex += 1) {
		const week = program.weeks[weekIndex];
		const plannerWeek: IPlannerProgramWeek = {
			name: week.name,
			days: [],
			description: week.description,
		};
		for (let dayInWeekIndex = 0; dayInWeekIndex < week.days.length; dayInWeekIndex += 1) {
			const programDay = week.days[dayInWeekIndex];
			const plannerDay: IPlannerProgramDay = {
				name: programDay.name,
				exerciseText: "",
			};
			let descriptionIndex: number | undefined = undefined;
			let addedCurrentDescription = false;
			let finishedToAddDescription = false;
			const groupedTopLines = groupedTopLineMap[weekIndex][dayInWeekIndex];
			let groupTextArr: string[] = [];
			groupLoop: for (let groupIndex = 0; groupIndex < groupedTopLines.length; groupIndex += 1) {
				const exerciseTextArr: string[] = [];
				const group = groupedTopLines[groupIndex];
				for (let lineIndex = 0; lineIndex < group.length; lineIndex += 1) {
					const line = group[lineIndex];
					switch (line.type) {
						case "comment": {
							exerciseTextArr.push(line.value);
							break;
						}
						case "description": {
							let key: string | undefined;
							for (let i = lineIndex; i < group.length; i += 1) {
								if (group[i].type === "exercise") {
									key = getRenamedValue(opts, group[i], weekIndex, dayInWeekIndex);
									break;
								}
							}
							descriptionIndex ??= 0;
							if (finishedToAddDescription) {
								break;
							}
							if (key != null) {
								const exercise = getCurrentDescriptionExercise(
									program,
									key,
									weekIndex,
									dayInWeekIndex,
								);
								const result = addExerciseDescriptions(
									program,
									exercise,
									weekIndex,
									dayInWeekIndex,
									addedCurrentDescription,
								);
								if (result) {
									exerciseTextArr.push(...result.lines);
									addedCurrentDescription = result.addedCurrentDescription;
									finishedToAddDescription = true;
								} else {
									const currentIndex = getCurrentDescriptionIndex(
										program,
										key,
										weekIndex,
										dayInWeekIndex,
									);
									if (
										currentIndex !== 0 &&
										currentIndex === descriptionIndex &&
										!addedCurrentDescription
									) {
										exerciseTextArr.push(line.value.replace(/^\/\/\s*!?\s*/, "// ! "));
										addedCurrentDescription = true;
									} else {
										exerciseTextArr.push(line.value.replace(/^(\/\/\s*)!\s*/, "$1"));
									}
								}
							} else {
								exerciseTextArr.push(line.value.replace(/^(\/\/\s*)!\s*/, "$1"));
							}
							break;
						}
						case "empty": {
							if (!finishedToAddDescription) {
								exerciseTextArr.push("");
								if (descriptionIndex != null) {
									descriptionIndex += 1;
								}
							}
							break;
						}
						case "exercise": {
							descriptionIndex = undefined;
							const value = getRenamedValue(opts, line, weekIndex, dayInWeekIndex);
							const evalExercise = Program_getProgramExercise(as1(dayIndex), program, value)!;

							if (evalExercise == null) {
								continue groupLoop;
							}

							const key = evalExercise.key;

							if (
								!finishedToAddDescription &&
								(evalExercise.descriptions.reuse || evalExercise.descriptions.values.length > 0)
							) {
								const result = addExerciseDescriptions(
									program,
									evalExercise,
									weekIndex,
									dayInWeekIndex,
									addedCurrentDescription,
								);
								if (result) {
									exerciseTextArr.push(...result.lines);
								}
							}

							finishedToAddDescription = false;
							addedCurrentDescription = false;

							let plannerExercise: string;

							if (evalExercise.exerciseType) {
								const name = Exercise_fullName(
									getExerciseOrDefault(evalExercise.exerciseType, settings.exercises),
									getCurrentEquipment(settings),
									evalExercise.label,
								);
								plannerExercise = evalExercise.order > 0 ? `${name}[${evalExercise.order}]` : name;
							} else {
								plannerExercise = evalExercise.fullName;
							}
							plannerExercise += " / ";
							if (evalExercise.notused) {
								plannerExercise += "used: none / ";
							}
							const variations = evalExercise.evaluatedSetVariations;
							const globals = getGlobals(evalExercise);

							const shouldReuseSets = !!evalExercise.reuse;
							const dereuseDecisions = shouldReuseSets ? getDereuseDecisions(evalExercise) : [];
							if (shouldReuseSets) {
								function reuseToStr(): string {
									const reuseExercise = evalExercise.reuse?.exercise;
									const reuse = evalExercise.reuse;
									if (!reuseExercise || !reuse) {
										throw new Error("reuse.exercise is required");
									}
									let str = "...";
									str += reuseExercise.exerciseType
										? Exercise_fullName(
												getExerciseOrDefault(reuseExercise.exerciseType, settings.exercises),
												getCurrentEquipment(settings),
												reuseExercise.label,
											)
										: reuseExercise.fullName;
									if (reuse.week || reuse.day) {
										const weekAndDay = [reuse.week, reuse.day].filter(definedOnly).join(":");
										str += `[${weekAndDay}]`;
									}
									return str;
								}

								plannerExercise += reuseToStr();

								if (dereuseDecisions.includes("sets")) {
									plannerExercise +=
										` / ` +
										variations
											.map((v, i) => {
												return variationToString(v, globals, i, evalExercise);
											})
											.join(" / ");
								}

								const overriddenGlobals: string[] = [];
								if (dereuseDecisions.includes("weight") && globals.weight != null) {
									overriddenGlobals.push(
										`${weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
									);
								} else if (dereuseDecisions.includes("weight") && globals.askWeight) {
									overriddenGlobals.push("?+");
								}
								if (dereuseDecisions.includes("rpe") && globals.rpe != null) {
									overriddenGlobals.push(`@${n(globals.rpe)}${globals.logRpe ? "+" : ""}`);
								}
								if (dereuseDecisions.includes("timer") && globals.timer != null) {
									overriddenGlobals.push(`${n(globals.timer)}s`);
								}
								if (overriddenGlobals.length > 0) {
									plannerExercise += ` / ${overriddenGlobals.join(" ")}`;
								}
							} else {
								if (evalExercise.setVariations.length > 0) {
									plannerExercise += variations
										.map((v, i) => variationToString(v, globals, i, evalExercise))
										.join(" / ");
								}

								const globalsStr: string[] = [];
								if (globals.weight != null) {
									globalsStr.push(
										`${weightExprToStr(globals.weight)}${globals.askWeight ? "+" : ""}`,
									);
								} else if (globals.askWeight) {
									globalsStr.push("?+");
								}
								if (globals.rpe != null) {
									globalsStr.push(`@${globals.rpe}${globals.logRpe ? "+" : ""}`);
								}
								if (globals.timer != null) {
									globalsStr.push(`${globals.timer}s`);
								}
								if (globalsStr.length > 0) {
									plannerExercise += ` / ${globalsStr.join(" ")}`;
								}
							}

							function getWarmupSets(): string | undefined {
								const result = groupWarmupsSets(evalExercise.warmupSets ?? [])
									.map(([first, length]) => {
										const weight =
											first.weight ??
											(first.percentage != null ? percentORM(first.percentage) : w`0lb`);
										return `${length}x${first.reps} ${print(weight)}`;
									})
									.join(", ");
								return result.length === 0 ? "none" : result;
							}

							if (!addedWarmupsMap[key] && evalExercise?.warmupSets) {
								const warmupSets = getWarmupSets();
								if (warmupSets != null) {
									plannerExercise += ` / warmup: ${warmupSets}`;
									addedWarmupsMap[key] = true;
								}
							}

							if (!addedIdMap[key] && (evalExercise.tags || []).length > 0) {
								plannerExercise += ` / id: tags(${(evalExercise.tags || []).join(", ")})`;
								addedIdMap[key] = true;
							}

							const superset = evalExercise.superset?.name;
							if (superset) {
								plannerExercise += ` / superset: ${superset}`;
							}

							const update = evalExercise.update;
							if (!addedUpdateMap[key] && update && (update.reuse || update.script)) {
								if (!evalExercise.reuse || dereuseDecisions.includes("update")) {
									if (evalExercise.update) {
										plannerExercise += " / " + getUpdate(evalExercise.update, settings);
									}
									addedUpdateMap[key] = true;
								} else if (update.reuse?.fullName === evalExercise.reuse.fullName) {
									addedUpdateMap[key] = true;
								}
							}

							const progress = evalExercise.progress;
							if (progress && progress.type === "none") {
								plannerExercise += ` / progress: none`;
							} else if (
								!addedProgressMap[key] &&
								progress &&
								(progress.reuse || progress.script)
							) {
								if (!evalExercise.reuse || dereuseDecisions.includes("progress")) {
									const progressStr = getProgress(evalExercise, settings, false);
									if (progressStr) {
										plannerExercise += ` / ${progressStr}`;
									}
									addedProgressMap[key] = true;
								} else if (progress.reuse?.fullName === evalExercise.reuse.fullName) {
									addedProgressMap[key] = true;
								}
							}
							exerciseTextArr.push(plannerExercise);
							break;
						}
						default:
							line satisfies never;
					}
				}
				if (exerciseTextArr.length > 0) {
					groupTextArr = groupTextArr.concat(exerciseTextArr);
				}
			}
			plannerDay.exerciseText = groupTextArr.join("\n");
			plannerDay.description = programDay.description;
			plannerWeek.days.push(plannerDay);
			dayIndex = next(dayIndex);
		}
		plannerWeeks.push(plannerWeek);
	}
	const result: IPlannerProgram = {
		name: program.name,
		weeks: plannerWeeks,
	};
	const repeatingExercises = new Set<string>();
	forExerciseInEvaluatedWeeks(program.weeks, exercise => {
		if (exercise.repeat != null && exercise.repeat.length > 0) {
			const key = exercise.exerciseType
				? makePlannerKey(exercise.label, toKey(exercise.exerciseType))
				: PlannerKey_fromFullName(exercise.fullName, settings.exercises);
			repeatingExercises.add(key);
		}
	});

	return compactPlannerProgram(program.planner, result, settings, repeatingExercises);
}

function variationToString(
	variation: IPlannerProgramExerciseEvaluatedSetVariation,
	globals: IPlannerToProgram2Globals,
	index: number,
	exercise: IPlannerProgramExercise,
): string {
	const result: string[] = [];
	for (const [set, count] of groupVariationSets(variation.sets, exercise, index)) {
		let setStr = `${count}${set.isQuickAddSet ? "+" : ""}x`;
		setStr += set.minrep != null ? `${n(Math.max(0, set.minrep))}-` : "";
		setStr += `${n(Math.max(0, set.maxrep ?? 0))}`;
		setStr += set.isAmrap ? "+" : "";
		if (globals.weight == null && !globals.askWeight) {
			const weightValue = weightExprToStr(set.weight);
			if (weightValue) {
				setStr += ` ${weightValue}${set.askWeight ? "+" : ""}`;
			} else if (set.askWeight) {
				setStr += " ?+";
			}
		}
		if (globals.rpe == null && set.rpe != null) {
			setStr += ` @${n(Math.max(0, set.rpe))}`;
			if (set.logRpe) {
				setStr += "+";
			}
		}
		if (globals.timer == null) {
			setStr += set.timer ? ` ${n(Math.max(0, set.timer))}s` : "";
		}
		if (set.label) {
			setStr += ` (${set.label})`;
		}
		result.push(setStr);
	}
	let resultStr = "";
	if (index > 0 && variation.isCurrent) {
		resultStr += "! ";
	}
	return resultStr + result.map(r => r.trim()).join(", ");
}
function groupVariationSets(
	sets: IPlannerProgramExerciseEvaluatedSet[],
	exercise: IPlannerProgramExercise,
	index: number,
): [IPlannerProgramExerciseEvaluatedSet, number][] {
	if (sets.length === 0) {
		const originalSets = PlannerProgramExercise_sets(exercise, index).at(0);
		return [
			[
				{
					maxrep: originalSets?.repRange?.maxrep || 1,
					minrep: originalSets?.repRange?.minrep,
					weight: originalSets?.weight || w`0lb`,
					logRpe: originalSets?.logRpe || false,
					isAmrap: originalSets?.repRange?.isAmrap || false,
					isQuickAddSet: originalSets?.repRange?.isQuickAddSet || false,
					askWeight: originalSets?.askWeight || false,
					rpe: originalSets?.rpe,
					timer: originalSets?.timer,
					label: originalSets?.label,
				},
				0,
			],
		];
	}
	let lastKey: string | undefined;
	const groups: [IPlannerProgramExerciseEvaluatedSet, number][] = [];
	for (const set of sets) {
		const key = `${set.maxrep}-${set.minrep}-${print(set.weight)}-${set.isAmrap}-${set.rpe}-${set.logRpe}-${
			set.timer
		}-${set.label}-${set.askWeight}`;
		if (lastKey === undefined || lastKey !== key) {
			groups.push([set, 0]);
		}
		groups[groups.length - 1][1] += 1;
		lastKey = key;
	}
	return groups;
}

function getGlobals(exercise: IPlannerProgramExercise): IPlannerToProgram2Globals {
	const variations = exercise.evaluatedSetVariations;
	if (variations.length === 0 || variations[0].sets.length === 0) {
		return {
			weight: exercise.globals?.weight ?? exercise.reuse?.exercise?.globals?.weight,
			rpe: exercise.globals?.rpe ?? exercise.reuse?.exercise?.globals?.rpe,
			timer: exercise.globals?.timer ?? exercise.reuse?.exercise?.globals?.timer,
			logRpe: exercise.globals?.logRpe ?? exercise.reuse?.exercise?.globals?.logRpe,
			askWeight: exercise.globals?.askWeight ?? exercise.reuse?.exercise?.globals?.askWeight,
		};
	}
	const first = variations.at(0)?.sets.at(0);
	const firstWeight = first?.weight;
	const firstRpe = first?.rpe;
	const firstLogRpe = !!first?.logRpe;
	const firstAskWeight = !!first?.askWeight;
	const firstTimer = first?.timer;
	return {
		weight:
			firstWeight != null &&
			variations.every(v =>
				v.sets.every(s => eq(s.weight, firstWeight) && s.askWeight === firstAskWeight),
			)
				? firstWeight
				: undefined,
		askWeight: variations.every(v => v.sets.every(s => eq(s.weight, firstWeight) && s.askWeight)),
		rpe:
			firstRpe != null &&
			variations.every(v => v.sets.every(s => s.rpe === firstRpe && s.logRpe === firstLogRpe))
				? firstRpe
				: undefined,
		logRpe: variations.every(v => v.sets.every(s => s.rpe === firstRpe && s.logRpe)),
		timer:
			firstTimer != null && variations.every(v => v.sets.every(s => s.timer === firstTimer))
				? firstTimer
				: undefined,
	};
}

const weightExprToStr = (weightExpr?: IWeight | IDynamicWeight): string =>
	weightExpr ? print(weightExpr) : "";
//#endregion

//#region ScriptRunner

export function* validateScript(
	script: string,
	state: IProgramState,
	bindings: IScriptBindings,
	fns: IScriptFunctions,
	mode: IProgramMode,
): Generator<SourcedSyntaxError> {
	const trackedVarNames = new Set<string>();
	yield* validate(parseBound(LiftoscriptParser, script), {
		knownFunctions: Object.keys(fns),
		knownBindings: Object.keys(bindings),
		knownStateVariables: Object.keys(state),
		mode,
		trackVariable: name => trackedVarNames.add(name),
		isKnownVariable: name => trackedVarNames.has(name),
	});
}
//#endregion
