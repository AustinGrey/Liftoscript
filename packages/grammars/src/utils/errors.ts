/**
 * Because you can't use "throw" in expressions, but you can use function calls,
 * this method throws an error for you so you don't have to use IIFEs to throw
 * in an expression.
 * @param error The error to throw
 */
export function throwError(error: Error): never {
  throw error;
}
