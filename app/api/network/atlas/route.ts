import { buildNetworkAtlas } from "@/lib/domain/network-atlas-data";
export const runtime = "nodejs";
export function GET() {
  return Response.json(buildNetworkAtlas(), {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
