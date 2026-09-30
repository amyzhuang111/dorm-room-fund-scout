import fs from "node:fs";
import path from "node:path";
import { countCandidateProjects, listCampusArcs, listCandidateProjects, listUniversities } from "@/lib/domain/queries";

export const dynamic = "force-dynamic";

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800",
};

function cached(name: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "data", name), "utf8");
  } catch {
    return null;
  }
}

export function GET(request: Request) {
  const part = new URL(request.url).searchParams.get("part");
  if (part === "map") {
    const file = cached("globe-map.json");
    if (file) return new Response(file, { headers: HEADERS });
    return Response.json(
      { universities: listUniversities(), arcs: listCampusArcs(), candidateCount: countCandidateProjects() },
      { headers: HEADERS },
    );
  }
  return Response.json(
    {
      universities: listUniversities(),
      arcs: listCampusArcs(),
      candidates: listCandidateProjects(),
    },
    { headers: HEADERS },
  );
}
