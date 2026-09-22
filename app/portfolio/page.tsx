import { redirect } from "next/navigation";
import { PortfolioCalculatorForm } from "@/components/PortfolioCalculatorForm";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

export default async function PortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rows } = await supabase
    .from("portfolio_tickers")
    .select("ticker")
    .eq("user_id", user.id)
    .order("added_at", { ascending: true });

  const savedTickers = (rows ?? []).map((r) => r.ticker as string);

  return (
    <>
      <h1>Portfolio calculator</h1>
      <p className="muted">
        Signed in as {user.email}.{" "}
        <form action={signOut} style={{ display: "inline" }}>
          <button type="submit">Log out</button>
        </form>
      </p>
      <PortfolioCalculatorForm savedTickers={savedTickers} />
    </>
  );
}
