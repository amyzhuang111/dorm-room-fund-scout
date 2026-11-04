import { buildNetworkAtlas } from "@/lib/domain/network-atlas-data";
export const runtime = "nodejs";
export function GET() {
  return Response.json(buildNetworkAtlas(), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
