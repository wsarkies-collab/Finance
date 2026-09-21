import { getIndustryComparison } from "@/lib/industry-comparison-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker");
  if (!ticker) {
    return Response.json({ error: "ticker query param required" }, { status: 400 });
  }
  const industry = url.searchParams.get("industry");
  const sector = url.searchParams.get("sector");

  const result = await getIndustryComparison(ticker, industry, sector);
  return Response.json(result);
}
