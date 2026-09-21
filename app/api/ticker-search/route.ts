import { searchTickers } from "@/lib/ticker-search-client";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q || !q.trim()) {
    return Response.json({ matches: [] });
  }

  const matches = await searchTickers(q.trim());
  return Response.json({ matches });
}
