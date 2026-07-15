import { is } from "@/utils/types.ts";
import { type IDynamicWeight, type IWeight, multiply, TWeight } from "@/quantities/weight.ts";
import { Option as $ } from "effect";

/**
 * Evaluates a potentially dynamic weight into a guaranteed static one.
 * @param weight The potentially dynamic weight to evaluate
 * @param onerm In the context of this set, what the one rep max is. If you don't know it, you can't evaluate dynamic weights.
 */
export function evaluateWeight(
	weight: IWeight | IDynamicWeight | undefined,
	onerm: IWeight,
): $.Option<IWeight> {
	return weight === undefined
		? $.none()
		: is(TWeight, weight)
			? $.some(weight)
			: $.some(multiply(onerm, weight.value / 100));
}
