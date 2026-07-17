import {
	getExerciseOrDefault,
	getExercisesInProgram,
	getOrmOrStartingWeight,
	PlannerProgram_evaluateText,
	printWeight,
	Program_create,
	Program_evaluate,
	Program_nextHistoryRecordFromEvaluated,
	Program_runAllFinishDayScripts,
	Settings_build,
	Stats_build,
	toKey,
	type IExerciseTypeKey,
	ObjectUtils_entries,
} from "grammars";
import type { IProgram, ISettings, IUnit, IWeight } from "grammars";

export interface ProgramExerciseInfo {
	/** Stable key (id + equipment) used to index into settings. */
	key: string;
	/** Human readable name. */
	name: string;
	/** The default 1RM / starting weight the library would use. */
	defaultOrm: IWeight;
}

export interface SimSet {
	reps?: number;
	minReps?: number;
	weight?: string;
	rpe?: number;
	isAmrap?: boolean;
	label?: string;
}

export interface SimEntry {
	exerciseName: string;
	exerciseKey: string;
	sets: SimSet[];
}

export interface SimSession {
	/** 1-based ordinal across the whole simulation. */
	ordinal: number;
	day: number;
	week?: number;
	dayInWeek?: number;
	dayName: string;
	entries: SimEntry[];
}

export interface SimulationOptions {
	units: IUnit;
	/** Map of exercise key -> chosen 1RM. Missing entries fall back to library defaults. */
	oneRepMaxes: Record<string, IWeight | undefined>;
	numberOfSessions: number;
}

export interface SimulationResult {
	sessions: SimSession[];
	error?: string;
}

const PROGRAM_NAME = "Playground";

function buildProgram(plannerText: string): IProgram {
	return {
		...Program_create(PROGRAM_NAME),
		planner: {
			name: PROGRAM_NAME,
			weeks: PlannerProgram_evaluateText(plannerText),
		},
	};
}

function buildSettings(
	units: IUnit,
	oneRepMaxes: Record<IExerciseTypeKey, IWeight | undefined>,
): ISettings {
	const settings = Settings_build();
	settings.units = units;
	for (const [key, orm] of ObjectUtils_entries(oneRepMaxes)) {
		if (orm) {
			settings.exerciseData[key] = { ...settings.exerciseData[key], rm1: orm };
		}
	}
	return settings;
}

/**
 * Parses and evaluates the program, returning the distinct exercises it uses.
 * Used to build the per-exercise 1RM inputs in the settings panel.
 */
export function getProgramExercises(
	plannerText: string,
	units: IUnit,
): { exercises: ProgramExerciseInfo[]; error?: string } {
	try {
		const settings = buildSettings(units, {});
		const evaluated = Program_evaluate(buildProgram(plannerText), settings);
		const seen = new Map<string, ProgramExerciseInfo>();
		for (const exercise of getExercisesInProgram(evaluated)) {
			const type = exercise.exerciseType;
			if (!type) continue;
			const key = toKey(type);
			if (seen.has(key)) continue;
			seen.set(key, {
				key,
				name: getExerciseOrDefault(type, {}).name,
				defaultOrm: getOrmOrStartingWeight(type, settings),
			});
		}
		return { exercises: [...seen.values()] };
	} catch (e) {
		return { exercises: [], error: errorMessage(e) };
	}
}

function toSimSession(
	record: ReturnType<typeof Program_nextHistoryRecordFromEvaluated>,
	ordinal: number,
): SimSession {
	return {
		ordinal,
		day: record.day,
		week: record.week,
		dayInWeek: record.dayInWeek,
		dayName: record.dayName,
		entries: record.entries.map(entry => ({
			exerciseName: getExerciseOrDefault(entry.exercise, {}).name,
			exerciseKey: toKey(entry.exercise),
			sets: entry.sets.map(set => ({
				reps: set.reps,
				minReps: set.minReps,
				weight: set.weight ? printWeight(set.weight) : undefined,
				rpe: set.rpe,
				isAmrap: set.isAmrap,
				label: set.label,
			})),
		})),
	};
}

/**
 * Runs the program for N sessions, completing every prescribed set exactly as
 * written (all reps, at the target weight), and returns the workout that would
 * be generated on each session, with progression applied between sessions.
 */
export function runSimulation(plannerText: string, options: SimulationOptions): SimulationResult {
	const stats = Stats_build();
	let settings = buildSettings(options.units, options.oneRepMaxes);
	let program: IProgram;
	try {
		program = buildProgram(plannerText);
	} catch (e) {
		return { sessions: [], error: errorMessage(e) };
	}

	const sessions: SimSession[] = [];
	for (let i = 0; i < options.numberOfSessions; i++) {
		try {
			const evaluated = Program_evaluate(program, settings);
			const record = Program_nextHistoryRecordFromEvaluated(
				evaluated,
				settings,
				stats,
				program.nextDay,
			);
			sessions.push(toSimSession(record, i + 1));

			for (const entry of record.entries) {
				for (const set of entry.sets) {
					set.completedReps = set.reps ?? set.minReps ?? 0;
					set.completedWeight = set.weight;
					set.isCompleted = true;
				}
			}

			const result = Program_runAllFinishDayScripts(program, record, stats, settings);
			program = result.program;

			const mergedExerciseData = { ...settings.exerciseData };
			for (const [key, data] of ObjectUtils_entries(result.exerciseData)) {
				//@todo not a fan of these casts, how to work around it?
				mergedExerciseData[key as IExerciseTypeKey] = {
					...mergedExerciseData[key as IExerciseTypeKey],
					...data,
				};
			}
			settings = { ...settings, exerciseData: mergedExerciseData };
		} catch (e) {
			return { sessions, error: errorMessage(e) };
		}
	}

	return { sessions };
}

function errorMessage(e: unknown): string {
	if (e instanceof Error) return e.message;
	if (typeof e === "string") return e;
	try {
		return JSON.stringify(e);
	} catch {
		return "Unknown error";
	}
}
