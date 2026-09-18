"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addTicker(formData: FormData) {
  const ticker = String(formData.get("ticker") ?? "")
    .trim()
    .toUpperCase();
  if (!ticker) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  await supabase.from("watchlists").insert({ user_id: user.id, ticker });
  revalidatePath("/watchlist");
}

export async function removeTicker(formData: FormData) {
  const ticker = String(formData.get("ticker") ?? "");
  if (!ticker) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  await supabase.from("watchlists").delete().eq("user_id", user.id).eq("ticker", ticker);
  revalidatePath("/watchlist");
}
