import { getCurrentEquipment, type ISettings } from "@/user-settings";
import { ObjectUtils_entries } from "@/utils/object.ts";
import { type IDynamicWeight, type IWeight, print } from "@/quantities/weight.ts";
import { Exercise_fullName, getExerciseOrDefault } from "@/exercises";
import {
	type IPlannerProgramExercise,
	PlannerProgramExercise_getOnlyChangedState,
	PlannerProgramExercise_getState,
	PlannerProgramExercise_getStateMetadata,
} from "@/evaluators/plan-evaluator-minimal.ts";

export function getProgress(programExercise: IPlannerProgramExercise, settings: ISettings): string {
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
			progressStr += ` ${progress.script}`;
		}
	}
	return progressStr;
}
