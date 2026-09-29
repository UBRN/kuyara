/**
 * The distinct values in the order of their rank; a value with no rank goes last. The one
 * sorter behind every ordered reason, failure and slot list, so a code list reads the same
 * wherever it is rebuilt.
 */
export function uniqueInRankOrder<Value>(
  values: Iterable<Value>,
  rank: ReadonlyMap<Value, number>,
): readonly Value[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (rank.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}
