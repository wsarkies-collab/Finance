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
