import { ScreenerTabs } from "@/components/ScreenerTabs";
import { getSectorCounts } from "@/lib/momentum-universe";

export default function HomePage() {
  return (
    <>
      <h1>Stock valuation screener</h1>
      <p className="muted">
        Screens tickers across DCF, Graham Number, PEG, EV/EBITDA, FCF yield, and
        P/B-vs-ROE, then ranks them by a composite score (higher = more attractive).
      </p>
      <ScreenerTabs sectorCounts={getSectorCounts()} />
    </>
  );
}
