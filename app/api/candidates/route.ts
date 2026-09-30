import fs from "node:fs";
import path from "node:path";
import { listCandidateProjects } from "@/lib/domain/queries";

export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800",
};

export function GET() {
  const file = path.join(process.cwd(), "public", "data", "candidates.json");
  try {
    return new Response(fs.readFileSync(file), { headers: HEADERS });
  } catch {
    return Response.json(listCandidateProjects(), { headers: HEADERS });
  }
}
