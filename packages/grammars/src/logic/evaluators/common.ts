import type { LogicResultSingular } from "@/logic/types.ts";
import {
  type IDynamicWeight,
  type IWeight,
  TDynamicWeight,
  TWeight,
} from "@/models/weight.ts";
import { is, isBoolean, isNumber } from "@/utils/types.ts";

// type TransformHandlers<T> = (T extends number
//   ? { number: (val: number) => any }
//   : {}) &
//   (T extends IWeight ? { weight: (val: IWeight) => any } : {}) &
//   (T extends IDynamicWeight
//     ? { dynamicWeight: (val: IDynamicWeight) => any }
//     : {}) &
//   (T extends boolean ? { boolean: (val: boolean) => any } : {}) &
//   (T extends undefined ? { undefined: (val: undefined) => any } : {});
//
// type TransformedLogicResult<
//   TVal extends number | boolean | undefined,
//   TTransforms extends TransformHandlers<TVal>,
// > = TVal extends number
//   ? TTransforms["number"]
//   : TVal extends boolean
//     ? TTransforms["boolean"]
//     : never;
//
// const foo = 0 as boolean | number;
//
// function t<
//   T extends number | boolean | undefined,
//   H extends TransformHandlers<T>,
// >(v: T, handlers: H): TransformedLogicResult<T, H>;
//
// const b = t(foo, {
//   number: (x) => x,
//   boolean: (x) => x,
// });

// /**
//  * This type helper ensures you have specified a transformation for every possible type that the value could be.
//  * Also maintains the type
//  * @param val The value to transform
//  * @param handlers The set of mappers for each potential type of value
//  * @param defaultValue The default result if an unexpected value is passed, which no handler maps on, or handler was missed but needed.
//  *    Defensive programming: This can happen if the types aren't set up water tight and an unexpected type of value is given to the function
//  */
// export function transformLogicResult<
//   T extends LogicResult,
//   TDefault,
//   // Null here is used as a sigil for "handler not passed in" so we can exclude return types of handlers that aren't needed later
//   TResultIfNumber = null,
//   TResultIfWeight = null,
//   TResultIfDynamicWeight = null,
//   TResultIfBoolean = null,
//   TResultIfUndefined = null,
// >(
//   val: T,
//   handlers: (T extends number
//     ? { number: (val: number) => TResultIfNumber }
//     : {}) &
//     (T extends IWeight ? { weight: (val: IWeight) => TResultIfWeight } : {}) &
//     (T extends IDynamicWeight
//       ? { dynamicWeight: (val: IDynamicWeight) => TResultIfDynamicWeight }
//       : {}) &
//     (T extends boolean ? { boolean: (val: boolean) => TResultIfBoolean } : {}) &
//     (T extends undefined
//       ? { undefined: (val: undefined) => TResultIfUndefined }
//       : {}),
//   defaultValue: TDefault,
// ): Exclude<
//   | TResultIfNumber
//   | TResultIfWeight
//   | TResultIfDynamicWeight
//   | TResultIfBoolean
//   | TResultIfUndefined
//   | TDefault,
//   // Since null is never a LogicResult, null is therefore only a type when the handler hasn't been passed in
//   // and a handler won't be passed in only if the value would never be that type, so null should never be in the output.
//   null
// > {
//   // TS can't confirm this complex result, so we have to manually type every return carefully
//   type ExpectedReturn = Exclude<
//     | TResultIfNumber
//     | TResultIfWeight
//     | TResultIfDynamicWeight
//     | TResultIfBoolean
//     | TResultIfUndefined
//     | TDefault,
//     null
//   >;
//   if (isNumber(val) && "number" in handlers) {
//     return handlers.number(val) as ExpectedReturn;
//   }
//   if (is(TWeight, val) && "weight" in handlers) {
//     return handlers.weight(val) as ExpectedReturn;
//   }
//   if (is(TDynamicWeight, val) && "dynamicWeight" in handlers) {
//     return handlers.dynamicWeight(val) as ExpectedReturn;
//   }
//   if (isBoolean(val) && "boolean" in handlers) {
//     return handlers.boolean(val) as ExpectedReturn;
//   }
//   if (val === undefined && "undefined" in handlers) {
//     return handlers.undefined(val) as ExpectedReturn;
//   }
//   return defaultValue as ExpectedReturn;
// }
//
// const foo = 0 as number | boolean;
//
// const bar = transformLogicResult(
//   foo,
//   {
//     number: (x) => true,
//     boolean: (x) => false,
//   },
//   false,
// );

type Kind = "number" | "boolean" | "undefined" | "weight" | "dynamicWeight";

type NeededKinds<T> =
  | (T extends number ? "number" : never)
  | (T extends boolean ? "boolean" : never)
  | (T extends undefined ? "undefined" : never)
  | (T extends IWeight ? "weight" : never)
  | (T extends IDynamicWeight ? "dynamicWeight" : never);

type ArgFor<K extends Kind> = K extends "number"
  ? number
  : K extends "boolean"
    ? boolean
    : K extends "weight"
      ? IWeight
      : K extends "dynamicWeight"
        ? IDynamicWeight
        : undefined;

type HandlerMapFor<T> =
  // Required handlers for the kinds present in T
  { [K in NeededKinds<T>]: (value: ArgFor<K>) => unknown };
// &
// // Optional handlers for the other kinds (allowed, never required)
// Partial<Record<Exclude<Kind, NeededKinds<T>>, (value: any) => unknown>>;

type MatchResult<T, H extends HandlerMapFor<T>> = {
  [K in NeededKinds<T>]: ReturnType<H[K]>;
}[NeededKinds<T>];

export function transformLogicResult<
  T extends LogicResultSingular,
  H extends HandlerMapFor<T>,
>(value: T, handlers: H): MatchResult<T, H> {
  type Ret = MatchResult<T, H>;
  if (isNumber(value) && "number" in handlers) {
    return (handlers.number as (x: number) => unknown)(value) as Ret;
  }
  if (isBoolean(value) && "boolean" in handlers) {
    return (handlers.boolean as (x: boolean) => unknown)(value) as Ret;
  }
  if (is(TWeight, value) && "weight" in handlers) {
    return (handlers.weight as (x: IWeight) => unknown)(value) as Ret;
  }
  if (is(TDynamicWeight, value) && "dynamicWeight" in handlers) {
    return (handlers.dynamicWeight as (x: IDynamicWeight) => unknown)(
      value,
    ) as Ret;
  }
  if (value === undefined && "undefined" in handlers) {
    return (handlers.undefined as (x: undefined) => unknown)(value) as Ret;
  }
  throw new Error(
    `Value ${value} of type ${typeof value} could not be handled`,
  );
}
