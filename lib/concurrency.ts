/** Runs `fn` over `items` with at most `limit` in flight at once, preserving input order in
 * the returned settled results (same shape as Promise.allSettled). Used wherever a batch of
 * per-ticker network calls could otherwise fire all at once and overwhelm yfinance/Vercel's
 * own concurrency limits — see lib/momentum-service.ts and lib/screen-service.ts. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(null).map(worker));
  return results;
}
