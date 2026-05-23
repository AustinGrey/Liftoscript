/* eslint-disable @typescript-eslint/no-explicit-any */

import { CollectionUtils_remove } from "./collection";

export function ObjectUtils_keys<T extends {}>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

export function ObjectUtils_values<T extends {}>(obj: T): Array<T[keyof T]> {
  if ("values" in Object) {
    return Object.values(obj);
  } else {
    return ObjectUtils_keys(obj).map((key) => obj[key]);
  }
}

export function ObjectUtils_entries<T extends {}>(
  obj: T,
): Array<[keyof T, T[keyof T]]> {
  return ObjectUtils_keys(obj).map((key) => [key, obj[key]]);
}

export function ObjectUtils_isEqual<T extends Record<string, any>>(
  obj1: T,
  obj2: T,
): boolean {
  // Create a stack for comparing objects
  const stack: Array<[any, any]> = [[obj1, obj2]];

  while (stack.length > 0) {
    // Pop a pair of items from the stack
    const [currentObj1, currentObj2] = stack.pop()!;
    if (currentObj1 === currentObj2) {
      continue;
    }

    // Check if both are objects
    if (
      typeof currentObj1 !== "object" ||
      typeof currentObj2 !== "object" ||
      currentObj1 == null ||
      currentObj2 == null
    ) {
      if (currentObj1 !== currentObj2) {
        return false;
      }
      continue;
    }

    // Get keys of both objects
    const keys1 = Object.keys(currentObj1);
    const keys2 = Object.keys(currentObj2);

    // Iterate over keys and add nested objects to the stack
    for (const key of new Set([...keys1, ...keys2])) {
      stack.push([currentObj1[key], currentObj2[key]]);
    }
  }

  // If all checks pass, the objects are equal
  return true;
}

export function ObjectUtils_diff<T extends Record<string, any>>(
  oldObj: T,
  newObj: T,
): T {
  const chKeys = ObjectUtils_changedKeys(oldObj, newObj);
  const result: Partial<T> = {};
  for (const key of ObjectUtils_keys(chKeys)) {
    const value = chKeys[key];
    if (value === "add" || value === "update") {
      result[key] = newObj[key];
    }
  }
  return result as any;
}

export function ObjectUtils_changedKeys<T extends {}>(
  oldObj: T,
  newObj: T,
  eq: (a: any, b: any) => boolean = (a, b) => a === b,
): Partial<Record<keyof T, "delete" | "update" | "add">> {
  let oldKeys = ObjectUtils_keys(oldObj);
  const newKeys = ObjectUtils_keys(newObj);
  const changes: Partial<Record<keyof T, "delete" | "update" | "add">> = {};

  for (const newKey of newKeys) {
    if (newObj[newKey] != null && oldObj[newKey] == null) {
      changes[newKey] = "add";
    } else if (newObj[newKey] == null && oldObj[newKey] != null) {
      changes[newKey] = "delete";
    } else if (newObj[newKey] != null && oldObj[newKey] != null) {
      if (!eq(newObj[newKey], oldObj[newKey])) {
        changes[newKey] = "update";
      }
    }
    oldKeys = CollectionUtils_remove(oldKeys, newKey);
  }
  for (const oldKey of oldKeys) {
    if (oldObj[oldKey] != null && newObj[oldKey] == null) {
      changes[oldKey] = "delete";
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
  return Array.from(
    new Set(ObjectUtils_keys(obj1).concat(ObjectUtils_keys(obj2) as any)),
  );
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

export function ObjectUtils_clone<T>(obj: T): T {
  if (obj == null) {
    return obj;
  }
  if (typeof window !== "undefined" && window.structuredClone) {
    return window.structuredClone(obj);
  } else {
    return JSON.parse(JSON.stringify(obj));
  }
}
