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
import { isWeightlike } from "@/logic/types.ts";
import { isNumber } from "@/utils/types.ts";
import { definedOnly } from "@/utils/collection.ts";

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
		const successes = isNumber(state.successes) ? state.successes : undefined;
		const decrement = isWeightlike(state.decrement) ? state.decrement : undefined;
		const failures = isNumber(state.failures) ? state.failures : undefined;
		const args: (string | undefined)[] = [print(state.increment)];
		if ((successes && successes > 1) || (decrement && decrement.value > 0)) {
			args.push(successes?.toString(), state.successCounter?.toString());
		}
		if (decrement && decrement.value > 0) {
			args.push(print(decrement));
		}
		if (failures && failures > 1) {
			args.push(failures?.toString(), state.failureCounter?.toString());
		}
		progressStr += `(${args.filter(definedOnly).join(", ")})`;
	} else if (progress.type === "dp") {
		const args = [
			print(state.increment),
			state.minReps?.toString(),
			state.maxReps?.toString(),
		].join(", ");
		progressStr += `(${args})`;
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
