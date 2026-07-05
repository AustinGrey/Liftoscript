import * as planTerms from "./workout-plan.terms.ts";
import { type ISyntaxPointer, SourcedSyntaxError, type SourcedSyntaxNode } from "@/utils/lezer.ts";
import { type QueryOptions, type TQueryResult, tryQueryChildren } from "@/utils/grammars.ts";

type IdMap_Plan = typeof planTerms;

export type NodeNames_Plan = keyof IdMap_Plan;

export type TypedPlanNode<T extends NodeNames_Plan> = SourcedSyntaxNode & {
	name: T;
	type: {
		name: T;
		id: IdMap_Plan[T];
	};
};

export namespace PlanNodes {
	export type Program = TypedPlanNode<"Program">;
	export type LineComment = TypedPlanNode<"LineComment">;
	export type TripleLineComment = TypedPlanNode<"TripleLineComment">;
	export type Week = TypedPlanNode<"Week">;
	export type Day = TypedPlanNode<"Day">;
	export type ExerciseExpression = TypedPlanNode<"ExerciseExpression">;
	export type ExerciseName = TypedPlanNode<"ExerciseName">;
	export type NonSeparator = TypedPlanNode<"NonSeparator">;
	export type Repeat = TypedPlanNode<"Repeat">;
	export type Rep = TypedPlanNode<"Rep">;
	export type Int = TypedPlanNode<"Int">;
	export type RepRange = TypedPlanNode<"RepRange">;
	export type SectionSeparator = TypedPlanNode<"SectionSeparator">;
	export type ExerciseSection = TypedPlanNode<"ExerciseSection">;
	export type ExerciseProperty = TypedPlanNode<"ExerciseProperty">;
	export type ExercisePropertyName = TypedPlanNode<"ExercisePropertyName">;
	export type Keyword = TypedPlanNode<"Keyword">;
	export type FunctionExpression = TypedPlanNode<"FunctionExpression">;
	export type FunctionName = TypedPlanNode<"FunctionName">;
	export type FunctionArgument = TypedPlanNode<"FunctionArgument">;
	export type Number = TypedPlanNode<"Number">;
	export type Plus = TypedPlanNode<"Plus">;
	export type PosNumber = TypedPlanNode<"PosNumber">;
	export type Float = TypedPlanNode<"Float">;
	export type Weight = TypedPlanNode<"Weight">;
	export type Percentage = TypedPlanNode<"Percentage">;
	export type Rpe = TypedPlanNode<"Rpe">;
	export type KeyValue = TypedPlanNode<"KeyValue">;
	export type Liftoscript = TypedPlanNode<"Liftoscript">;
	export type ReuseLiftoscript = TypedPlanNode<"ReuseLiftoscript">;
	export type ReuseSection = TypedPlanNode<"ReuseSection">;
	export type WarmupExerciseSets = TypedPlanNode<"WarmupExerciseSets">;
	export type WarmupExerciseSet = TypedPlanNode<"WarmupExerciseSet">;
	export type WarmupSetPart = TypedPlanNode<"WarmupSetPart">;
	export type None = TypedPlanNode<"None">;
	export type ExerciseSets = TypedPlanNode<"ExerciseSets">;
	export type CurrentVariation = TypedPlanNode<"CurrentVariation">;
	export type ExerciseSet = TypedPlanNode<"ExerciseSet">;
	export type Timer = TypedPlanNode<"Timer">;
	export type SetPart = TypedPlanNode<"SetPart">;
	export type WeightWithPlus = TypedPlanNode<"WeightWithPlus">;
	export type PercentageWithPlus = TypedPlanNode<"PercentageWithPlus">;
	export type SetLabel = TypedPlanNode<"SetLabel">;
	export type AskWeight = TypedPlanNode<"AskWeight">;
	export type ReuseSectionWithWeekDay = TypedPlanNode<"ReuseSectionWithWeekDay">;
	export type WeekDay = TypedPlanNode<"WeekDay">;
	export type WeekOrDay = TypedPlanNode<"WeekOrDay">;
	export type Current = TypedPlanNode<"Current">;
	export type Superset = TypedPlanNode<"Superset">;
	export type SupersetKeyword = TypedPlanNode<"SupersetKeyword">;
	export type EmptyExpression = TypedPlanNode<"EmptyExpression">;
}

export enum PlannerNodeName {
	Program = "Program",
	LineComment = "LineComment",
	TripleLineComment = "TripleLineComment",
	Week = "Week",
	Day = "Day",
	ExerciseExpression = "ExerciseExpression",
	ExerciseName = "ExerciseName",
	NonSeparator = "NonSeparator",
	Repeat = "Repeat",
	Rep = "Rep",
	Int = "Int",
	RepRange = "RepRange",
	SectionSeparator = "SectionSeparator",
	ExerciseSection = "ExerciseSection",
	ExerciseProperty = "ExerciseProperty",
	ExercisePropertyName = "ExercisePropertyName",
	Keyword = "Keyword",
	FunctionExpression = "FunctionExpression",
	FunctionName = "FunctionName",
	FunctionArgument = "FunctionArgument",
	Number = "Number",
	Plus = "Plus",
	PosNumber = "PosNumber",
	Float = "Float",
	Weight = "Weight",
	Percentage = "Percentage",
	Rpe = "Rpe",
	KeyValue = "KeyValue",
	Liftoscript = "Liftoscript",
	ReuseLiftoscript = "ReuseLiftoscript",
	ReuseSection = "ReuseSection",
	WarmupExerciseSets = "WarmupExerciseSets",
	WarmupExerciseSet = "WarmupExerciseSet",
	WarmupSetPart = "WarmupSetPart",
	None = "None",
	ExerciseSets = "ExerciseSets",
	CurrentVariation = "CurrentVariation",
	ExerciseSet = "ExerciseSet",
	Timer = "Timer",
	SetPart = "SetPart",
	WeightWithPlus = "WeightWithPlus",
	PercentageWithPlus = "PercentageWithPlus",
	SetLabel = "SetLabel",
	ReuseSectionWithWeekDay = "ReuseSectionWithWeekDay",
	WeekDay = "WeekDay",
	WeekOrDay = "WeekOrDay",
	Current = "Current",
	Superset = "Superset",
	SupersetKeyword = "SupersetKeyword",
	AskWeight = "AskWeight",
	EmptyExpression = "EmptyExpression",
}

/**
 * Typeguards a generic SyntaxNode into a specific type of node
 * @param name The Syntax kind to guard to
 * @param node The node to guard
 */
export function isPlanNodeOfType<T extends NodeNames_Plan>(
	name: T,
	node: SourcedSyntaxNode,
): node is TypedPlanNode<T> {
	return node.type.name === name;
}

export function isPlanNodeName(name: string): name is NodeNames_Plan {
	return name in planTerms;
}

export function asPlanNodeOfTypeOrThrow<T extends NodeNames_Plan>(
	name: T,
	node: SourcedSyntaxNode,
): TypedPlanNode<T> {
	if (!isPlanNodeOfType(name, node)) {
		throw new Error(`Expected node of type ${name}, got ${node.type.name}`);
	}
	return node as TypedPlanNode<T>;
}

export function plannerError(
	fullName: string | undefined,
	message: string,
	point: ISyntaxPointer,
): SourcedSyntaxError {
	return new SourcedSyntaxError(
		`${fullName ? `${fullName}: ` : ""}${message} (${point.line}:${point.offset})`,
		point.line,
		point.offset,
		point.from,
		point.to,
	);
}

// @todo extract to a "queries" module for plan nodes? Or call this guards-and-queries
export function* tryQueryPlanNodeChildren<TOptions extends QueryOptions<NodeNames_Plan>>(
	node: TypedPlanNode<NodeNames_Plan>,
	options?: TOptions,
): Generator<
	TQueryResult<
		TypedPlanNode<TOptions["ofType"] extends NodeNames_Plan ? TOptions["ofType"] : NodeNames_Plan>,
		TOptions
	>
> {
	yield* tryQueryChildren(node, options) as Generator<
		TQueryResult<
			TypedPlanNode<
				TOptions["ofType"] extends NodeNames_Plan ? TOptions["ofType"] : NodeNames_Plan
			>,
			TOptions
		>
	>;
}

/**
 * Gets child, or returns undefined if there are no (matching) children
 * @param node The node to get the first matching child of
 * @param options Additional options to pass along to queryChildren
 */
export function queryPlanNodeChild<TTypes extends NodeNames_Plan>(
	node: TypedPlanNode<NodeNames_Plan>,
	options?: QueryOptions<TTypes>,
): TypedPlanNode<TTypes> | undefined {
	const [result] = tryQueryPlanNodeChildren(node, options).filter(
		(r): r is TypedPlanNode<TTypes> => !(r instanceof SourcedSyntaxError),
	);
	return result;
}
