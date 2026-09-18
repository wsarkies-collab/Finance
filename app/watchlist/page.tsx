import { redirect } from "next/navigation";
import { RankedTable } from "@/components/RankedTable";
import { runScreen } from "@/lib/screen-service";
import { createClient } from "@/lib/supabase/server";
import { addTicker, removeTicker } from "./actions";
import { signOut } from "../login/actions";

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rows } = await supabase
    .from("watchlists")
    .select("ticker")
    .eq("user_id", user.id)
    .order("added_at", { ascending: true });

  const tickers = (rows ?? []).map((r) => r.ticker as string);
  const reports = tickers.length > 0 ? await runScreen(tickers) : [];

  return (
    <>
      <h1>Your watchlist</h1>
      <p className="muted">
        Signed in as {user.email}. <form action={signOut} style={{ display: "inline" }}>
          <button type="submit">Log out</button>
        </form>
      </p>

      <form action={addTicker} className="search-form">
        <input name="ticker" placeholder="Add a ticker, e.g. AAPL" required />
        <button type="submit">Add</button>
      </form>

      <RankedTable
        reports={reports}
        renderRowExtra={(r) => (
          <form action={removeTicker} className="watchlist-row">
            <input type="hidden" name="ticker" value={r.ticker} />
            <button type="submit">Remove</button>
          </form>
        )}
      />
    </>
  );
}
