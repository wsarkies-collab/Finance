"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Replaces the signed-in user's saved portfolio with exactly the given ticker list — unlike
 * the Watchlist's incremental add/remove, the Portfolio Calculator already manages its full
 * ticker list client-side, so Save should make the saved state match what's on screen, not
 * merge with whatever was saved before.
 */
export async function savePortfolio(tickers: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const normalized = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];

  await supabase.from("portfolio_tickers").delete().eq("user_id", user.id);
  if (normalized.length > 0) {
    await supabase.from("portfolio_tickers").insert(normalized.map((ticker) => ({ user_id: user.id, ticker })));
  }
  revalidatePath("/portfolio");
}
