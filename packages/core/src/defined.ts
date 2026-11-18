// With noUncheckedIndexedAccess an indexed read is typed T | undefined. Where the code knows the index is in range
// (an array's own length, a table indexed by a value it holds), this says so, and a broken invariant fails here with
// what was being read instead of turning into undefined further on.
/** the value, or an error naming what was missing */
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} is missing`);
  return value;
}
