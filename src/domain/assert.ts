/** Exhaustiveness check: only compiles when every case of a union has been handled. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
