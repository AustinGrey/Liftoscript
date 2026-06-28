/*
Javacript is zero indexed (arrays start at 0), but many system we interface with are one indexed (arrays start at 1).

Mixing indexes is a significant source of bugs. This file provides utilities to convert between the two index types and keep
them distinct to avoid accidental mixing.
 */
import { z } from "zod";

export const zIndexFrom0 = z.number().brand<"0-indexed">();
export const zIndexFrom1 = z.number().brand<"1-indexed">();
export type IndexFrom0 = z.infer<typeof zIndexFrom0>;
export type IndexFrom1 = z.infer<typeof zIndexFrom1>;
export type ArrayFrom0<TElement> = Record<IndexFrom0, TElement>;
export type ArrayFrom1<TElement> = Record<IndexFrom1, TElement>;

/**
 * For convenience, a pre-defined zero index, so you don't need to cast all the time
 */
export const ZERO: IndexFrom0 = 0;

/**
 * Cast a number as a 0-based index.
 * Preserves potential null/undefined values for convenience.
 * Prefer using {@link as0} if possible for stronger type safety.
 *
 * @param indexFrom0 The 1-based index
 */
export function castAs0<TIndex extends number | undefined | null>(
  indexFrom0: TIndex,
): TIndex extends undefined | null ? TIndex : IndexFrom0 {
  return indexFrom0 as TIndex extends undefined | null ? TIndex : IndexFrom0;
}

/**
 * Cast a number as a 1-based index.
 * Preserves potential null/undefined values for convenience.
 * Prefer using {@link as1} if possible for stronger type safety.
 *
 * @param indexFrom1 The 0-based index
 */
export function castAs1<TIndex extends number | undefined | null>(
  indexFrom1: TIndex,
): TIndex extends undefined | null ? TIndex : IndexFrom1 {
  return indexFrom1 as TIndex extends undefined | null ? TIndex : IndexFrom1;
}

/**
 * Converts an index from 1->0 based.
 * Preserves potential null/undefined values for convenience.
 *
 * @param indexFrom1 The 1-based index
 * @param ifNaN The value to return if the index is NaN, if not provided NaN will be returned
 */
export function as0<TIndex extends IndexFrom1 | undefined | null>(
  indexFrom1: TIndex,
  ifNaN?: number,
): TIndex extends undefined | null ? TIndex : IndexFrom0 {
  type ReturnType = TIndex extends undefined | null ? TIndex : IndexFrom0;
  if (indexFrom1 === undefined || indexFrom1 === null)
    return indexFrom1 as ReturnType;
  if (isNaN(indexFrom1)) return (ifNaN ?? indexFrom1) as ReturnType;
  return (indexFrom1 - 1) as ReturnType;
}

/**
 * Converts an index from 0->1 based.
 * Preserves potential null/undefined values for convenience.
 * You can pass 0 without casting since it's the only number we can guarantee isn't 1 indexed already.
 *
 * @param indexFrom0 The 0-based index
 * @param ifNaN The value to return if the index is NaN, if not provided NaN will be returned
 */
export function as1<TIndex extends 0 | IndexFrom0 | undefined | null>(
  indexFrom0: TIndex,
  ifNaN?: number,
): TIndex extends undefined | null ? TIndex : IndexFrom1 {
  type ReturnType = TIndex extends undefined | null ? TIndex : IndexFrom1;
  if (indexFrom0 === undefined || indexFrom0 === null)
    return indexFrom0 as ReturnType;
  if (isNaN(indexFrom0)) return (ifNaN ?? indexFrom0) as ReturnType;
  return (indexFrom0 + 1) as ReturnType;
}

/**
 * A predicate that can be passed to a normal array map to get access to stronger typed indexes
 */
export function withIndex<TElement, TReturn>(
  mapper: (value: TElement, index: IndexFrom0) => TReturn,
): (value: TElement, index: number) => TReturn {
  return mapper as (value: TElement, index: number) => TReturn;
}

export function safeFindLastIndex<TElement, TDefault extends IndexFrom0>(
  arr: TElement[],
  where: (element: TElement) => boolean,
  defaults?: TDefault,
): TDefault extends IndexFrom0 ? IndexFrom0 : IndexFrom0 | undefined {
  const result = castAs0(arr.findLastIndex(where));
  return result !== -1
    ? result
    : defaults !== undefined
      ? defaults
      : (undefined as TDefault extends IndexFrom0
          ? IndexFrom0
          : IndexFrom0 | undefined);
}

/**
 * Gets the next index, while preserving the type information
 * @param idx The index to get the next index of
 */
export function next<TIndex extends IndexFrom0 | IndexFrom1>(
  idx: TIndex,
): TIndex {
  return (idx + 1) as TIndex;
}
