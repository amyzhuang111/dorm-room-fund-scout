import fs from "node:fs";
import path from "node:path";
import { buildNetworkMap } from "@/lib/domain/network-map";

export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800",
};

export function GET() {
  try {
    const file = fs.readFileSync(path.join(process.cwd(), "public", "data", "network-map.json"));
    return new Response(file, { headers: HEADERS });
  } catch {
    return Response.json(buildNetworkMap(), { headers: HEADERS });
  }
}
