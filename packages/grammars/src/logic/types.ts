import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { is, isNumber } from "@/utils/types.ts";

export type Quantity = number | IWeight | IDynamicWeight;

export function isQuantity(value: unknown): value is Quantity {
  return isNumber(value) || is(TWeight, value) || is(TDynamicWeight, value);
}

export type LogicResultSingular = Quantity | boolean | undefined;
export type LogicResult = LogicResultSingular | LogicResultSingular[];

export type IAssignmentOp = "+=" | "-=" | "*=" | "/=" | "=";

export interface ILiftoscriptVariableValue<T> {
  value: T;
  op: IAssignmentOp;
  target: ("*" | "_" | number)[];
}

export type ILiftoscriptEvaluatorUpdate =
  | { type: "setVariationIndex"; value: ILiftoscriptVariableValue<number> }
  | { type: "descriptionIndex"; value: ILiftoscriptVariableValue<number> }
  | { type: "reps"; value: ILiftoscriptVariableValue<number> }
  | { type: "minReps"; value: ILiftoscriptVariableValue<number> }
  | {
      type: "weights";
      value: ILiftoscriptVariableValue<number | IDynamicWeight | IWeight>;
    }
  | { type: "timers"; value: ILiftoscriptVariableValue<number> }
  | { type: "RPE"; value: ILiftoscriptVariableValue<number> }
  | { type: "logrpes"; value: ILiftoscriptVariableValue<number> }
  | { type: "amraps"; value: ILiftoscriptVariableValue<number> }
  | { type: "askweights"; value: ILiftoscriptVariableValue<number> }
  | { type: "numberOfSets"; value: ILiftoscriptVariableValue<number> };
