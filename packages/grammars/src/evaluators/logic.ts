import { parser } from "@/parsers/logic.ts";
import type { SyntaxNode } from "@lezer/common";
import { MathUtils_roundFloat } from "@/utils/math.ts";
import {
  type IPercentage,
  type IProgramState,
  type IScriptBindings,
  type IWeight,
  NodeName,
  Weight_build,
  Weight_buildPct,
  Weight_convertToWeight,
  Weight_is,
  Weight_isPct,
} from "@/evaluators/logic-evaluator.ts";

/**
 * Runs a script to return it's value
 * @param logic The script to run
 */
function run(logic: string): number {
  return evaluate(parser.parse(logic).topNode);
}

type LogicResult =
  | number
  | boolean
  | IWeight
  | (IWeight | IPercentage | number | undefined)[]
  | IPercentage;

/**
 * A new simplified evaluator that gets the result of a logic script
 * @param expr The logic script to evaluate
 */
function evaluate(expr: SyntaxNode): LogicResult {
  if (
    expr.type.name === NodeName.Program ||
    expr.type.name === NodeName.BlockExpression
  ) {
    let result: LogicResult = 0;
    for (const child of getChildren(expr)) {
      if (!child.type.isSkipped) {
        result = evaluate(child);
      }
    }
    return result;
  } else if (expr.type.name === NodeName.BinaryExpression) {
    const [left, operator, right] = getChildren(expr);
    const evalLeft = evaluate(left);
    const evalRight = evaluate(right);
    const op = this.getValue(operator);
    if (typeof evalLeft === "boolean" || typeof evalRight === "boolean") {
      if (op === "&&") {
        return evalLeft && evalRight;
      } else if (op === "||") {
        return evalLeft || evalRight;
      } else {
        this.error(`Unknown operator ${op}`, operator);
      }
    } else {
      if (op === ">") {
        return comparing(evalLeft, evalRight, op);
      } else if (op === "<") {
        return comparing(evalLeft, evalRight, op);
      } else if (op === ">=") {
        return comparing(evalLeft, evalRight, op);
      } else if (op === "<=") {
        return comparing(evalLeft, evalRight, op);
      } else if (op === "==") {
        return comparing(evalLeft, evalRight, op);
      } else if (op === "!=") {
        return comparing(evalLeft, evalRight, op);
      } else {
        if (Array.isArray(evalLeft) || Array.isArray(evalRight)) {
          this.error(`You cannot apply ${op} to arrays`, operator);
        }
        if (op === "+") {
          return this.add(evalLeft, evalRight);
        } else if (op === "-") {
          return this.subtract(evalLeft, evalRight);
        } else if (op === "*") {
          return this.multiply(evalLeft, evalRight);
        } else if (op === "/") {
          return this.divide(evalLeft, evalRight);
        } else if (op === "%") {
          return this.modulo(evalLeft, evalRight);
        } else {
          this.error(
            `Unknown operator ${op} between ${evalLeft} and ${evalRight}`,
            operator,
          );
        }
      }
    }
  } else if (expr.type.name === NodeName.NumberExpression) {
    const numberNode = expr.getChild(NodeName.Number);
    if (numberNode == null) {
      assert(NodeName.NumberExpression);
    }
    const value = parseFloat(this.getValue(numberNode));
    const plusNode = expr.getChild(NodeName.Plus);
    const sign = plusNode ? this.getValue(plusNode) : undefined;
    return sign === "-" ? -value : value;
  } else if (expr.type.name === NodeName.Percentage) {
    const value = MathUtils_roundFloat(parseFloat(this.getValue(expr)), 2);
    return Weight_buildPct(value);
  } else if (expr.type.name === NodeName.Ternary) {
    const [condition, then, or] = getChildren(expr);
    return evaluate(condition) ? evaluate(then) : evaluate(or);
  } else if (expr.type.name === NodeName.ForExpression) {
    const variableNode = expr.getChild(NodeName.Variable);
    const forInExpression = expr.getChild(NodeName.ForInExpression);
    const blockNode = expr.getChild(NodeName.BlockExpression);
    if (variableNode == null) {
      assert(NodeName.ForExpression);
    }
    if (forInExpression == null) {
      assert(NodeName.ForInExpression);
    }
    if (blockNode == null) {
      assert(NodeName.BlockExpression);
    }
    const forIn = evaluate(forInExpression);
    if (!Array.isArray(forIn)) {
      this.error(`for in expression should return an array`, forInExpression);
    }
    const varKey = this.getValue(variableNode).replace("var.", "");
    for (let i = 1; i <= forIn.length; i += 1) {
      this.vars[varKey] = i;
      evaluate(blockNode);
    }
    return forIn.length;
  } else if (expr.type.name === NodeName.IfExpression) {
    const parenthesisNodes = expr.getChildren(NodeName.ParenthesisExpression);
    const blockNodes = expr.getChildren(NodeName.BlockExpression);
    while (parenthesisNodes.length > 0) {
      const parenthesisNode = parenthesisNodes.shift()!;
      const blockNode = blockNodes.shift()!;
      const condition = evaluate(parenthesisNode);
      if (condition) {
        return evaluate(blockNode);
      }
    }
    const lastBlock = blockNodes.shift();
    if (lastBlock != null) {
      return evaluate(lastBlock);
    } else {
      return 0;
    }
  } else if (expr.type.name === NodeName.ParenthesisExpression) {
    const [node] = getChildren(expr);
    if (node == null) {
      assert(NodeName.ParenthesisExpression);
    }
    return evaluate(node);
  } else if (expr.type.name === NodeName.StateVariableIndex) {
    const [expression] = getChildren(expr);
    return evaluate(expression);
  } else if (expr.type.name === NodeName.AssignmentExpression) {
    const [variableNode, expression] = getChildren(expr);
    if (
      variableNode == null ||
      (variableNode.type.name !== NodeName.StateVariable &&
        variableNode.type.name !== NodeName.VariableExpression &&
        variableNode.type.name !== NodeName.Variable) ||
      expression == null
    ) {
      assert(NodeName.AssignmentExpression);
    }
    if (variableNode.type.name === NodeName.VariableExpression) {
      const nameNode = variableNode.getChild(NodeName.Keyword);
      if (nameNode == null) {
        this.error(`Missing variable name`, variableNode);
      }
      const indexExprs = variableNode.getChildren(NodeName.VariableIndex);
      const variable = this.getValue(nameNode);
      if (variable === "rm1") {
        if (indexExprs.length > 0) {
          this.error(`rm1 is not an array`, expr);
        }
        const evaluatedValue = evaluate(expression);
        let value = Array.isArray(evaluatedValue)
          ? evaluatedValue[0]
          : evaluatedValue;
        value = value ?? 0;
        value = value === true ? 1 : value === false ? 0 : value;
        value = Weight_convertToWeight(this.bindings.rm1, value, this.unit);
        this.bindings.rm1 = value;
        return value;
      } else if (
        this.mode === "planner" &&
        (variable === "reps" ||
          variable === "weights" ||
          variable === "RPE" ||
          variable === "minReps" ||
          variable === "timers" ||
          variable === "logrpes" ||
          variable === "amraps" ||
          variable === "askweights" ||
          variable === "setVariationIndex" ||
          variable === "descriptionIndex" ||
          variable === "numberOfSets")
      ) {
        return this.recordVariableUpdate(variable, expression, indexExprs, "=");
      } else if (this.mode === "update" && variable === "numberOfSets") {
        return this.changeNumberOfSets(expression, "=");
      } else if (
        this.mode === "update" &&
        (variable === "reps" ||
          variable === "weights" ||
          variable === "RPE" ||
          variable === "amraps" ||
          variable === "logrpes" ||
          variable === "askweights" ||
          variable === "minReps" ||
          variable === "timers")
      ) {
        return this.changeBinding(variable, expression, indexExprs, "=");
      } else {
        this.error(`Unknown variable '${variable}'`, variableNode);
      }
    } else if (variableNode.type.name === NodeName.Variable) {
      const varKey = this.getValue(variableNode).replace("var.", "");
      const value = evaluate(expression);
      if (
        Weight_is(value) ||
        Weight_isPct(value) ||
        typeof value === "number"
      ) {
        this.vars[varKey] = value;
      } else {
        this.vars[varKey] = value ? 1 : 0;
      }
      return this.vars[varKey];
    } else {
      const indexNode = variableNode.getChild(NodeName.StateVariableIndex);
      const stateKeyNode = variableNode.getChild(NodeName.Keyword);
      if (stateKeyNode != null) {
        const stateKey = this.getValue(stateKeyNode);
        let state: IProgramState | undefined;
        if (indexNode == null) {
          if (stateKey in this.state) {
            state = this.state;
          } else {
            this.error(`There's no state variable '${stateKey}'`, variableNode);
          }
        } else {
          const indexEval = evaluate(indexNode);
          const index = this.toNumber(indexEval);
          state = this.otherStates[index];
        }
        const value = evaluate(expression);
        if (state != null) {
          if (
            Weight_is(value) ||
            Weight_isPct(value) ||
            typeof value === "number"
          ) {
            state[stateKey] = value;
          } else {
            state[stateKey] = value ? 1 : 0;
          }
        }
        return value;
      } else {
        return 0;
      }
    }
  } else if (expr.type.name === NodeName.IncAssignmentExpression) {
    const [stateVar, incAssignmentExpr, expression] = getChildren(expr);
    if (
      stateVar == null ||
      (stateVar.type.name !== NodeName.StateVariable &&
        stateVar.type.name !== NodeName.VariableExpression &&
        stateVar.type.name !== NodeName.Variable) ||
      expression == null ||
      incAssignmentExpr == null
    ) {
      assert(NodeName.IncAssignmentExpression);
    }
    if (stateVar.type.name === NodeName.VariableExpression) {
      const nameNode = stateVar.getChild(NodeName.Keyword);
      if (nameNode == null) {
        this.error(`Missing variable name`, stateVar);
      }
      const indexExprs = stateVar.getChildren(NodeName.VariableIndex);
      const variable = this.getValue(nameNode);
      if (variable === "rm1") {
        if (indexExprs.length > 0) {
          this.error(`rm1 is not an array`, expr);
        }
        const evaluatedValue = evaluate(expression);
        let value = Array.isArray(evaluatedValue)
          ? evaluatedValue[0]
          : evaluatedValue;
        value = value ?? 0;
        value = value === true ? 1 : value === false ? 0 : value;

        const op = this.getValue(incAssignmentExpr);
        if (op === "+=") {
          this.bindings.rm1 = Weight_convertToWeight(
            this.bindings.rm1,
            this.add(this.bindings.rm1, value),
            this.unit,
          );
        } else if (op === "-=") {
          this.bindings.rm1 = Weight_convertToWeight(
            this.bindings.rm1,
            this.subtract(this.bindings.rm1, value),
            this.unit,
          );
        } else if (op === "*=") {
          this.bindings.rm1 = Weight_convertToWeight(
            this.bindings.rm1,
            this.multiply(this.bindings.rm1, value),
            this.unit,
          );
        } else if (op === "/=") {
          this.bindings.rm1 = Weight_convertToWeight(
            this.bindings.rm1,
            this.divide(this.bindings.rm1, value),
            this.unit,
          );
        } else {
          this.error(
            `Unknown operator ${op} after ${variable}`,
            incAssignmentExpr,
          );
        }
        return this.bindings.rm1;
      } else if (
        this.mode === "planner" &&
        (variable === "reps" ||
          variable === "weights" ||
          variable === "RPE" ||
          variable === "minReps" ||
          variable === "timers" ||
          variable === "setVariationIndex" ||
          variable === "descriptionIndex" ||
          variable === "numberOfSets")
      ) {
        const op = this.getValue(incAssignmentExpr);
        if (
          op !== "=" &&
          op !== "+=" &&
          op !== "-=" &&
          op !== "*=" &&
          op !== "/="
        ) {
          this.error(
            `Unknown operator ${op} after ${variable}`,
            incAssignmentExpr,
          );
        }
        return this.recordVariableUpdate(variable, expression, indexExprs, op);
      } else if (this.mode === "update" && variable === "numberOfSets") {
        const op = this.getValue(incAssignmentExpr);
        if (
          op !== "=" &&
          op !== "+=" &&
          op !== "-=" &&
          op !== "*=" &&
          op !== "/="
        ) {
          this.error(
            `Unknown operator ${op} after ${variable}`,
            incAssignmentExpr,
          );
        }
        return this.changeNumberOfSets(expression, op);
      } else if (
        this.mode === "update" &&
        (variable === "reps" ||
          variable === "weights" ||
          variable === "RPE" ||
          variable === "minReps" ||
          variable === "timers")
      ) {
        const op = this.getValue(incAssignmentExpr);
        if (
          op !== "=" &&
          op !== "+=" &&
          op !== "-=" &&
          op !== "*=" &&
          op !== "/="
        ) {
          this.error(
            `Unknown operator ${op} after ${variable}`,
            incAssignmentExpr,
          );
        }
        return this.changeBinding(variable, expression, indexExprs, op);
      } else {
        this.error(`Unknown variable '${variable}'`, stateVar);
      }
    } else if (stateVar.type.name === NodeName.Variable) {
      const varKey = this.getValue(stateVar).replace("var.", "");
      let value = evaluate(expression);
      if (
        !(Weight_is(value) || Weight_isPct(value) || typeof value === "number")
      ) {
        value = value ? 1 : 0;
      }
      const op = this.getValue(incAssignmentExpr);
      if (
        op !== "=" &&
        op !== "+=" &&
        op !== "-=" &&
        op !== "*=" &&
        op !== "/="
      ) {
        this.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
      }
      const currentValue = this.vars[varKey];
      if (op === "+=") {
        this.vars[varKey] = this.add(currentValue, value);
      } else if (op === "-=") {
        this.vars[varKey] = this.subtract(currentValue, value);
      } else if (op === "*=") {
        this.vars[varKey] = this.multiply(currentValue, value);
      } else if (op === "/=") {
        this.vars[varKey] = this.divide(currentValue, value);
      } else {
        this.error(`Unknown operator ${op} after ${varKey}`, incAssignmentExpr);
      }
      return this.vars[varKey];
    } else {
      const indexNode = stateVar.getChild(NodeName.StateVariableIndex);
      const stateKeyNode = stateVar.getChild(NodeName.Keyword);
      if (stateKeyNode != null) {
        const stateKey = this.getValue(stateKeyNode);
        let state: IProgramState | undefined;
        if (indexNode == null) {
          if (stateKey in this.state) {
            state = this.state;
          } else {
            this.error(`There's no state variable '${stateKey}'`, stateVar);
          }
        } else {
          const indexEval = evaluate(indexNode);
          const index = this.toNumber(indexEval);
          state = this.otherStates[index];
        }

        let value = evaluate(expression);
        if (state != null) {
          if (
            !(
              Weight_is(value) ||
              Weight_isPct(value) ||
              typeof value === "number"
            )
          ) {
            value = value ? 1 : 0;
          }
          const op = this.getValue(incAssignmentExpr);
          const currentValue = state[stateKey] ?? 0;
          if (op === "+=") {
            state[stateKey] = this.add(currentValue, value);
          } else if (op === "-=") {
            state[stateKey] = this.subtract(currentValue, value);
          } else if (op === "*=") {
            state[stateKey] = this.multiply(currentValue, value);
          } else if (op === "/=") {
            state[stateKey] = this.divide(currentValue, value);
          } else {
            this.error(
              `Unknown operator ${op} after state.${stateKey}`,
              incAssignmentExpr,
            );
          }
          return state[stateKey];
        } else {
          return value;
        }
      } else {
        return 0;
      }
    }
  } else if (expr.type.name === NodeName.BuiltinFunctionExpression) {
    const fns = this.fns;
    const [keyword, ...args] = getChildren(expr);
    if (keyword == null || keyword.type.name !== NodeName.Keyword) {
      assert(NodeName.BuiltinFunctionExpression);
    }
    const name = this.getValue(keyword) as keyof typeof fns;
    if (name != null && this.fns[name] != null) {
      const argValues = args.map((a) => evaluate(a));
      const fn = this.fns[name];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as any).apply(undefined, [
        ...argValues,
        this.fnContext,
        this.bindings,
      ]);
    } else {
      this.error(`Unknown function '${name}'`, keyword);
    }
  } else if (expr.type.name === NodeName.UnaryExpression) {
    const [, expression] = getChildren(expr);
    if (expression == null) {
      assert(NodeName.UnaryExpression);
    }
    const evaluated = evaluate(expression);
    return !evaluated;
  } else if (expr.type.name === NodeName.WeightExpression) {
    return this.getWeight(expr) ?? Weight_build(0, this.unit);
  } else if (expr.type.name === NodeName.VariableExpression) {
    const [nameNode, ...indexExprs] = getChildren(expr);
    if (nameNode == null) {
      assert(NodeName.VariableExpression);
    }
    const name = this.getValue(nameNode) as keyof IScriptBindings;
    if (indexExprs.some((e) => e.type.name !== NodeName.VariableIndex)) {
      assert(NodeName.VariableIndex);
    }
    if (indexExprs.length === 0) {
      let value = this.bindings[name];
      if (Array.isArray(value) && name === "minReps") {
        value = value.map((v, i) => (v as number) ?? this.bindings.reps[i]);
      }
      return value;
    } else if (indexExprs.length === 1) {
      const indexExpr = indexExprs[0];
      const indexNode = getChildren(indexExpr)[0];
      if (
        indexNode.type.name === NodeName.Wildcard ||
        indexNode.type.name === NodeName.Current
      ) {
        this.error(
          `Can't use '*' or '_' as an index when reading from variables`,
          indexNode,
        );
      }
      const indexEval = evaluate(indexNode);
      let index: number;
      if (Weight_is(indexEval) || Weight_isPct(indexEval)) {
        index = indexEval.value;
      } else if (typeof indexEval === "number") {
        index = indexEval;
      } else {
        index = indexEval ? 1 : 0;
      }
      index -= 1;
      const binding = this.bindings[name];
      if (!Array.isArray(binding)) {
        this.error(`Variable ${name} should be an array`, nameNode);
      }
      if (index >= binding.length) {
        this.error(
          `Out of bounds index ${index + 1} for array ${name}`,
          nameNode,
        );
      }
      let value = binding[index];
      if (value == null) {
        value = name === "minReps" ? (this.bindings.reps[index] ?? 0) : 0;
      }
      return value;
    } else {
      this.error(
        `Can't use [1:1] syntax when reading from the ${name} variable`,
        expr,
      );
    }
  } else if (expr.type.name === NodeName.StateVariable) {
    const stateKey = this.getStateKey(expr);
    if (stateKey == null) {
      this.error(
        `You cannot read from other exercises states, you can only write to them`,
        expr,
      );
    }
    if (stateKey in this.state) {
      return this.state[stateKey];
    } else {
      this.error(`There's no state variable '${stateKey}'`, expr);
    }
  } else if (expr.type.name === NodeName.Variable) {
    const varKey = this.getValue(expr).replace("var.", "");
    if (varKey in this.vars) {
      return this.vars[varKey];
    } else {
      this.error(`There's no variable '${varKey}'`, expr);
    }
  } else if (expr.type.name === NodeName.ForInExpression) {
    const child = getChildren(expr)[0];
    return evaluate(child);
  } else {
    this.error(`Unknown node type ${expr.node.type.name}`, expr);
  }
}

/**
 * @yields all children of a syntax node, regardless of their type
 * @param node The node to get the children of
 */
function* getChildren(node: SyntaxNode): Generator<SyntaxNode> {
  const cur = node.cursor();
  do {
    yield cur.node;
  } while (cur.nextSibling());
}
