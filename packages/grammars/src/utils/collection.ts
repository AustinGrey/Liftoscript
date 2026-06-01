export function CollectionUtils_concatBy<T>(
  from: T[],
  to: T[],
  condition: (el: T) => string,
): T[] {
  const map = [...from, ...to].reduce<Record<string, T>>((memo, item) => {
    memo[condition(item)] = item;
    return memo;
  }, {});
  return Object.keys(map).map((key) => map[key]);
}

export function CollectionUtils_compact<T>(arr: (T | undefined)[]): T[] {
  return arr.filter((i) => i) as T[];
}

export function CollectionUtils_flat<T>(from: T[][]): T[] {
  return from.reduce((acc, val) => acc.concat(val), []);
}

export function CollectionUtils_sortBy<T extends {}, K extends keyof T>(
  arr: T[],
  key: K,
  isReverse?: boolean,
): T[K] extends number ? T[] : never {
  const arrCopy = [...arr];
  arrCopy.sort((a, b) => {
    const aVal = a[key] as any;

    const bVal = b[key] as any;
    return isReverse ? bVal - aVal : aVal - bVal;
  });

  return arrCopy as any;
}

export function CollectionUtils_compressArray(
  arr: number[],
  threshold: number,
): string[] {
  const result: string[] = [];
  let count = 1;

  for (let i = 1; i <= arr.length; i++) {
    if (arr[i] === arr[i - 1]) {
      count += 1;
    } else {
      if (count >= threshold) {
        result.push(`${count}x${arr[i - 1]}`);
      } else {
        while (count > 0) {
          result.push(`${arr[i - 1]}`);
          count -= 1;
        }
      }
      count = 1;
    }
  }

  return result;
}
