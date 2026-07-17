import type { LogicHandler } from "@/logic/evaluators/types.ts";
import { is, isNumber, isOneOf } from "@/utils/types.ts";
import { TDynamicWeight, TWeight, convertToWeight } from "@/quantities/weight.ts";
import { toNumberUnsafe, coerceToQuantity, operate } from "@/logic/result-handling.ts";
import {
	changeBinding,
	changeNumberOfSets,
	recordVariableUpdate,
} from "@/logic/evaluators/common.ts";
import { isQuantity, type Quantity } from "@/logic/types.ts";
import { nodeError } from "@/utils/lezer.ts";
import { throwError } from "@/utils/errors.ts";
import { queryChild, queryChildren } from "@/logic/parsing/guards.ts";

// @todo this is a lot of complicated logic - can't this be simplified by just desugaring this to left = left <op> right? We can dispatch this to the existing handlers for binary ops and assignment
export const handler: LogicHandler<"IncAssignmentExpression"> = (n, t) => {
	const [stateVar, incAssignmentExpr, expression] = queryChildren(n, {
		atLeast: 3,
	});
	if (
		stateVar == null ||
		expression == null ||
		incAssignmentExpr == null ||
		!isOneOf(stateVar.type.name, "StateVariable", "VariableExpression", "Variable")
	) {
		throw nodeError(n, `missing required nodes for IncAssignmentExpression`);
	}

	// This function set is more readable unchopped
	/* prettier-ignore */ const add     = <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a + b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "+", (message)=>{throw nodeError(n, message)});
	/* prettier-ignore */ const subtract= <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a - b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "-", (message)=>{throw nodeError(n, message)});
	/* prettier-ignore */ const multiply= <L extends Quantity | undefined, R extends Quantity | undefined>(l: L, r: R) => operate(l, r, (a, b) => a * b, (d, u)=>convertToWeight(t.getGlobal("rm1"), d, u), "*", (message)=>{throw nodeError(n, message)});
	/* prettier-ignore */ const divide = <
    L extends Quantity | undefined,
    R extends Quantity | undefined,
  >(
    l: L,
    r: R,
  ) =>
    operate(
      l,
      r,
      (a, b) => a / b,
      (d, u) => convertToWeight(t.getGlobal("rm1"), d, u),
      "/",
      (message) => {
        throw nodeError(n, message);
      },
    );

	switch (stateVar.type.name) {
		case "VariableExpression": {
			const nameNode = queryChild(stateVar, { ofType: "Keyword" });
			if (nameNode == null) {
				throw nodeError(stateVar, `Missing variable name`);
			}
			const [...indexExprs] = queryChildren(stateVar, {
				ofType: "VariableIndex",
			});
			const variable = nameNode?.source;
			if (variable === "rm1") {
				if (indexExprs.length > 0) {
					throw nodeError(n, `rm1 is not an array`);
				}
				const value = coerceToQuantity(t.recurse(expression));

				const op = incAssignmentExpr.source;
				t.updateGlobal("rm1", rm1 =>
					convertToWeight(
						rm1,
						op === "+="
							? add(rm1, value)
							: op === "-="
								? subtract(rm1, value)
								: op === "*="
									? multiply(rm1, value)
									: op === "/="
										? divide(rm1, value)
										: throwError(
												nodeError(incAssignmentExpr, `Unknown operator ${op} after ${variable}`),
											),
						// @todo why use this.unit? When you can do all the math in kg and just adjust at display time?
						// this.unit
						"kg",
					),
				);
				return t.getGlobal("rm1");
			} else if (
				t.mode === "planner" &&
				isOneOf(
					variable,
					"reps",
					"weights",
					"RPE",
					"minReps",
					"timers",
					"setVariationIndex",
					"descriptionIndex",
					"numberOfSets",
				)
			) {
				const op = incAssignmentExpr.source;
				return isOneOf(op, "=", "+=", "-=", "*=", "/=")
					? recordVariableUpdate(variable, expression, indexExprs, op, t)
					: throwError(nodeError(incAssignmentExpr, `Unknown operator ${op} after ${variable}`));
			} else if (t.mode === "update" && variable === "numberOfSets") {
				const op = incAssignmentExpr.source;
				return isOneOf(op, "=", "+=", "-=", "*=", "/=")
					? changeNumberOfSets(expression, op, t)
					: throwError(nodeError(incAssignmentExpr, `Unknown operator ${op} after ${variable}`));
			} else if (
				t.mode === "update" &&
				isOneOf(variable, "reps", "weights", "RPE", "minReps", "timers")
			) {
				const op = incAssignmentExpr.source;
				return isOneOf(op, "=", "+=", "-=", "*=", "/=")
					? changeBinding(variable, expression, indexExprs, op, t)
					: throwError(nodeError(incAssignmentExpr, `Unknown operator ${op} after ${variable}`));
			} else {
				throw nodeError(stateVar, `Unknown variable '${variable}'`);
			}
		}
		case "Variable": {
			const varKey = stateVar.source.replace("var.", "");
			let value = t.recurse(expression);
			if (!(is(TWeight, value) || is(TDynamicWeight, value) || isNumber(value))) {
				value = value ? 1 : 0;
			}
			const op = incAssignmentExpr.source;
			if (isOneOf(op, "=", "+=", "-=", "*=", "/=")) {
				switch (op) {
					case "+=":
						return t.updateVar(varKey, add(t.getVar(varKey), value));
					case "-=":
						return t.updateVar(varKey, subtract(t.getVar(varKey), value));
					case "*=":
						return t.updateVar(varKey, multiply(t.getVar(varKey), value));
					case "/=":
						return t.updateVar(varKey, divide(t.getVar(varKey), value));
					case "=":
						// @todo this would be solved if we used the desugaring method - this would never be reached
						throw nodeError(incAssignmentExpr, `Unknown operator ${op} after ${varKey}`);
					default:
						return op satisfies never;
				}
			} else {
				throw nodeError(incAssignmentExpr, `Unknown operator ${op} after ${varKey}`);
			}
		}
		case "StateVariable": {
			const indexNode = queryChild(stateVar, {
				ofType: "StateVariableIndex",
			});
			const stateKeyNode = queryChild(stateVar, { ofType: "Keyword" });
			if (stateKeyNode === undefined) {
				// @todo why return 0? why not just undefined?
				return 0;
			}
			const stateKey = stateKeyNode.source;
			// The presence of an index node indicates that we're accessing an "other state"
			// @todo I still don't understand this "otherstate" system? Why not just have one state? Or is this the state of another exercise than the one being evaluated?

			// @todo this coercion is different than  in other places. In this one, arrays are always coerced to 1, but in others, you extract the first value and coerce that as an individual
			let value = t.recurse(expression);
			if (!isQuantity(value)) {
				value = value ? 1 : 0;
			}
			const op = incAssignmentExpr.source;
			// @todo in original liftoscript, if updating an "other state" via index, but there is no state at the index, then you just return the evaluated value, and it's all fine. The update is ignored. Is that still happening?
			return t.updateState(
				stateKey,
				(currentValue = 0) =>
					op === "+="
						? add(currentValue, value)
						: op === "-="
							? subtract(currentValue, value)
							: op === "*="
								? multiply(currentValue, value)
								: op === "/="
									? divide(currentValue, value)
									: throwError(
											nodeError(
												incAssignmentExpr,
												`Unknown operator ${op} after state.${stateKey}`,
											),
										),
				n,
				indexNode ? toNumberUnsafe(t.recurse(indexNode)) : undefined,
			);
		}
		default:
			stateVar.type.name satisfies never;
	}
};
