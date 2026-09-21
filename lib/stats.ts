/** Median of the non-null values in `values`, or null if none are present.
 * Used for industry/sector comparisons rather than a mean, since a single
 * extreme outlier (e.g. a blown-up DCF from an extreme growth-rate input)
 * can badly distort an average but barely moves a median. */
export function median(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (present.length === 0) {
    return null;
  }
  const mid = Math.floor(present.length / 2);
  return present.length % 2 === 0 ? (present[mid - 1] + present[mid]) / 2 : present[mid];
}

/** Percentile rank (0..1) of each value within `values`, null values passed through as null.
 * Needs at least 2 present values to produce a meaningful rank (a single value is trivially
 * "everyone", which isn't a useful percentile) — returns all-null otherwise. Shared by
 * lib/screener.ts's composite score and lib/momentum.ts's momentum/quality-value ranking. */
export function percentileRanks(values: (number | null)[]): (number | null)[] {
  const present = values
    .map((v, i): [number, number | null] => [i, v])
    .filter((pair): pair is [number, number] => pair[1] !== null);
  if (present.length < 2) {
    return values.map(() => null);
  }
  const ordered = [...present].sort((a, b) => a[1] - b[1]);
  const ranks: (number | null)[] = values.map(() => null);
  ordered.forEach(([i], rank) => {
    ranks[i] = rank / (ordered.length - 1);
  });
  return ranks;
}
