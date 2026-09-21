import { getPortfolioAnalysis } from "@/lib/portfolio-service";

const TICKER_PATTERN = /^[A-Z^.-]{1,10}$/i;

// Up to ~30 tickers plus a couple of benchmark fetches, each an independent live
// price-history call — slower than the default Vercel function budget.
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tickers = (url.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tickers.length === 0) {
    return Response.json({ error: "tickers query param required, e.g. ?tickers=AAPL,MSFT" }, { status: 400 });
  }
  if (!tickers.every((t) => TICKER_PATTERN.test(t))) {
    return Response.json({ error: "invalid ticker format" }, { status: 400 });
  }

  const analysis = await getPortfolioAnalysis(tickers);
  return Response.json(analysis);
}
