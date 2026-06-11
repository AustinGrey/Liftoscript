export const CollectionUtils_compact = <T>(arr: (T | undefined)[]): T[] =>
  arr.filter((i) => i !== undefined);

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
