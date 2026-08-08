// Grammars / parsers
export { parser as logicParser } from "@/logic/parsing/logic.ts";
export { parser as workoutPlanParser } from "@/planner/parsing/workout-plan.ts";
export { type SourcedSyntaxNode } from "@/utils/lezer.ts";

// Script functions (logic builtins)
export { Progress_createScriptFunctions } from "@/public-functions.ts";

//#region Program building & evaluation
export {
	Program_evaluate,
	Program_nextHistoryRecordFromEvaluated,
	Program_runAllFinishDayScripts,
	type IEvaluatedProgram,
	type IHistoryRecord,
	type IHistoryEntry,
	type IPlannerProgramExercise,
	type IWeightChange,
} from "@/evaluators/plan-evaluator-minimal.ts";

export { PlannerProgram_evaluateText } from "@/planner/evaluators";

export {
	getDayData,
	getExercisesInProgram,
	getTotalDaysInProgram,
	type IDayData,
	type IEvaluatedProgramDay,
	type IProgram,
	type IPlannerProgram,
	type IPlannerProgramWeek,
	type IPlannerProgramDay,
} from "@/program";
//#endregion

//#region Settings
export { Settings_build, getPreferredUnit, type ISettings } from "@/user-settings";
//#endregion

//#region Exercises
export {
	allExercisesList,
	Exercise_fullName,
	getExerciseOrDefault,
	getOrmOrStartingWeight,
	maybeGetExercise,
	toKey,
	type IExercise,
	type IExerciseId,
	type IExerciseType,
	type IExerciseTypeKey,
} from "@/exercises";
//#endregion

//#region Fitness stats
export { Stats_build, getAverageBodyweight, type IStats } from "@/fitness-stats";
//#endregion

//#region Quantities (weights)
export {
	add,
	build as buildWeight,
	compare as compareWeight,
	convertTo,
	divide,
	eq as weightEq,
	gt as weightGt,
	gte as weightGte,
	lt as weightLt,
	lte as weightLte,
	multiply,
	parse as parseWeight,
	print as printWeight,
	subtract,
	type IDynamicWeight,
	type IUnit,
	type IWeight,
} from "@/quantities/weight.ts";
//#endregion

//#region Shared types
export { type ISet, type IProgramState } from "@/common-types.ts";
//#endregion

export { ObjectUtils_entries } from "./utils/object";
export { Program_create } from "@/program";
