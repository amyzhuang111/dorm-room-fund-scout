import { selectedEnrollment } from "@/lib/domain/founder-status";
import { buildScoutNetwork } from "@/lib/domain/network";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const university = url.searchParams.get("university") || undefined;
  const sector = url.searchParams.get("sector") || undefined;
  const graph = buildScoutNetwork(university, {
    sector,
    enrollment: selectedEnrollment(url.searchParams.get("enroll") ?? undefined),
  });
  return Response.json(graph, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
