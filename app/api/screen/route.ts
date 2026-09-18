import { runScreen } from "@/lib/screen-service";

const TICKER_PATTERN = /^[A-Z.-]{1,10}$/i;

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

  const growthRateParam = url.searchParams.get("growthRate");
  const growthRate = growthRateParam !== null ? Number(growthRateParam) : undefined;
  if (growthRate !== undefined && !Number.isFinite(growthRate)) {
    return Response.json({ error: "growthRate must be a number" }, { status: 400 });
  }

  const reports = await runScreen(tickers, growthRate);
  return Response.json({ reports });
}
