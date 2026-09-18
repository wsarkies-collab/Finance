import { getProjections } from "@/lib/projection-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker");
  if (!ticker) {
    return Response.json({ error: "ticker query param required" }, { status: 400 });
  }

  const result = await getProjections(ticker);
  if (!result) {
    return Response.json({ error: `couldn't resolve fundamentals for ${ticker}` }, { status: 404 });
  }

  return Response.json(result);
}
