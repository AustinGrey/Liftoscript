import { z } from "zod";

export type IEither<T, U> =
  | { success: true; data: T }
  | { success: false; error: U };
export type IArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType[number];
export type IDeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? IDeepPartial<T[P]> : T[P];
};
export type IRect = { x: number; y: number; width: number; height: number };
export type INonNullObject<T> = {
  [K in keyof T as T[K] extends null ? never : K]: T[K];
};

export function c<T>(value: unknown): T {
  return value as T;
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number";
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
