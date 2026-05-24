import { isEqual } from "es-toolkit";

/**
 * Gets the well-typed keys of an object.
 * @param obj the object to get the keys of
 */
export const ObjectUtils_keys = <T extends {}>(obj: T) =>
  Object.keys(obj) as Array<keyof T>;

/**
 * @deprecated Use {@link Object.values} instead
 * @param obj the object to get the values of
 */
export const ObjectUtils_values = <T extends {}>(obj: T): Array<T[keyof T]> =>
  Object.values(obj);

/**
 * Get the entries of an object with well typed keys
 * @param obj
 * @constructor
 */
export const ObjectUtils_entries = <T extends {}>(obj: T) =>
  Object.entries(obj) as Array<[keyof T, T[keyof T]]>;

/**
 * @returns true if the two objects are equal, however it also will warn at compile time if B's type is not assignable to A -> which would likely make the return always false.
 * @param a 1st object to compare
 * @param b 2nd object to compare
 */
export const ObjectUtils_isEqual = <A, B extends A>(a: A, b: B) =>
  isEqual(a, b);

/**
 * @deprecated Use {@link omitBy}
 */
export function ObjectUtils_diff<T extends Record<string, unknown>>(
  older: T,
  newer: T,
): T {
  const result: Partial<T> = {};
  for (const [key, value] of ObjectUtils_entries(changedKeys(older, newer))) {
    if (value === "add" || value === "update") {
      result[key] = newer[key];
    }
  }
  return result as T;
}

/**
 * @deprecated Use {@link omitBy}
 */
function changedKeys<T extends {}>(
  older: T,
  newer: T,
): Partial<Record<keyof T, "delete" | "update" | "add">> {
  const keys = ObjectUtils_combinedKeys(older, newer);
  const changes: Partial<Record<keyof T, "delete" | "update" | "add">> = {};

  for (const key of keys) {
    if (older[key] == null && newer[key] != null) {
      changes[key] = "add";
    } else if (older[key] != null && newer[key] == null) {
      changes[key] = "delete";
    } else if (older[key] != null && newer[key] != null) {
      if (older[key] !== newer[key]) {
        changes[key] = "update";
      }
    }
  }
  return changes;
}

export function ObjectUtils_filter<T extends {}>(
  obj: T,
  cb: (key: keyof T, value: T[keyof T]) => boolean,
): Partial<T> {
  const filteredKeys = ObjectUtils_keys(obj).filter((key) => {
    const value = obj[key];
    return cb(key, value);
  });
  return filteredKeys.reduce<Partial<T>>((memo, k) => {
    memo[k] = obj[k];
    return memo;
  }, {});
}

export function ObjectUtils_pick<
  T extends {},
  K extends keyof T,
  U extends Pick<T, K>,
>(obj: T, theKeys: K[]): U {
  return ObjectUtils_keys(obj).reduce<U>((memo, key: any) => {
    if (theKeys.indexOf(key) !== -1) {
      (memo as any)[key] = (obj as any)[key];
    }
    return memo;
  }, {} as any);
}

export function ObjectUtils_combinedKeys<
  T extends Record<string, unknown>,
  U extends Record<string, unknown>,
>(obj1: T, obj2: U): Array<keyof T | keyof U> {
  const s1 = new Set(ObjectUtils_keys(obj1));
  const s2 = new Set(ObjectUtils_keys(obj2));
  return Array.from(s1.union(s2));
}

export function ObjectUtils_findMaxValue<
  T extends Record<string, number | undefined>,
>(obj: T): number {
  return ObjectUtils_keys(obj).reduce<number>((memo, key) => {
    const v = obj[key];
    if (v != null && v > memo) {
      memo = v || 0;
    }
    return memo;
  }, 0);
}

/**
 * @deprecated Use {@link structuredClone} instead
 * @param obj The object to clone
 */
export function ObjectUtils_clone<T>(obj: T): T {
  return structuredClone(obj);
}
