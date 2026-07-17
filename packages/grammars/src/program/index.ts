import { convertTo, gt, type IWeight, multiply, round, TWeight, w } from "@/quantities/weight.ts";
import { getExerciseOrDefault, type IExerciseType, isUnilateral, TExerciseType } from "@/exercises";
import { getPreferredUnit, type ISettings } from "@/user-settings";
import { type ISet, TProgramState } from "@/common-types.ts";
import { isNumber } from "@/utils/types.ts";
import { generateUid } from "@/utils/uid.ts";
import { z } from "zod";
import {
	as1,
	castAs0,
	castAs1,
	type IndexFrom1,
	next,
	ZERO,
	zIndexFrom1,
} from "@/utils/indexes.ts";
//#region Forbidden imports - these imports are being pulled from later in the layers and should not be
import type {
	IEvaluatedProgram,
	IPlannerProgramExercise,
	IPlannerProgramExerciseWithType,
} from "@/evaluators/plan-evaluator-minimal.ts";
//#endregion

export const TProgramExerciseWarmupSet = z.strictObject({
	reps: z.number(),
	value: z.union([TWeight, z.number()]),
	threshold: TWeight,
});
export type IProgramExerciseWarmupSet = Readonly<z.infer<typeof TProgramExerciseWarmupSet>>;

function warmup(
	programExerciseWarmupSets: IProgramExerciseWarmupSet[],
	shouldSkipThreshold: boolean = false,
): (weight: IWeight | undefined, settings: ISettings, exerciseType?: IExerciseType) => ISet[] {
	return (
		weight: IWeight | undefined,
		settings: ISettings,
		exerciseType?: IExerciseType,
	): ISet[] => {
		let index = ZERO;
		return programExerciseWarmupSets.reduce<ISet[]>((memo, programExerciseWarmupSet) => {
			if (
				shouldSkipThreshold ||
				(weight != null && gt(weight, programExerciseWarmupSet.threshold))
			) {
				const value = programExerciseWarmupSet.value;
				const unit = getPreferredUnit(settings, exerciseType);
				if (!isNumber(value) || weight != null) {
					const warmupWeight = isNumber(value) ? multiply(weight!, value) : value;
					const roundedWeight = round(convertTo(warmupWeight, unit), settings, unit, exerciseType);
					memo.push({
						index,
						id: generateUid(6),
						reps: programExerciseWarmupSet.reps,
						isUnilateral: exerciseType ? isUnilateral(exerciseType, settings) : false,
						weight: roundedWeight,
						originalWeight: warmupWeight,
						isCompleted: false,
					});
					index = next(index);
				}
			}
			return memo;
		}, []);
	};
}

/**
 * Determines what warmup sets to use for an exercise in a program.
 * @param exercise The exercise to get warmup sets for
 * @param weight The weight to use for warmup sets
 * @param settings The user settings
 * @param programExerciseWarmupSets The warmup sets defined in the program
 */
export function getWarmupSets(
	exercise: IExerciseType,
	weight: IWeight | undefined,
	settings: ISettings,
	programExerciseWarmupSets?: IProgramExerciseWarmupSet[],
): ISet[] {
	if (programExerciseWarmupSets) {
		return warmup(programExerciseWarmupSets, true)(weight, settings, exercise);
	}

	const def = getExerciseOrDefault(exercise, settings.exercises).defaultWarmup;
	if (def !== 10 && def !== 45 && def !== 95) {
		return [];
	}
	const reps = 5;
	const first = { reps, value: 0.3 };
	const second = { reps, value: 0.5 };
	const third = { reps, value: 0.8 };
	const isLb = settings.units === "lb";
	return warmup(
		def === 10
			? [
					{ ...first, threshold: isLb ? w`60lb` : w`30kg` },
					{ ...second, threshold: isLb ? w`30lb` : w`15kg` },
					{ ...third, threshold: isLb ? w`10lb` : w`5kg` },
				]
			: def === 45
				? [
						{ ...first, threshold: isLb ? w`120lb` : w`60kg` },
						{ ...second, threshold: isLb ? w`90lb` : w`45kg` },
						{ ...third, threshold: isLb ? w`45lb` : w`20kg` },
					]
				: def === 95
					? [
							{ ...first, threshold: isLb ? w`150lb` : w`70kg` },
							{ ...second, threshold: isLb ? w`125lb` : w`60kg` },
							{ ...third, threshold: isLb ? w`95lb` : w`40kg` },
						]
					: [],
	)(weight, settings, exercise);
}
const TProgramStateMetadataValue = z.strictObject({
	userPrompted: z.boolean().optional(),
});
const TProgramStateMetadata = z.record(z.string(), TProgramStateMetadataValue);
export type IProgramStateMetadata = z.infer<typeof TProgramStateMetadata>;
const TProgramSet = z.strictObject({
	repsExpr: z.string(),
	weightExpr: z.string(),
	isAmrap: z.boolean().optional(),
	rpeExpr: z.string().optional(),
	minRepsExpr: z.string().optional(),
	logRpe: z.boolean().optional(),
	askWeight: z.boolean().optional(),
	label: z.string().optional(),
	timerExpr: z.string().optional(),
});
const TProgramExerciseVariation = z.strictObject({
	sets: z.array(TProgramSet),
	quickAddSets: z.boolean().optional(),
});
const TProgramExerciseReuseLogic = z.strictObject({
	selected: z.union([z.string(), z.undefined()]),
	states: z.record(z.string(), TProgramState),
});
const TProgramExercise = z.strictObject({
	exerciseType: TExerciseType,
	id: z.string(),
	name: z.string(),
	variations: z.array(TProgramExerciseVariation),
	state: TProgramState,
	variationExpr: z.string(),
	finishDayExpr: z.string(),
	descriptions: z.array(z.string()),
	tags: z.array(z.number()).optional(),
	updateDayExpr: z.string().optional(),
	diffPaths: z.array(z.string()).optional(),
	description: z.string().optional(),
	descriptionExpr: z.string().optional(),
	quickAddSets: z.boolean().optional(),
	enableRepRanges: z.boolean().optional(),
	enableRpe: z.boolean().optional(),
	stateMetadata: TProgramStateMetadata.optional(),
	timerExpr: z.string().optional(),
	reuseLogic: TProgramExerciseReuseLogic.optional(),
	warmupSets: z.array(TProgramExerciseWarmupSet).optional(),
	reuseFinishDayScript: z.string().optional(),
	reuseUpdateDayScript: z.string().optional(),
});
const TProgramWeek = z.strictObject({
	id: z.string(),
	name: z.string(),
	days: z.array(
		z.strictObject({
			id: z.string(),
		}),
	),
	description: z.string().optional(),
});
const TProgramDay = z.strictObject({
	id: z.string(),
	name: z.string(),
	exercises: z.array(
		z.strictObject({
			id: z.string(),
		}),
	),
	description: z.string().optional(),
});
const TPlannerProgramDay = z.strictObject({
	name: z.string(),
	exerciseText: z.string(),
	id: z.string().optional(),
	description: z.string().optional(),
});
export type IPlannerProgramDay = z.infer<typeof TPlannerProgramDay>;
const TPlannerProgramWeek = z.strictObject({
	name: z.string(),
	days: z.array(TPlannerProgramDay),
	id: z.string().optional(),
	description: z.string().optional(),
});
export type IPlannerProgramWeek = Readonly<z.infer<typeof TPlannerProgramWeek>>;
const TPlannerProgram = z.strictObject({
	name: z.string(),
	weeks: z.array(TPlannerProgramWeek),
});
export type IPlannerProgram = Readonly<z.infer<typeof TPlannerProgram>>;
const TProgram = z.object({
	exercises: z.array(TProgramExercise),
	id: z.string(),
	name: z.string(),
	description: z.string(),
	url: z.string(),
	author: z.string(),
	nextDay: zIndexFrom1,
	days: z.array(TProgramDay),
	weeks: z.array(TProgramWeek),
	deletedDays: z.array(z.string()).optional(),
	deletedWeeks: z.array(z.string()).optional(),
	deletedExercises: z.array(z.string()).optional(),
	clonedAt: z.number().optional(),
	shortDescription: z.string().optional(),
	planner: TPlannerProgram.optional(),
	updatedAt: z.number().optional(),
	authorid: z.string().nullish(),
	source: z.string().nullish(),
});
export type IProgram = z.infer<typeof TProgram>;
export function Program_getProgramExerciseForKeyAndDay(
	program: IEvaluatedProgram,
	day: IndexFrom1,
	key?: string,
): IPlannerProgramExerciseWithType | undefined {
	if (!key) return undefined;

	const programDay = getDayData(program, day).dayObj;
	const dayExercises = programDay ? Program_getProgramDayUsedExercises(programDay) : [];

	const exerciseFoundInDay = dayExercises.find(pe => pe.key === key);
	if (exerciseFoundInDay) return exerciseFoundInDay;

	const exerciseFoundInProgram = getExercisesInProgram(program)
		.filter((e): e is IPlannerProgramExerciseWithType => e.exerciseType !== undefined)
		.find(pe => pe.key === key);
	if (!exerciseFoundInProgram) return undefined;

	return {
		...exerciseFoundInProgram,
		dayData: getDayData(program, day),
	};
}

export function getExercisesInProgram(
	evaluatedProgram: IEvaluatedProgram,
): IPlannerProgramExercise[] {
	return evaluatedProgram.weeks.flatMap(w => w.days.flatMap(d => d.exercises));
}

export function getTotalDaysInProgram(program: IEvaluatedProgram): number {
	return program.weeks.reduce((sum, week) => sum + week.days.length, 0);
}

/**
 * Determines information about an absolute day in a program
 * @param program The program to get information about
 * @param day The absolute day to get information about
 */
export function getDayData(
	program: IEvaluatedProgram,
	day: IndexFrom1,
): IDayData & {
	/**
	 * The actual day object at this absolute day index of the program
	 */
	dayObj: IEvaluatedProgramDay | undefined;
} {
	let week = as1(0);
	let dayInWeek: IndexFrom1 = castAs1(1);
	let daysTotal = 0;
	for (let i = ZERO; i < program.weeks.length; i = next(i)) {
		const weekLength = program.weeks[i].days.length;
		daysTotal += weekLength;
		if (daysTotal >= day) {
			week = as1(i);
			dayInWeek = castAs1(day - (daysTotal - weekLength));
			break;
		}
	}

	return {
		day,
		week,
		dayInWeek,
		dayObj: program.weeks[week - 1]?.days[dayInWeek - 1],
	};
}

export function Program_getProgramDayUsedExercises(
	programDay: IEvaluatedProgramDay,
): IPlannerProgramExerciseWithType[] {
	return programDay.exercises.filter(
		(e): e is IPlannerProgramExerciseWithType => !e.notused && e.exerciseType != null,
	);
}

export function Program_getProgramExercise(
	day: IndexFrom1,
	program?: IEvaluatedProgram,
	key?: string,
): IPlannerProgramExercise | undefined {
	if (key == null || program == null) {
		return undefined;
	}
	return getDayData(program, day).dayObj?.exercises.find(e => e.key === key);
}

/**
 * Gets which day of the program is next, the index returned is 1-indexed
 * @param program The program
 * @param day The current day, ?1-indexed?
 */
export function Program_nextDay(program: IEvaluatedProgram, day?: number): IndexFrom1 {
	return as1(castAs0(day != null ? day % getTotalDaysInProgram(program) : 0), 1);
}

export type IDayData = {
	/**
	 * Which week of the program the day falls into
	 * 1-indexed
	 */
	week: IndexFrom1;
	/**
	 * The absolute day of the program
	 */
	day: IndexFrom1;
	/**
	 * Which day within the week the absolute day falls into
	 * e.g. If there are 2 days in a week, and the day is 3, then this is 1
	 */
	dayInWeek: IndexFrom1;
};
export interface IEvaluatedProgramDay {
	name: string;
	dayData: IDayData;
	description?: string;
	exercises: IPlannerProgramExercise[];
}
