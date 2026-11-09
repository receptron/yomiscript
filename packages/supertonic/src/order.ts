/** the order of Array.prototype.sort() without a comparator (UTF-16 code units), stated: the rule against a bare sort()
 * proposes localeCompare, which orders differently and would change the lists and data/ambiguous.json */
export const byCodeUnit = (x: string, y: string): number => Number(x > y) - Number(x < y);
