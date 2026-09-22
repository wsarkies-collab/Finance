import { runScreen } from "@/lib/screen-service";
import { getUniverseTickers, isKnownSector, type Market } from "@/lib/momentum-universe";

const TICKER_PATTERN = /^[A-Z.-]{1,10}$/i;
const VALID_MARKETS: Market[] = ["SP500", "ASX", "all"];
// Screening a whole sector/market group can mean 100+ tickers (the largest real group is
// Financials across both markets, ~110) — well above the 25-ticker manual-search cap.
const MAX_BROWSE_TICKERS = 150;

// Browsing a large sector means fetching fundamentals for 100+ tickers on a cold cache —
// slower than the default Vercel function budget even with the concurrency limiter in
// lib/screen-service.ts.
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market");
  const sector = url.searchParams.get("sector");

  const growthRateParam = url.searchParams.get("growthRate");
  const growthRate = growthRateParam !== null ? Number(growthRateParam) : undefined;
  if (growthRate !== undefined && !Number.isFinite(growthRate)) {
    return Response.json({ error: "growthRate must be a number" }, { status: 400 });
  }

  if (market || sector) {
    if (!market || !VALID_MARKETS.includes(market as Market)) {
      return Response.json({ error: `market query param must be one of ${VALID_MARKETS.join(", ")}` }, { status: 400 });
    }
    if (!sector || !isKnownSector(sector)) {
      return Response.json({ error: "sector query param is missing or not a recognized sector" }, { status: 400 });
    }
    const tickers = getUniverseTickers(market as Market, sector);
    const reports = await runScreen(tickers, growthRate, MAX_BROWSE_TICKERS);
    return Response.json({ reports, universeCount: tickers.length });
  }

  const tickers = (url.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tickers.length === 0) {
    return Response.json(
      { error: "either tickers (e.g. ?tickers=AAPL,MSFT) or market+sector query params are required" },
      { status: 400 },
    );
  }
  if (!tickers.every((t) => TICKER_PATTERN.test(t))) {
    return Response.json({ error: "invalid ticker format" }, { status: 400 });
  }

  const reports = await runScreen(tickers, growthRate);
  return Response.json({ reports });
}
