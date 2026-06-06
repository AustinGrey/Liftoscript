import { z } from "zod";

export type IEither<T, U> =
  | { success: true; data: T }
  | { success: false; error: U };
export type IArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType[number];
export type INonNullObject<T> = {
  [K in keyof T as T[K] extends null ? never : K]: T[K];
};
/**
 * Record is normally closed. If you say something is a Record<string, number> what you are saying
 * is that there is a value for every possible string. Which can't be true.
 *
 * An open record is shorthand that not all keys will have values.
 *
 * The key is defined second since it's almost always just a string, and we want to allow leaving it out for code simplicity.
 */
export type OpenRecord<
  TVal,
  TKey extends string | number | symbol = string,
> = Partial<Record<TKey, TVal>>;

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}
/**
 * @deprecated This should not be a typeguard, instead this should accept a number so that others can typeguard to number first. Otherwise it's use as a typeguard could cause missing cases in switches etc.
 */
export function isRealNumber(value: unknown): value is number {
  return (
    typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value)
  );
}
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Typeguard any Zod schema
 * @param schema The schema to check against
 * @param value The value to check
 */
export function is<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): value is z.infer<TSchema> {
  return schema.safeParse(value).success;
}

export function isOneOf<TTarget, const TGuard extends TTarget>(
  text: TTarget,
  ...options: TGuard[]
): text is TGuard {
  return options.includes(text as TGuard);
}

const f: string = "";

if (!isOneOf(f, "a", "b", "c")) {
} else {
  const b = f;
}
