import { findErrorNode, nodeError, SourcedSyntaxError } from "@/utils/lezer.ts";
import type { ISettings } from "@/user-settings";
import type { IDayData } from "@/program";
import { nodeFailure, type NodeResult } from "@/common-types.ts";
import { as1, castAs0, castAs1, next } from "@/utils/indexes.ts";
import { PlannerNodeName, type PlanNodes } from "@/planner/parsing/guards.ts";
import { queryChildren } from "@/utils/grammars.ts";
import { definedOnly } from "@/utils/collection.ts";
import { evaluate as evaluateExerciseExpression } from "@/planner/evaluators/node-exercise-expression.ts";
import { Progress_createScriptFunctions } from "@/public-functions.ts";
import { StringUtils_unindent } from "@/utils/string.ts";
import {
	IPlannerExerciseEvaluatorMode,
	type IPlannerExerciseEvaluatorWeek,
	Progress_createEmptyScriptBindings,
} from "@/evaluators/plan-evaluator-minimal.ts";

/**
 * Evaluates an exercise definition program
 * @param programNode The top level, program node from the parser
 * @param settings The user's settings
 * @param mode The mode to evaluate under
 * @param dayData The information about the day in the program this exercise is
 */
export function evaluate(
	programNode: PlanNodes.Program,
	settings: ISettings,
	mode: IPlannerExerciseEvaluatorMode,
	dayData: Readonly<IDayData> = {
		day: as1(0),
		week: as1(0),
		dayInWeek: as1(0),
	},
): NodeResult<IPlannerExerciseEvaluatorWeek[]> {
	try {
		const firstError = findErrorNode(programNode);
		if (firstError) {
			return nodeFailure(nodeError(firstError));
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
